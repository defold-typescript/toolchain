import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { detectSourceOutputKind, isTranspilerSource, readBuildConfig } from "./build-output";
import { formatJsonLikeBiome } from "./format-json";
import { MATERIALIZED_ROOT } from "./materialize";
import { scanFilesSync } from "./scan";
import {
  isSkipped,
  type ScriptKind,
  selectScriptKind,
  selectScriptKindEntrypoint,
} from "./script-kind";

// The kinds a wall may narrow against. Must stay in sync with
// `KIND_MODULE_MANIFEST` (regen.ts). Also gates source-wall eligibility: a kind
// recognized for emit but absent here is never offered as a wall target.
export const PINNED_KIND_SUBPATHS: readonly string[] = [
  "script",
  "gui-script",
  "render-script",
  "editor-script",
];

// The wallable kinds a materialized surface actually wrote, read from its own
// `kinds/` directory rather than from a static list. Which kinds a surface
// carries is now a property of the target it was built from — a target
// declaring an editor document carries `editor-script`, one that does not never
// will — so existence on disk is the only source that can answer for every
// surface. One rule then decides both the per-kind mirror below and whether a
// wall may name `<surface>/<kind>`: a wall never points at a subpath the
// surface did not write.
export function materializedSurfaceKinds(cwd: string, surface: string | null): string[] {
  if (surface === null) {
    return [];
  }
  const kindsDir = path.join(cwd, MATERIALIZED_ROOT, surface, "kinds");
  if (!existsSync(kindsDir)) {
    return [];
  }
  return readdirSync(kindsDir)
    .filter((file) => file.endsWith(".d.ts"))
    .map((file) => file.slice(0, -".d.ts".length))
    .filter((kind) => PINNED_KIND_SUBPATHS.includes(kind));
}

// `materializeRefDocSurface` writes the per-kind modules at
// `<surface>/kinds/<kind>.d.ts`. Under `typeRoots`/`types`, TypeScript resolves
// `<surface>/<kind>` via that dir's `package.json` types/typings when present,
// else its `index.d.ts`; we supply the `index.d.ts` fallback by mirroring each
// kinds/ file into its per-kind subdir (one verbatim copy each) when the wall
// consumer detects a pinned surface. A verbatim copy keeps every relative
// `import "<namespace>"` resolving to the surface root the producer wrote;
// a triple-slash reference or `export *` re-export does not carry the
// `declare global { namespace … }` ambient side-effects `types` mode expects.
// No-op when the surface already exposes the per-kind layout.
function ensurePinnedKindSubpaths(cwd: string, surface: string): void {
  const surfaceDir = path.join(cwd, MATERIALIZED_ROOT, surface);
  for (const kind of materializedSurfaceKinds(cwd, surface)) {
    const kindDir = path.join(surfaceDir, kind);
    const indexPath = path.join(kindDir, "index.d.ts");
    if (existsSync(indexPath)) {
      continue;
    }
    const sourcePath = path.join(surfaceDir, "kinds", `${kind}.d.ts`);
    if (!existsSync(sourcePath)) {
      continue;
    }
    mkdirSync(kindDir, { recursive: true });
    writeFileSync(indexPath, readFileSync(sourcePath, "utf8"));
  }
}

export interface DirectoryWall {
  readonly dir: string;
  readonly kind: ScriptKind;
  readonly typesEntrypoint: string;
}

function describeWall(dir: string, kind: ScriptKind): DirectoryWall {
  return {
    dir,
    kind,
    typesEntrypoint: selectScriptKindEntrypoint(new Set([kind])),
  };
}

export function groupSourceScriptKindsByDirectory(cwd: string): Map<string, Set<ScriptKind>> {
  const byDir = new Map<string, Set<ScriptKind>>();
  const seen = new Set<string>();
  for (const pattern of readBuildConfig(cwd).include) {
    for (const match of scanFilesSync(cwd, pattern)) {
      const rel = match.split(path.sep).join("/");
      if (seen.has(rel) || !isTranspilerSource(rel) || isSkipped(rel)) {
        continue;
      }
      seen.add(rel);
      const kind = detectSourceOutputKind(readFileSync(path.join(cwd, match), "utf8"));
      if (kind === "module") {
        continue;
      }
      const dir = path.posix.dirname(rel);
      let set = byDir.get(dir);
      if (set === undefined) {
        set = new Set<ScriptKind>();
        byDir.set(dir, set);
      }
      set.add(kind);
    }
  }
  return byDir;
}

function addKinds(
  byDir: Map<string, Set<ScriptKind>>,
  dir: string,
  kinds: Iterable<ScriptKind>,
): void {
  let set = byDir.get(dir);
  if (set === undefined) {
    set = new Set<ScriptKind>();
    byDir.set(dir, set);
  }
  for (const kind of kinds) {
    set.add(kind);
  }
}

// Wall eligibility is a property of a directory's whole source subtree, not just
// the sources it directly holds: a wall's recursive `include` already governs
// every descendant, so the boundary a user wants to declare (`src/gui`) is often
// a directory with no sources of its own. Roll-up stops before `.` — the root is
// the full-surface program, never a wall.
export function groupSourceScriptKindsBySubtree(cwd: string): Map<string, Set<ScriptKind>> {
  const bySubtree = new Map<string, Set<ScriptKind>>();
  for (const [dir, kinds] of groupSourceScriptKindsByDirectory(cwd)) {
    if (dir === ".") {
      addKinds(bySubtree, ".", kinds);
      continue;
    }
    const segments = dir.split("/");
    for (let depth = segments.length; depth > 0; depth--) {
      addKinds(bySubtree, segments.slice(0, depth).join("/"), kinds);
    }
  }
  return bySubtree;
}

export function planSourceDirectoryWalls(cwd: string): DirectoryWall[] {
  const walls: DirectoryWall[] = [];
  for (const [dir, kinds] of groupSourceScriptKindsBySubtree(cwd)) {
    const kind = selectScriptKind(kinds);
    if (kind !== null && PINNED_KIND_SUBPATHS.includes(kind)) {
      walls.push(describeWall(dir, kind));
    }
  }
  return walls.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

function isUnder(rel: string, dir: string): boolean {
  return rel.startsWith(`${dir}/`);
}

// The declared wall that actually governs `rel` (a directory or a file path):
// the longest declared prefix, so a nested declaration overrides the one it sits
// inside. Every consumer resolves through this — the emitted `exclude`, the
// import guardrail, and `wall --list` must agree on which wall owns a file.
export function nearestWall<T extends { dir: string }>(rel: string, walls: readonly T[]): T | null {
  let nearest: T | null = null;
  for (const wall of walls) {
    if (rel !== wall.dir && !isUnder(rel, wall.dir)) {
      continue;
    }
    if (nearest === null || wall.dir.length > nearest.dir.length) {
      nearest = wall;
    }
  }
  return nearest;
}

export interface ResolvedDirectoryWall extends DirectoryWall {
  readonly declaredIn: string;
  readonly origin: "declared" | "inherited";
}

// One entry per source directory a declared wall narrows, carrying the wall that
// caused it. A declared dir that is no longer eligible narrows nothing, matching
// the `eligible`-intersect every other wall consumer applies.
export function resolveSourceWalls(
  cwd: string,
  declaredDirs: readonly string[],
): ResolvedDirectoryWall[] {
  const declared = new Set(declaredDirs);
  const walls = planSourceDirectoryWalls(cwd).filter((wall) => declared.has(wall.dir));
  const resolved: ResolvedDirectoryWall[] = [];
  for (const dir of groupSourceScriptKindsByDirectory(cwd).keys()) {
    const governing = nearestWall(dir, walls);
    if (governing === null) {
      continue;
    }
    resolved.push({
      ...governing,
      dir,
      declaredIn: governing.dir,
      origin: dir === governing.dir ? "declared" : "inherited",
    });
  }
  return resolved.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
}

interface WallTsconfig {
  readonly extends: string;
  readonly compilerOptions: {
    readonly composite: true;
    readonly typeRoots: null | string[];
    readonly types: string[];
    readonly paths?: Record<string, string[]>;
  };
  readonly include: readonly ["**/*.ts"];
  readonly exclude: readonly string[];
}

// A wall's `include` is recursive, so without this a declared descendant stays
// inside its ancestor's program and injects its own kind's ambient namespaces
// there — the nested wall would intersect with the outer one instead of
// overriding it. Subtracting the descendant is the whole override mechanism.
function nestedExcludes(wallDir: string, nestedWallDirs: readonly string[]): string[] {
  return nestedWallDirs
    .map((dir) => `${dir.slice(wallDir.length + 1)}/**`)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

export interface RootPathAliases {
  readonly baseUrl?: string;
  // The directory the root config resolves its relative values against. Carried
  // beside `baseUrl` because `baseUrl` alone cannot place an absolute base
  // relative to the surface — there is nothing to measure the distance from.
  readonly baseDir?: string;
  readonly paths?: Record<string, string[]>;
}

// Drive-rooted (`X:\`, `X:/`) and UNC (`\\server\share`) roots, neither of which
// `path.posix.isAbsolute` recognizes.
const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:[\\/]|\\\\)/;

function isAbsolutePath(value: string): boolean {
  return value.startsWith("/") || WINDOWS_ABSOLUTE.test(value);
}

function toPosixSeparators(value: string): string {
  return value.replaceAll("\\", "/");
}

// The root config's own `paths` and `baseUrl`, read one level only — the file a
// wall's `extends` names — matching `resolveActivePinnedSurface`, which reads the
// same single file and likewise does not follow an `extends` chain above it.
export function readRootPathAliases(cwd: string): RootPathAliases {
  const rootPath = path.join(cwd, "tsconfig.json");
  if (!existsSync(rootPath)) {
    return {};
  }
  let parsed: { compilerOptions?: { baseUrl?: unknown; paths?: unknown } };
  try {
    parsed = JSON.parse(readFileSync(rootPath, "utf8"));
  } catch {
    return {};
  }
  const baseUrl = parsed.compilerOptions?.baseUrl;
  const paths = parsed.compilerOptions?.paths;
  return {
    baseDir: cwd,
    ...(typeof baseUrl === "string" ? { baseUrl } : {}),
    ...(paths !== null && typeof paths === "object"
      ? { paths: paths as Record<string, string[]> }
      : {}),
  };
}

// Where a wall's `paths` substitutions are resolved from. With no `baseUrl` that
// is the wall's own directory, so the prefix is the one `typeRoots` uses; when
// the root declares `baseUrl`, the wall inherits it — a relative `baseUrl` in an
// extended config resolves against the config that declared it — and every
// substitution then resolves against that directory instead.
function wallPathsBase(
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

// The wall's own redirect for the documented `@defold-typescript/types/<kind>`
// factory import, which otherwise resolves through `node_modules` to the
// *installed* package's kind index and loads a second ambient surface beside the
// pinned one. It must name `<surface>/<kind>/index.d.ts` — the same file `types`
// resolves — and not the identical-content `<surface>/kinds/<kind>.d.ts` sibling,
// which would re-create the double load.
function pinnedKindIndexPaths(
  depth: number,
  pinnedSurface: string,
  kind: string,
  rootAliases: RootPathAliases,
): Record<string, string[]> {
  // `join`, not interpolation: a `baseUrl` naming the materialized root itself
  // leaves an empty base, which interpolation would turn into a rooted `/…`.
  const base = wallPathsBase(depth, rootAliases.baseUrl, rootAliases.baseDir);
  return {
    [`@defold-typescript/types/${kind}`]: [
      path.posix.join(base, pinnedSurface, kind, "index.d.ts"),
    ],
  };
}

// The value the wall would write when mirroring root alias target `target`.
// Re-based to the wall directory when the root declares no `baseUrl`, verbatim
// when it does — the wall resolves against the same base the root does in that
// case. An absolute target of any flavor already names its file outright, and
// stays byte-identical: it is the user's string, and normalizing a
// backslash-spelled one would break the value equality the un-pin depends on.
function mirroredTarget(target: string, baseUrl: string | undefined, depth: number): string {
  if (baseUrl !== undefined || isAbsolutePath(target)) {
    return target;
  }
  return path.posix.join("../".repeat(depth), toPosixSeparators(target));
}

export interface MergeWallPathsInput {
  readonly existing: Record<string, string[]> | undefined;
  readonly managed: Record<string, string[]> | undefined;
  readonly managedKey: string;
  readonly rootAliases: RootPathAliases;
  readonly depth: number;
}

// A wall owns exactly its `@defold-typescript/types/<kind>` redirect; every other
// entry belongs to the user. Declaring any `paths` replaces — never merges — the
// object inherited through `extends`, so a pinned write must also mirror the root
// config's own aliases to compensate for the shadowing the redirect introduces.
//
// Value equality with the mirror this function would write is what identifies a
// wall-authored entry, in both directions: a colliding entry that differs is the
// user's and survives a pinned write, and only an entry still equal to its mirror
// is removed on un-pin. A root alias the user later edits or deletes therefore
// stays behind as an ordinary preserved entry; that is accepted rather than
// tracked.
//
// Returns `undefined` when nothing is left, which is the signal to **delete** the
// key: `paths: null` suppresses the inherited object exactly as a populated one
// does, so it would leave the root aliases dead after the pin is gone.
export function mergeWallPaths({
  existing,
  managed,
  managedKey,
  rootAliases,
  depth,
}: MergeWallPathsInput): Record<string, string[]> | undefined {
  const mirrors = new Map<string, string[]>();
  for (const [specifier, targets] of Object.entries(rootAliases.paths ?? {})) {
    mirrors.set(
      specifier,
      targets.map((target) => mirroredTarget(target, rootAliases.baseUrl, depth)),
    );
  }

  const merged: Record<string, string[]> = { ...existing };
  if (managed === undefined) {
    delete merged[managedKey];
    for (const [specifier, mirror] of mirrors) {
      if (JSON.stringify(merged[specifier]) === JSON.stringify(mirror)) {
        delete merged[specifier];
      }
    }
  } else {
    for (const [specifier, mirror] of mirrors) {
      if (merged[specifier] === undefined) {
        merged[specifier] = mirror;
      }
    }
    Object.assign(merged, managed);
  }

  return Object.keys(merged).length === 0 ? undefined : merged;
}

// `surfaceKinds` is what the pinned surface actually wrote (see
// `materializedSurfaceKinds`). It defaults to empty so a caller that cannot
// prove what the surface holds keeps the installed package entrypoint — naming
// a `<surface>/<kind>` subpath that was never written points the wall's tsconfig
// at nothing.
export function directoryWallTsconfig(
  wall: DirectoryWall,
  pinnedSurface: string | null = null,
  nestedWallDirs: readonly string[] = [],
  surfaceKinds: readonly string[] = [],
  rootAliases: RootPathAliases = {},
): WallTsconfig {
  const depth = wall.dir.split("/").length;
  const exclude = nestedExcludes(wall.dir, nestedWallDirs);
  if (pinnedSurface === null || !surfaceKinds.includes(wall.kind)) {
    return {
      extends: `${"../".repeat(depth)}tsconfig.json`,
      compilerOptions: { composite: true, typeRoots: null, types: [wall.typesEntrypoint] },
      include: ["**/*.ts"],
      exclude,
    };
  }
  return {
    extends: `${"../".repeat(depth)}tsconfig.json`,
    compilerOptions: {
      composite: true,
      typeRoots: [`${"../".repeat(depth)}${MATERIALIZED_ROOT}`],
      types: [`${pinnedSurface}/${wall.kind}`],
      paths: pinnedKindIndexPaths(depth, pinnedSurface, wall.kind, rootAliases),
    },
    include: ["**/*.ts"],
    exclude,
  };
}

// Read the root tsconfig and, when it is repointed at the materialized
// `.defold-types` root, return the first `types` entry whose `<entry>/kinds`
// directory exists on disk. Returns `null` for an installed project, for a
// pre-producer surface (no `kinds/`), or for an unknown root tsconfig.
export function resolveActivePinnedSurface(cwd: string): string | null {
  const rootPath = path.join(cwd, "tsconfig.json");
  if (!existsSync(rootPath)) {
    return null;
  }
  const parsed = JSON.parse(readFileSync(rootPath, "utf8")) as {
    compilerOptions?: { typeRoots?: unknown; types?: unknown };
  };
  const typeRoots = parsed.compilerOptions?.typeRoots;
  const types = parsed.compilerOptions?.types;
  if (!Array.isArray(types)) {
    return null;
  }
  // Only the exact `[MATERIALIZED_ROOT]` that `ensureMaterializedReference`
  // writes counts as pinned, mirroring that writer's own idempotency check.
  if (JSON.stringify(typeRoots) !== JSON.stringify([MATERIALIZED_ROOT])) {
    return null;
  }
  for (const entry of types) {
    if (typeof entry !== "string") {
      continue;
    }
    if (existsSync(path.join(cwd, MATERIALIZED_ROOT, entry, "kinds"))) {
      ensurePinnedKindSubpaths(cwd, entry);
      return entry;
    }
  }
  return null;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${formatJsonLikeBiome(value)}\n`);
}

interface RootTsconfig {
  exclude?: string[];
  files?: string[];
  references?: Array<{ path: string }>;
  [key: string]: unknown;
}

function sortedWallDirs(walls: readonly DirectoryWall[]): string[] {
  return walls
    .map((w) => w.dir)
    .filter((dir) => dir !== ".")
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function isInsideAnyDir(rel: string, dirs: readonly string[]): boolean {
  return dirs.some((dir) => rel === dir || rel.startsWith(`${dir}/`));
}

function hasRootOwnedTranspilerSources(cwd: string, wallDirs: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const pattern of readBuildConfig(cwd).include) {
    for (const match of scanFilesSync(cwd, pattern)) {
      const rel = match.split(path.sep).join("/");
      if (seen.has(rel) || !isTranspilerSource(rel) || isSkipped(rel)) {
        continue;
      }
      seen.add(rel);
      if (!isInsideAnyDir(rel, wallDirs)) {
        return true;
      }
    }
  }
  return false;
}

export function wireWallReferences(cwd: string, walls: readonly DirectoryWall[]): void {
  const rootPath = path.join(cwd, "tsconfig.json");
  const current = JSON.parse(readFileSync(rootPath, "utf8")) as RootTsconfig;
  const wallDirs = sortedWallDirs(walls);
  const previousReferences = current.references ?? [];
  const previousManaged = new Set(previousReferences.map((ref) => ref.path));
  const nextExclude = [
    ...new Set([
      ...(current.exclude ?? []).filter((entry) => !previousManaged.has(entry)),
      ...wallDirs,
    ]),
  ];
  const next: RootTsconfig = { ...current };

  if (wallDirs.length > 0) {
    next.references = wallDirs.map((dir) => ({ path: dir }));
  } else {
    delete next.references;
  }

  if (nextExclude.length > 0) {
    next.exclude = nextExclude;
  } else {
    delete next.exclude;
  }

  if (wallDirs.length > 0 && !hasRootOwnedTranspilerSources(cwd, wallDirs)) {
    next.files = [];
  } else if (previousReferences.length > 0 && JSON.stringify(next.files) === JSON.stringify([])) {
    delete next.files;
  }

  if (JSON.stringify(next) !== JSON.stringify(current)) {
    writeJson(rootPath, next);
  }
}

// Only the walls with no other wall between them and `wall` — excluding `ui/**`
// already covers `ui/deep/**`, so the emitted list stays minimal.
function nearestDescendantDirs(wall: DirectoryWall, walls: readonly DirectoryWall[]): string[] {
  const under = walls.map((w) => w.dir).filter((dir) => isUnder(dir, wall.dir));
  return under.filter((dir) => !under.some((other) => other !== dir && isUnder(dir, other)));
}

export function writeDirectoryWallTsconfigs(
  cwd: string,
  walls: DirectoryWall[],
  pinnedSurface: string | null = null,
): string[] {
  const written: string[] = [];
  const surfaceKinds = materializedSurfaceKinds(cwd, pinnedSurface);
  const rootAliases = readRootPathAliases(cwd);
  for (const w of walls) {
    if (w.dir === ".") {
      continue;
    }
    const rel = `${w.dir}/tsconfig.json`;
    const target = path.join(cwd, w.dir, "tsconfig.json");
    const desired = directoryWallTsconfig(
      w,
      pinnedSurface,
      nearestDescendantDirs(w, walls),
      surfaceKinds,
      rootAliases,
    );
    const mergePaths = (existing: Record<string, string[]> | undefined) =>
      mergeWallPaths({
        existing,
        managed: desired.compilerOptions.paths,
        managedKey: `@defold-typescript/types/${w.kind}`,
        rootAliases,
        depth: w.dir.split("/").length,
      });
    if (existsSync(target)) {
      const current = JSON.parse(readFileSync(target, "utf8")) as {
        extends?: string;
        compilerOptions?: Record<string, unknown>;
        [key: string]: unknown;
      };
      const options = current.compilerOptions ?? {};
      const mergedPaths = mergePaths(options.paths as Record<string, string[]> | undefined);
      // Skip the write when already narrowed so a consumer's formatting is not
      // churned to JSON.stringify's layout on every build. The comparison is
      // against the *merged* object, not the managed entry alone, or a wall
      // whose mirrors are already in place is rewritten on every build.
      const alreadyNarrowed =
        current.extends === desired.extends &&
        options.composite === desired.compilerOptions.composite &&
        JSON.stringify(options.typeRoots) === JSON.stringify(desired.compilerOptions.typeRoots) &&
        JSON.stringify(options.types) === JSON.stringify(desired.compilerOptions.types) &&
        JSON.stringify(options.paths ?? null) === JSON.stringify(mergedPaths ?? null) &&
        JSON.stringify(current.include) === JSON.stringify(desired.include) &&
        JSON.stringify(current.exclude) === JSON.stringify(desired.exclude);
      if (!alreadyNarrowed) {
        const nextOptions: Record<string, unknown> = {
          ...options,
          composite: desired.compilerOptions.composite,
          typeRoots: desired.compilerOptions.typeRoots,
          types: desired.compilerOptions.types,
        };
        if (mergedPaths === undefined) {
          delete nextOptions.paths;
        } else {
          nextOptions.paths = mergedPaths;
        }
        writeJson(target, {
          ...current,
          extends: desired.extends,
          compilerOptions: nextOptions,
          include: desired.include,
          exclude: desired.exclude,
        });
        written.push(rel);
      }
    } else {
      const mergedPaths = mergePaths(undefined);
      const { paths: _managed, ...options } = desired.compilerOptions;
      writeJson(target, {
        ...desired,
        compilerOptions: mergedPaths === undefined ? options : { ...options, paths: mergedPaths },
      });
      written.push(rel);
    }
  }
  return written.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
