// Pure, network-free core of `library-type-resolution`: turn a declared
// `game.project` `[dependencies]` URL into the vendored pure-Lua library it
// corresponds to, or `null` when none match. Later slices add the archive read,
// `.defold-types/` materialization, and the `resolve` wiring that calls this for
// each `assetOnly` dependency. This slice consumes the already-shipped
// `library-classification.json` / `library-targets.json` registries as parsed
// data passed in, staying free of IO.
//
// A declared dependency URL is a moving/forked ref (`.../archive/main.zip`, a
// fork, a pinned tag), so the match keys on a normalized source identity, not
// string equality. The registries pin one canonical ts-defold/library package
// dir per vendored module, and those dir names mirror the upstream repo name, so
// the identity is the normalized repo name (host, owner, `/archive/<ref>.zip`,
// and query stripped) rather than a full `owner/repo` — the registries carry no
// per-library owner to key on.

export interface LibraryClassificationDir {
  readonly dir: string;
  readonly classification: string;
  readonly modules: readonly string[];
}

export interface LibraryClassification {
  readonly dirs: readonly LibraryClassificationDir[];
}

export interface LibraryTarget {
  readonly module: string;
  readonly path: string;
}

export interface LibraryTargets {
  readonly targets: readonly LibraryTarget[];
}

export interface VendoredLibrary {
  readonly sourceId: string;
  readonly modules: string[];
  // LuaLS-only: maps a verify module id to the committed `generated/<stem>.d.ts`
  // file stem when the two differ (druid verifies on `druid.druid` but ships its
  // types in `generated/druid.d.ts`). Absent for pure-Lua libraries, where the
  // stem is the module id and materialize behaves unchanged.
  readonly generatedStems?: Readonly<Record<string, string>>;
}

// A single library entry in `packages/library-types/luals-targets.json`: the
// upstream repo, the require module the archive ships (`moduleId`, used to
// verify a match against the downloaded archive), and the `namespace` the
// committed `.d.ts` file is named for (the generated stem).
export interface LualsTarget {
  readonly repo: string;
  readonly moduleId: string;
  readonly namespace: string;
}

export interface LualsTargets {
  readonly targets: readonly LualsTarget[];
}

// pure-Lua and already-vendored dirs materialize into `.defold-types/`; native
// (bare-global) and covered-by-goal dirs are handled elsewhere and excluded here.
const MATCHABLE_CLASSIFICATIONS = new Set(["pure-lua", "already-vendored"]);

// The canonical source identity of a vendored module is its ts-defold/library
// package dir — the `<dir>` in `packages/<dir>/<module>.d.ts`.
function targetSourceDir(path: string): string | undefined {
  return path.split("/")[1];
}

export function buildLibraryRegistry(
  classification: LibraryClassification,
  targets: LibraryTargets,
): VendoredLibrary[] {
  const moduleSource = new Map<string, string>();
  for (const target of targets.targets) {
    const dir = targetSourceDir(target.path);
    if (dir !== undefined && dir.length > 0) {
      moduleSource.set(target.module, dir);
    }
  }

  const registry: VendoredLibrary[] = [];
  for (const dir of classification.dirs) {
    if (!MATCHABLE_CLASSIFICATIONS.has(dir.classification)) {
      continue;
    }
    const bySource = new Map<string, string[]>();
    for (const module of dir.modules) {
      const source = moduleSource.get(module);
      if (source === undefined) {
        continue;
      }
      const sourceId = source.toLowerCase();
      const modules = bySource.get(sourceId) ?? [];
      modules.push(module);
      bySource.set(sourceId, modules);
    }
    for (const [sourceId, modules] of bySource) {
      registry.push({ sourceId, modules: modules.slice().sort() });
    }
  }
  return registry;
}

// Turn the LuaLS target list into `VendoredLibrary` entries. Each target
// verifies against the archive's shipped `moduleId` but sources its committed
// types from `generated/<namespace>.d.ts`, so the stem is recorded separately.
export function buildLualsRegistryEntries(targets: LualsTargets): VendoredLibrary[] {
  return targets.targets.map((target) => ({
    sourceId: normalizeSourceId(target.repo),
    modules: [target.moduleId],
    generatedStems: { [target.moduleId]: target.namespace },
  }));
}

export function normalizeSourceId(url: string): string {
  const withoutFragment = url.split(/[?#]/, 1)[0] ?? "";
  const withoutProtocol = withoutFragment.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const segments = withoutProtocol.split("/").filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return "";
  }
  const archiveIndex = segments.findIndex((segment) => segment.toLowerCase() === "archive");
  const repoIndex = archiveIndex > 0 ? archiveIndex - 1 : segments.length - 1;
  const repo = segments[repoIndex] ?? "";
  return repo.replace(/\.(zip|git)$/i, "").toLowerCase();
}

export function matchVendoredLibrary(
  url: string,
  registry: readonly VendoredLibrary[],
): VendoredLibrary | null {
  const sourceId = normalizeSourceId(url);
  if (sourceId === "") {
    return null;
  }
  return registry.find((library) => library.sourceId === sourceId) ?? null;
}
