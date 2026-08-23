import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import * as path from "node:path";
import {
  loadApiTargetsRegistry,
  type RegistryTarget,
  resolveTypesPackageRoot,
} from "./api-registry";
import type { SelectedApiSurface } from "./api-surface";
import { readCliVersion } from "./cli-version";
import type { DefoldChannel } from "./defold-target";
import { formatJsonLikeBiome } from "./format-json";

export const MATERIALIZED_ROOT = ".defold-types";

// The package specifier every documented example imports. A materialized pin
// must bind this, not only the type roots: the installed package's entrypoints
// side-effect-import the *current* generated modules, which declare the same
// ambient namespaces the pinned surface declares, and TypeScript merges them
// program-wide — so one idiomatic import anywhere defeats the pin everywhere.
export const TYPES_PACKAGE = "@defold-typescript/types";

// The subdirectory holding the module entrypoint a pinned `paths` remap binds.
// Kept apart from the surface's `index.d.ts`, which is the ambient entrypoint
// `types`/`typeRoots` loads: one file answers "which namespaces exist", the
// other "what does importing the package give you".
const PINNED_ROOT_DIR = "root";

// The entrypoint needs one ambient-free module carrying the *whole* root export
// set. The accumulated `./src/` subpaths are only the modules that happened to
// be published individually, which is a strict subset — re-exporting just those
// makes a pin delete package exports instead of narrowing engine namespaces.
const FACADE_SUBPATH = "api";

// A materialized surface is a function of *(Defold target x toolchain version)*,
// so both axes belong in its directory name — otherwise a toolchain upgrade
// rewrites the previous surface in place and the change it made is unobservable.
// `@` is the separator: absent from the NTFS reserved set, legal on POSIX,
// already proven by npm scope directories, and needing no shell quoting.
const SURFACE_STAMP_SEPARATOR = "@";

export function surfaceDirName(surfaceId: string, cliVersion: string): string {
  return `${surfaceId}${SURFACE_STAMP_SEPARATOR}${cliVersion}`;
}

// Whether a `types` entry names the given surface axis — the pre-versioning bare
// name, or any `<base>@<version>` this file's own writer produces. Recognizing a
// name has to live beside writing it: a second reader restating the separator is
// how the versioned library entry got dropped on the engine re-point.
export function namesSurfaceAxis(base: string, entry: unknown): boolean {
  return (
    typeof entry === "string" &&
    (entry === base || entry.startsWith(`${base}${SURFACE_STAMP_SEPARATOR}`))
  );
}

export type SurfaceStampStatus = "match" | "mismatch" | "missing";

// Whether a surface directory's `package.json` stamp agrees with the toolchain
// version its own name claims. A disagreement means the directory was
// hand-copied, renamed, or half-written, so its contents cannot be attributed to
// the toolchain the name names.
export function surfaceStampStatus(surfaceDir: string): SurfaceStampStatus {
  const dirName = path.basename(surfaceDir);
  const separator = dirName.lastIndexOf(SURFACE_STAMP_SEPARATOR);
  const claimed = separator === -1 ? null : dirName.slice(separator + 1);
  let stamp: unknown;
  try {
    stamp = (
      JSON.parse(readFileSync(path.join(surfaceDir, "package.json"), "utf8")) as {
        version?: unknown;
      }
    ).version;
  } catch {
    return "missing";
  }
  if (typeof stamp !== "string") {
    return "missing";
  }
  return stamp === claimed ? "match" : "mismatch";
}

// Retract the stamp for the duration of a materialization. Re-materializing the
// same `(target, cliVersion)` lands in a directory whose existing stamp already
// equals the new one, so moving the write to the end is not enough on its own:
// the previous run's stamp would vouch for the whole rewrite.
function clearSurfaceStamp(absDir: string): void {
  rmSync(path.join(absDir, "package.json"), { force: true });
}

// Drive-rooted (`X:\`, `X:/`) and UNC (`\\server\share`) roots, neither of which
// `path.posix.isAbsolute` recognizes.
const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\)/;

export function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || WINDOWS_ABSOLUTE.test(value);
}

export function toPosixSeparators(value: string): string {
  return value.replaceAll("\\", "/");
}

// Where a config's `paths` substitutions into the materialized root resolve
// from. With no `baseUrl` that is the config's own directory, so the prefix is
// the one `typeRoots` uses; when the config declares `baseUrl`, substitutions
// resolve against that directory instead — a relative `baseUrl` in an extended
// config resolves against the config that declared it. `depth` is how far the
// config sits below the project root: 0 for the root config, one per directory
// for a wall.
export function materializedPathsBase(
  depth: number,
  baseUrl: string | undefined,
  baseDir: string | undefined,
): string {
  if (baseUrl === undefined) {
    return `${"../".repeat(depth)}${MATERIALIZED_ROOT}`;
  }
  if (isAbsolutePath(baseUrl)) {
    // Without a base directory there is nothing to measure against, and
    // `path.posix.relative` would silently measure against the *process* cwd. A
    // redirect that resolves beats one anchored to whatever directory the CLI
    // happened to run in; only a hand-constructed `rootAliases` reaches this.
    if (baseDir === undefined) {
      return `${"../".repeat(depth)}${MATERIALIZED_ROOT}`;
    }
    // The flavor comes from `baseUrl`; a cross-flavor pairing is not modeled,
    // because a Windows project has a Windows `cwd`.
    const flavor = WINDOWS_ABSOLUTE.test(baseUrl) ? path.win32 : path.posix;
    return toPosixSeparators(flavor.relative(baseUrl, flavor.join(baseDir, MATERIALIZED_ROOT)));
  }
  return path.posix.relative(path.posix.normalize(toPosixSeparators(baseUrl)), MATERIALIZED_ROOT);
}

// `paths` targets are module specifiers, and TS5090 rejects one that is neither
// `./`-prefixed nor absolute while `baseUrl` is unset. A bare `.defold-types`
// starts with a dot but is still non-relative to the compiler.
function relativeSpecifier(value: string): string {
  return value.startsWith("./") || value.startsWith("../") || isAbsolutePath(value)
    ? value
    : `./${value}`;
}

// The materialized surface must not mint its own copy of the branded engine
// primitives: `Hash` & co. are `unique symbol`-branded per declaration, so a
// copied `core-types.d.ts` is nominally distinct from the installed
// `@defold-typescript/types` a consumer imports from, and the two never unify
// (a consumer comparing `message_id === hash(...)` or assigning an imported
// `Hash` would get TS2367/TS2741). Re-export the package's copy instead so the
// ambient surface shares one brand. `engine-globals.d.ts` stays copied; its
// relative `./core-types` import resolves to this re-export.
const CORE_TYPES_REEXPORT = 'export * from "@defold-typescript/types/core-types";\n';

export interface MaterializeApiSurfaceOptions {
  readonly cwd: string;
  readonly surface: SelectedApiSurface;
  readonly sourceGeneratedDir: string | null;
  // Defaults to the running package's version, so a consumer's directory always
  // names the toolchain that actually wrote it. Injected by tests.
  readonly cliVersion?: string;
}

export interface MaterializeApiSurfaceResult {
  readonly materializedDir: string | null;
  readonly active: string | null;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${formatJsonLikeBiome(value)}\n`);
}

function listDts(dir: string): string[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith(".d.ts"))
    .sort();
}

// The subpaths the installed types package publishes, so a carried declaration
// that reaches a `src/` sibling can name the published module instead of a
// surface file that either does not exist or — as with `editor` — exists as a
// different module (the generated `editor` namespace, not `src/editor.ts`).
function publishedSubpathTargets(typesRoot: string | null): ReadonlyMap<string, string | null> {
  const targets = new Map<string, string | null>();
  if (typesRoot === null) {
    return targets;
  }
  try {
    const pkg = JSON.parse(readFileSync(path.join(typesRoot, "package.json"), "utf8")) as {
      exports?: Record<string, unknown>;
    };
    for (const [key, entry] of Object.entries(pkg.exports ?? {})) {
      if (!key.startsWith("./")) {
        continue;
      }
      const types = (entry as { types?: unknown } | null)?.types;
      targets.set(key.slice(2), typeof types === "string" ? types : null);
    }
  } catch {
    return new Map();
  }
  return targets;
}

function publishedSubpaths(typesRoot: string | null): ReadonlySet<string> {
  return new Set(publishedSubpathTargets(typesRoot).keys());
}

// The subpaths a pinned root entrypoint may re-export: the version-independent
// `src/` modules (`lifecycle`, `core-types`, `editor`, `timers`) that carry the
// package's exported API without declaring anything ambient. A `generated/`
// target is a kind index whose ambient namespaces are exactly what the pin
// narrows, and a JSON data file is not a module at all — re-exporting either
// would load the installed surface straight back over the pinned one.
function reexportableSubpaths(typesRoot: string | null): string[] {
  return [...publishedSubpathTargets(typesRoot)]
    .filter(([, target]) => target?.startsWith("./src/"))
    .map(([subpath]) => subpath)
    .sort();
}

// The pinned module entrypoint. It loads the pinned ambient surface and then
// re-exports the package's own API, so remapping the bare specifier narrows the
// namespaces without also taking `defineScript` & co. away from every consumer
// that imports them. Rewritten from scratch each run; removed outright when the
// installed package does not publish the facade, so the remap has no dangling
// target and never a partial entrypoint.
export function writePinnedRootEntrypoint(absDir: string, typesRoot: string | null): void {
  const rootDir = path.join(absDir, PINNED_ROOT_DIR);
  const subpaths = reexportableSubpaths(typesRoot);
  // Without the facade an older installed package would yield a partial
  // entrypoint. Write nothing instead and let `pinnedRootPaths` omit the bare
  // specifier: the pin degrades to unbound, which beats a subset.
  if (!subpaths.includes(FACADE_SUBPATH)) {
    rmSync(rootDir, { recursive: true, force: true });
    return;
  }
  mkdirSync(rootDir, { recursive: true });
  // The remaining subpaths are mostly redundant re-exports of the same
  // declarations, but `timers` is not in the facade, and keeping the loop
  // spares the emitter a hand-maintained exclusion list.
  const body = [
    `import "../index";`,
    "",
    `export * from "${TYPES_PACKAGE}/${FACADE_SUBPATH}";`,
    ...subpaths
      .filter((subpath) => subpath !== FACADE_SUBPATH)
      .map((subpath) => `export * from "${TYPES_PACKAGE}/${subpath}";`),
    "",
  ].join("\n");
  writeFileSync(path.join(rootDir, "index.d.ts"), body);
}

// The `paths` substitutions that bind the package specifier — and every subpath
// the surface can actually serve — to the materialized surface. A subpath the
// surface did not write is left resolving to the installed package: a dangling
// target does not narrow the specifier, it disables checking for it.
export function pinnedRootPaths(
  base: string,
  dirName: string,
  surfaceDir: string,
  subpaths: ReadonlySet<string>,
): Record<string, string[]> {
  const paths: Record<string, string[]> = {};
  const target = (...segments: string[]): string[] => [
    relativeSpecifier(path.posix.join(base, dirName, ...segments)),
  ];

  if (existsSync(path.join(surfaceDir, PINNED_ROOT_DIR, "index.d.ts"))) {
    paths[TYPES_PACKAGE] = target(PINNED_ROOT_DIR, "index.d.ts");
  }
  for (const subpath of [...subpaths].sort()) {
    if (existsSync(path.join(surfaceDir, subpath, "index.d.ts"))) {
      paths[`${TYPES_PACKAGE}/${subpath}`] = target(subpath, "index.d.ts");
    } else if (existsSync(path.join(surfaceDir, "kinds", `${subpath}.d.ts`))) {
      paths[`${TYPES_PACKAGE}/${subpath}`] = target("kinds", `${subpath}.d.ts`);
    }
  }
  return paths;
}

function isManagedPathsKey(key: string): boolean {
  return key === TYPES_PACKAGE || key.startsWith(`${TYPES_PACKAGE}/`);
}

// A redirect into the CLI-owned `.defold-types` tree is one the CLI wrote. An
// entry on the same key pointing anywhere else is the project's own alias and
// survives both the pinned write and the un-pin — the same replace-vs-preserve
// rule the directory walls use, minus their `extends`-shadowing mirror, which
// degenerates at the root config (nothing above it to inherit from, so every
// alias would look like a mirror and be deleted on un-pin).
export function isManagedPathsTarget(targets: unknown): boolean {
  return (
    Array.isArray(targets) &&
    targets.length > 0 &&
    targets.every(
      (entry) =>
        typeof entry === "string" &&
        toPosixSeparators(entry).split("/").includes(MATERIALIZED_ROOT),
    )
  );
}

// Returns `undefined` when nothing is left, which is the signal to delete the
// key: `paths: {}` is not the same as no `paths` for a config that inherits.
function mergePinnedRootPaths(
  existing: Record<string, string[]> | undefined,
  managed: Record<string, string[]>,
): Record<string, string[]> | undefined {
  const merged: Record<string, string[]> = { ...existing };
  for (const [key, targets] of Object.entries(merged)) {
    if (managed[key] === undefined && isManagedPathsKey(key) && isManagedPathsTarget(targets)) {
      delete merged[key];
    }
  }
  for (const [key, targets] of Object.entries(managed)) {
    const prior = merged[key];
    if (prior === undefined || isManagedPathsTarget(prior)) {
      merged[key] = targets;
    }
  }
  return Object.keys(merged).length === 0 ? undefined : merged;
}

// A carried module resolves the surface's `core-types` re-export from wherever it
// landed: `./core-types` at the root, `../core-types` one level down. Without
// that re-export in the surface at all, the published subpath is the only target
// that resolves.
function retargetCoreTypes(contents: string, depth: number, surfaceHasCoreTypes: boolean): string {
  const target = surfaceHasCoreTypes
    ? `${depth === 0 ? "./" : "../".repeat(depth)}core-types`
    : "@defold-typescript/types/core-types";
  return contents.replace(/from "[^"]*\/src\/core-types"/g, `from "${target}"`);
}

function findSrcDeclaration(srcDir: string, name: string): string | null {
  for (const candidate of [`${name}.d.ts`, `${name}.ts`]) {
    const full = path.join(srcDir, candidate);
    if (existsSync(full)) {
      return full;
    }
  }
  return null;
}

interface EditorCarryPlan {
  // Surface-relative destination -> contents to write.
  readonly files: ReadonlyMap<string, string>;
  readonly kindIndex: string;
  // Surface-root basenames the plan writes, so the stale-module prune keeps them.
  readonly rootNames: readonly string[];
}

interface EditorCarryOptions {
  readonly sourceGeneratedDir: string;
  readonly srcDir: string;
  readonly typesRoot: string | null;
  // Surface-root module basenames already derived from `src/` (the overload set,
  // the `core-types` re-export, `engine-globals`). A carried declaration reaching
  // one of these keeps its relative specifier.
  readonly srcDerived: ReadonlySet<string>;
  readonly surfaceHasCoreTypes: boolean;
  // Surface-relative paths the runtime copy already wrote.
  readonly alreadyWritten: ReadonlySet<string>;
}

// Everything a target's own `kinds/editor-script.d.ts` names, retargeted for the
// materialized layout. Returns `null` when the target declares no editor
// document, and also when any file the index names is missing — an index with a
// dangling import is worse than no editor kind at all, because
// `resolveActivePinnedSurface` would then recognise the surface as pinned.
function planEditorCarry(opts: EditorCarryOptions): EditorCarryPlan | null {
  const indexPath = path.join(opts.sourceGeneratedDir, "kinds", "editor-script.d.ts");
  if (!existsSync(indexPath)) {
    return null;
  }
  const indexContents = readFileSync(indexPath, "utf8");
  const kindsDir = path.dirname(indexPath);

  const files = new Map<string, string>();
  const rootNames: string[] = [];
  const handAuthored: string[] = [];

  for (const match of indexContents.matchAll(/import "([^"]+)";/g)) {
    const spec = match[1] ?? "";
    if (!spec.startsWith(".")) {
      continue;
    }
    const fromSrc = /(?:^|\/)src\/(.+)$/.exec(spec);
    if (fromSrc?.[1] !== undefined) {
      handAuthored.push(fromSrc[1]);
      continue;
    }
    const abs = `${path.resolve(kindsDir, spec)}.d.ts`;
    const rel = path.relative(opts.sourceGeneratedDir, abs);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return null;
    }
    if (!existsSync(abs)) {
      return null;
    }
    const relPosix = rel.split(path.sep).join("/");
    if (opts.alreadyWritten.has(relPosix)) {
      continue;
    }
    files.set(
      relPosix,
      retargetCoreTypes(
        readFileSync(abs, "utf8"),
        relPosix.split("/").length - 1,
        opts.surfaceHasCoreTypes,
      ),
    );
  }

  // The hand-authored ambients sit at the surface root, so their own relative
  // specifiers are resolved against the same root: a name the surface already
  // derives from `src/` stays relative, a published subpath is named outright,
  // and anything else is pulled in as another root file. Iterative because a
  // pulled-in file may name further siblings.
  const published = publishedSubpaths(opts.typesRoot);
  const pending = [...handAuthored];
  const carried = new Map<string, string>();
  while (pending.length > 0) {
    const name = pending.shift() as string;
    if (carried.has(name)) {
      continue;
    }
    const source = findSrcDeclaration(opts.srcDir, name);
    if (source === null) {
      return null;
    }
    const contents = readFileSync(source, "utf8");
    carried.set(name, contents);
    for (const match of contents.matchAll(/from "(\.[^"]*)"/g)) {
      const dep = path.basename(match[1] ?? "");
      if (dep === "" || opts.srcDerived.has(dep) || published.has(dep)) {
        continue;
      }
      pending.push(dep);
    }
  }

  for (const [name, contents] of carried) {
    const rewritten = contents.replace(/from "(\.[^"]*)"/g, (whole, spec: string) => {
      const dep = path.basename(spec);
      if (opts.srcDerived.has(dep) || carried.has(dep)) {
        return `from "./${dep}"`;
      }
      return published.has(dep) ? `from "@defold-typescript/types/${dep}"` : whole;
    });
    files.set(`${name}.d.ts`, rewritten);
    rootNames.push(`${name}.d.ts`);
  }

  const kindIndex = indexContents
    .replace(/import "(?:\.\.\/)+src\/([^"]+)";/g, 'import "../$1";')
    .replace(/from "(?:\.\.\/)+src\/([^"]+)"/g, 'from "@defold-typescript/types/$1"');

  return { files, kindIndex, rootNames };
}

export function materializeApiSurface(
  opts: MaterializeApiSurfaceOptions,
): MaterializeApiSurfaceResult {
  const { cwd, surface, sourceGeneratedDir } = opts;
  if (!surface.available || surface.surfaceId === null || sourceGeneratedDir === null) {
    return { materializedDir: null, active: null };
  }

  const { surfaceId } = surface;
  const cliVersion = opts.cliVersion ?? readCliVersion();
  const dirName = surfaceDirName(surfaceId, cliVersion);
  const relDir = path.posix.join(MATERIALIZED_ROOT, dirName);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, dirName);
  mkdirSync(absDir, { recursive: true });
  clearSurfaceStamp(absDir);

  const sources = listDts(sourceGeneratedDir).filter((file) => file !== "index.d.ts");

  // The `*-overloads`/guard augmentations and the `core-types` they import live
  // in the types package `src/` (sibling of `generated/`), not among the
  // generated module surfaces. The full-script kind entrypoint
  // (`generated/kinds/script.d.ts`) already enumerates the exact set a complete
  // surface needs, so derive from it — that single source of truth kills the
  // drift trap that dropped `vmath-overloads`/`window-event-guard` (bug-42).
  // `engine-globals` is excluded here; it rides the includeEngineGlobals branch
  // below. Synthetic fixtures with no kinds entrypoint fall back to the
  // historical trio; a missing sibling `src/` filters everything out.
  const typesRoot = resolveTypesPackageRoot();
  const relativeToTypesRoot = typesRoot ? path.relative(typesRoot, sourceGeneratedDir) : "..";
  const usesPackagedSurface =
    typesRoot !== null &&
    !path.isAbsolute(relativeToTypesRoot) &&
    relativeToTypesRoot !== ".." &&
    !relativeToTypesRoot.startsWith(`..${path.sep}`);
  const srcDir = usesPackagedSurface
    ? path.join(typesRoot, "src")
    : path.resolve(sourceGeneratedDir, "..", "src");
  const scriptKindEntry = usesPackagedSurface
    ? path.join(typesRoot, "generated", "kinds", "script.d.ts")
    : path.join(sourceGeneratedDir, "kinds", "script.d.ts");
  const derivedOverloads = existsSync(scriptKindEntry)
    ? [...readFileSync(scriptKindEntry, "utf8").matchAll(/import "\.\.\/\.\.\/src\/([^"]+)";/g)]
        .map((match) => `${match[1]}.d.ts`)
        .filter((file) => file !== "engine-globals.d.ts")
    : ["msg-overloads.d.ts", "message-guard.d.ts", "go-overloads.d.ts"];
  const overloads = derivedOverloads.filter((file) => existsSync(path.join(srcDir, file)));
  const coreTypesSrc = path.join(srcDir, "core-types.ts");
  const includeCoreTypes = overloads.length > 0 && existsSync(coreTypesSrc);
  const engineGlobalsSrc = path.join(srcDir, "engine-globals.d.ts");
  const includeEngineGlobals = includeCoreTypes && existsSync(engineGlobalsSrc);

  const srcDerived = new Set(overloads.map((file) => file.replace(/\.d\.ts$/, "")));
  if (includeCoreTypes) {
    srcDerived.add("core-types");
  }
  if (includeEngineGlobals) {
    srcDerived.add("engine-globals");
  }

  const editorPlan = planEditorCarry({
    sourceGeneratedDir,
    srcDir,
    typesRoot,
    srcDerived,
    surfaceHasCoreTypes: includeCoreTypes,
    alreadyWritten: new Set(sources),
  });

  const wanted = new Set(sources);
  for (const file of overloads) {
    wanted.add(file);
  }
  if (includeCoreTypes) {
    wanted.add("core-types.d.ts");
  }
  if (includeEngineGlobals) {
    wanted.add("engine-globals.d.ts");
  }
  for (const file of editorPlan?.rootNames ?? []) {
    wanted.add(file);
  }

  for (const existing of readdirSync(absDir)) {
    if (existing.endsWith(".d.ts") && existing !== "index.d.ts" && !wanted.has(existing)) {
      rmSync(path.join(absDir, existing));
    }
  }

  for (const file of sources) {
    const declaration = readFileSync(path.join(sourceGeneratedDir, file), "utf8").replace(
      /from "[^"]*\/src\/core-types"/g,
      'from "./core-types"',
    );
    writeFileSync(path.join(absDir, file), declaration);
  }
  if (includeCoreTypes) {
    writeFileSync(path.join(absDir, "core-types.d.ts"), CORE_TYPES_REEXPORT);
  }
  if (includeEngineGlobals) {
    writeFileSync(path.join(absDir, "engine-globals.d.ts"), readFileSync(engineGlobalsSrc, "utf8"));
  }
  for (const file of overloads) {
    writeFileSync(path.join(absDir, file), readFileSync(path.join(srcDir, file), "utf8"));
  }

  const modules = [...sources, ...overloads].map((file) => file.replace(/\.d\.ts$/, ""));
  if (includeEngineGlobals) {
    modules.push("engine-globals");
  }
  const imports = modules.map((mod) => `import "./${mod}";`).join("\n");
  writeFileSync(path.join(absDir, "index.d.ts"), `${imports}\n\nexport {};\n`);

  writePinnedRootEntrypoint(absDir, typesRoot);

  // The surface directory is reused across builds, so the editor carry-over is
  // rewritten from scratch every run: a target that stopped declaring an editor
  // document must lose its `kinds/` too, or `resolveActivePinnedSurface` keeps
  // recognising the surface as pinned against a stale mirror.
  rmSync(path.join(absDir, "kinds"), { recursive: true, force: true });
  rmSync(path.join(absDir, "editor-vm"), { recursive: true, force: true });
  if (editorPlan !== null) {
    for (const [rel, contents] of editorPlan.files) {
      const target = path.join(absDir, ...rel.split("/"));
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, contents);
    }
    const kindsDir = path.join(absDir, "kinds");
    mkdirSync(kindsDir, { recursive: true });
    writeFileSync(path.join(kindsDir, "editor-script.d.ts"), editorPlan.kindIndex);
  }

  // `name` keeps the bare surface id: a second `@` is not a legal npm name. The
  // toolchain axis rides `version`, which is also what `surfaceStampStatus`
  // reads back to tell a surface apart from a directory merely named like one.
  // Last write of the function: the stamp only ever vouches for a surface whose
  // every other file has already landed.
  writeJson(path.join(absDir, "package.json"), {
    name: `@defold-typescript/materialized-${surfaceId}`,
    version: cliVersion,
    types: "index.d.ts",
  });

  return { materializedDir: relDir, active: surfaceId };
}

export function ensureGitignoreLine(cwd: string, line: string): void {
  const gitignorePath = path.join(cwd, ".gitignore");
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${line}\n`);
    return;
  }
  const existing = readFileSync(gitignorePath, "utf8");
  const present = new Set(existing.split("\n").map((entry) => entry.trim()));
  if (present.has(line)) {
    return;
  }
  const prefix = existing.endsWith("\n") || existing === "" ? "" : "\n";
  writeFileSync(gitignorePath, `${existing}${prefix}${line}\n`);
}

export function ensureMaterializedReference(cwd: string, materializedDir: string | null): void {
  const dirName = materializedDir === null ? null : path.posix.basename(materializedDir);

  const tsconfigPath = path.join(cwd, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const current = tsconfig.compilerOptions ?? {};
    const currentPaths =
      current.paths !== null && typeof current.paths === "object"
        ? (current.paths as Record<string, string[]>)
        : undefined;
    const baseUrl = typeof current.baseUrl === "string" ? current.baseUrl : undefined;
    // The root config sits at the project root, so its substitutions resolve
    // from depth 0 — modulo a `baseUrl`, which moves the base out from under it
    // exactly as it does for a wall.
    const managedPaths =
      dirName === null
        ? {}
        : pinnedRootPaths(
            materializedPathsBase(0, baseUrl, cwd),
            dirName,
            path.join(cwd, MATERIALIZED_ROOT, dirName),
            publishedSubpaths(resolveTypesPackageRoot()),
          );
    const desiredPaths = mergePinnedRootPaths(currentPaths, managedPaths);

    if (dirName === null) {
      // No surface to point at: withdraw what the CLI wrote and touch nothing
      // else — not `types`, not `typeRoots`, not the project's own aliases.
      if (JSON.stringify(desiredPaths) !== JSON.stringify(currentPaths)) {
        const options = { ...current };
        if (desiredPaths === undefined) {
          delete options.paths;
        } else {
          options.paths = desiredPaths;
        }
        tsconfig.compilerOptions = options;
        writeJson(tsconfigPath, tsconfig);
      }
      return;
    }

    // The sibling `extensions` and `libraries` surfaces
    // (ensureExtensionTypesReference / ensureLibraryTypesReference) coexist with
    // the engine surface under one typeRoots; repointing the engine entry must
    // carry any existing sibling types entry through, not clobber it. Match on
    // the surface axis rather than two literal names, so a sibling that carries
    // a toolchain version in its entry survives, and keep the order the file
    // already had rather than imposing one — carrying the input through
    // unchanged is what leaves the next call with nothing to rewrite.
    const currentTypes = Array.isArray(current.types) ? (current.types as unknown[]) : [];
    const desiredTypes = [
      dirName,
      ...currentTypes.filter(
        (entry) => namesSurfaceAxis("extensions", entry) || namesSurfaceAxis("libraries", entry),
      ),
    ];
    // Skip the write when already repointed so the file keeps its existing
    // formatting (a consumer's Biome/Prettier shape) instead of churning to
    // JSON.stringify's layout on every build.
    const alreadyRepointed =
      JSON.stringify(current.typeRoots) === JSON.stringify([MATERIALIZED_ROOT]) &&
      JSON.stringify(current.types) === JSON.stringify(desiredTypes) &&
      JSON.stringify(current.paths) === JSON.stringify(desiredPaths);
    if (!alreadyRepointed) {
      const options: Record<string, unknown> = {
        ...current,
        typeRoots: [MATERIALIZED_ROOT],
        types: desiredTypes,
      };
      if (desiredPaths === undefined) {
        delete options.paths;
      } else {
        options.paths = desiredPaths;
      }
      tsconfig.compilerOptions = options;
      writeJson(tsconfigPath, tsconfig);
    }
  }

  if (dirName === null) {
    return;
  }
  ensureGitignoreLine(cwd, `${MATERIALIZED_ROOT}/`);
}

export function resolveRegisteredSurfaceGeneratedDir(surfaceId: string | null): string | null {
  if (surfaceId === null) return null;
  const root = resolveTypesPackageRoot();
  if (root === null) return null;
  const target = loadApiTargetsRegistry().find((candidate) => candidate.id === surfaceId);
  if (!target || target.source != null || typeof target.generatedDir !== "string") return null;
  return path.join(root, target.generatedDir);
}

export function resolveCurrentSurfaceGeneratedDir(): string | null {
  const target = loadApiTargetsRegistry().find((candidate) => candidate.default === true);
  return resolveRegisteredSurfaceGeneratedDir(target?.id ?? null);
}

export interface RefDocResolveOptions {
  readonly cacheDir?: string;
  readonly download?: (url: string) => Promise<Uint8Array>;
  readonly readZip?: (zipPath: string) => unknown;
  readonly channel?: DefoldChannel;
  readonly fetchChannelInfo?: (
    channel: DefoldChannel,
  ) => Promise<{ version: string; sha1: string }>;
}

interface KindManifestEntry {
  readonly kind: string;
  readonly restricted?: string;
  readonly factory: string;
  readonly only?: readonly string[];
}

interface MaterializeVersionedSurfaceModule {
  readonly materializeVersionedSurface: (
    target: unknown,
    opts: {
      destDir: string;
      resolveOpts?: RefDocResolveOptions;
      excludeModules?: readonly string[];
    },
  ) => Promise<void>;
  readonly renderMaterializedKindIndex: (opts: {
    kind: string;
    universalModules: readonly string[];
    restrictedModule: string | null;
    editorModules?: readonly string[];
  }) => string;
  readonly RUNTIME_KIND_MANIFEST: readonly KindManifestEntry[];
  readonly targetKindManifest: (target: unknown) => readonly KindManifestEntry[];
}

// gui/render are the only kind-restricted namespaces; every other module is
// universal and rides all three kind subpaths.
const RESTRICTED_NAMESPACES = new Set(["gui", "render"]);

// The hand-authored declarations an editor kind index needs on top of the
// emitted namespaces: they are what make `editor.command`, `pprint` and the
// `zip` constant tables resolve at all. Copied into the surface for the same
// reason `engine-globals` is — the surface has no relative `src/` to reach.
const EDITOR_HAND_AUTHORED: readonly string[] = ["editor-overloads", "editor-vm-globals"];

export interface MaterializeRefDocSurfaceOptions {
  readonly cwd: string;
  readonly surfaceId: string;
  readonly resolveOpts?: RefDocResolveOptions;
  // Defaults to the running package's version, exactly as for the packaged
  // surface: both writers share one directory identity. Injected by tests.
  readonly cliVersion?: string;
  // Registry override (defaults to the installed types package's
  // api-targets.json). Injected only by tests that need a multi-module ref-doc
  // target.
  readonly registry?: readonly RegistryTarget[];
}

// Generate a pinned non-current surface on the fly into the project's
// `.defold-types/<id>/`. The target may use committed fixtures or resolved
// reference docs. The generator ships in the types package and is imported by
// resolved path so the current build path avoids fixture-reading side effects.
// The faux package is made self-contained by emitting core-type imports as a
// sibling `./core-types` and copying `core-types.d.ts` in, so the surface
// resolves from a real `.defold-types/<id>/` regardless of dest depth.
export async function materializeRefDocSurface(
  opts: MaterializeRefDocSurfaceOptions,
): Promise<MaterializeApiSurfaceResult> {
  const { cwd, surfaceId, resolveOpts } = opts;
  const root = resolveTypesPackageRoot();
  if (root === null) {
    return { materializedDir: null, active: null };
  }
  const registry = opts.registry ?? loadApiTargetsRegistry();
  const target = registry.find((t) => t.id === surfaceId);
  if (!target) {
    return { materializedDir: null, active: null };
  }

  const cliVersion = opts.cliVersion ?? readCliVersion();
  const dirName = surfaceDirName(surfaceId, cliVersion);
  const relDir = path.posix.join(MATERIALIZED_ROOT, dirName);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, dirName);
  try {
    clearSurfaceStamp(absDir);
    const mod = (await import(
      path.join(root, "scripts", "materialize-version.ts")
    )) as MaterializeVersionedSurfaceModule;
    const selfContained = { ...target, coreTypesImport: "./core-types" };
    await mod.materializeVersionedSurface(selfContained, {
      destDir: absDir,
      ...(resolveOpts ? { resolveOpts } : {}),
    });
    writeFileSync(path.join(absDir, "core-types.d.ts"), CORE_TYPES_REEXPORT);
    copyFileSync(
      path.join(root, "src", "engine-globals.d.ts"),
      path.join(absDir, "engine-globals.d.ts"),
    );
    const indexPath = path.join(absDir, "index.d.ts");
    writeFileSync(indexPath, `import "./engine-globals";\n${readFileSync(indexPath, "utf8")}`);

    // The editor documents the target declared, plain namespace first so the
    // kind index reads the way the committed one does. They sit beside the
    // runtime modules on disk but belong to the editor kind alone, so they are
    // held out of the universal set the runtime kinds import.
    const declaredEditor = target.editorModules ?? [];
    const editorModules = [
      ...declaredEditor.filter((m) => !m.outFile.includes("/")),
      ...declaredEditor.filter((m) => m.outFile.includes("/")),
    ].map((m) => m.outFile.replace(/\.d\.ts$/, ""));
    if (editorModules.length > 0) {
      for (const base of EDITOR_HAND_AUTHORED) {
        copyFileSync(path.join(root, "src", `${base}.d.ts`), path.join(absDir, `${base}.d.ts`));
      }
    }
    const editorOwned = new Set([...editorModules, ...EDITOR_HAND_AUTHORED]);

    const surfaceModules = listDts(absDir)
      .map((file) => file.replace(/\.d\.ts$/, ""))
      .filter(
        (base) =>
          base !== "index" &&
          base !== "core-types" &&
          base !== "engine-globals" &&
          !editorOwned.has(base),
      );
    const universalModules = surfaceModules.filter((base) => !RESTRICTED_NAMESPACES.has(base));
    const kinds = mod.targetKindManifest(target);
    const kindsDir = path.join(absDir, "kinds");
    mkdirSync(kindsDir, { recursive: true });
    for (const entry of kinds) {
      const restrictedModule =
        entry.restricted && surfaceModules.includes(entry.restricted) ? entry.restricted : null;
      writeFileSync(
        path.join(kindsDir, `${entry.kind}.d.ts`),
        mod.renderMaterializedKindIndex({
          kind: entry.kind,
          universalModules,
          restrictedModule,
          editorModules: [...editorModules, ...EDITOR_HAND_AUTHORED],
        }),
      );
    }

    const pkgPath = path.join(absDir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    pkg.version = cliVersion;
    pkg.exports = {
      ".": { types: "./index.d.ts" },
      ...Object.fromEntries(
        kinds.map((entry) => [`./${entry.kind}`, { types: `./kinds/${entry.kind}.d.ts` }]),
      ),
      "./core-types": { types: "./core-types.d.ts" },
    };

    writePinnedRootEntrypoint(absDir, root);

    // Stamped last, as in `materializeApiSurface`. The `catch` below already
    // removes the whole directory on an in-process throw, so the ordering here
    // is what a SIGKILL between the two writes sees.
    writeJson(pkgPath, pkg);
  } catch {
    rmSync(absDir, { recursive: true, force: true });
    return { materializedDir: null, active: null };
  }
  return { materializedDir: relDir, active: surfaceId };
}
