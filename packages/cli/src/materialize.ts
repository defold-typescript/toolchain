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
import type { DefoldChannel } from "./defold-target";
import { formatJsonLikeBiome } from "./format-json";

export const MATERIALIZED_ROOT = ".defold-types";

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
function publishedSubpaths(typesRoot: string | null): ReadonlySet<string> {
  if (typesRoot === null) {
    return new Set();
  }
  try {
    const pkg = JSON.parse(readFileSync(path.join(typesRoot, "package.json"), "utf8")) as {
      exports?: Record<string, unknown>;
    };
    return new Set(
      Object.keys(pkg.exports ?? {})
        .filter((key) => key.startsWith("./"))
        .map((key) => key.slice(2)),
    );
  } catch {
    return new Set();
  }
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
  const relDir = path.posix.join(MATERIALIZED_ROOT, surfaceId);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, surfaceId);
  mkdirSync(absDir, { recursive: true });

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

  writeJson(path.join(absDir, "package.json"), {
    name: `@defold-typescript/materialized-${surfaceId}`,
    types: "index.d.ts",
  });

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
  if (materializedDir === null) {
    return;
  }
  const surfaceId = path.posix.basename(materializedDir);

  const tsconfigPath = path.join(cwd, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions?: Record<string, unknown>;
      [key: string]: unknown;
    };
    const current = tsconfig.compilerOptions ?? {};
    // The sibling `extensions` and `libraries` surfaces
    // (ensureExtensionTypesReference / ensureLibraryTypesReference) coexist with
    // the engine surface under one typeRoots; repointing the engine entry must
    // carry any existing sibling types entry through, not clobber it.
    const currentTypes = Array.isArray(current.types) ? (current.types as unknown[]) : [];
    const desiredTypes = [
      surfaceId,
      ...["extensions", "libraries"].filter((entry) => currentTypes.includes(entry)),
    ];
    // Skip the write when already repointed so the file keeps its existing
    // formatting (a consumer's Biome/Prettier shape) instead of churning to
    // JSON.stringify's layout on every build.
    const alreadyRepointed =
      JSON.stringify(current.typeRoots) === JSON.stringify([MATERIALIZED_ROOT]) &&
      JSON.stringify(current.types) === JSON.stringify(desiredTypes);
    if (!alreadyRepointed) {
      tsconfig.compilerOptions = {
        ...current,
        typeRoots: [MATERIALIZED_ROOT],
        types: desiredTypes,
      };
      writeJson(tsconfigPath, tsconfig);
    }
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

  const relDir = path.posix.join(MATERIALIZED_ROOT, surfaceId);
  const absDir = path.join(cwd, MATERIALIZED_ROOT, surfaceId);
  try {
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
    pkg.exports = {
      ".": { types: "./index.d.ts" },
      ...Object.fromEntries(
        kinds.map((entry) => [`./${entry.kind}`, { types: `./kinds/${entry.kind}.d.ts` }]),
      ),
      "./core-types": { types: "./core-types.d.ts" },
    };
    writeJson(pkgPath, pkg);
  } catch {
    rmSync(absDir, { recursive: true, force: true });
    return { materializedDir: null, active: null };
  }
  return { materializedDir: relDir, active: surfaceId };
}
