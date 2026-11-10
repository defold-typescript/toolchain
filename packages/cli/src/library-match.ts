// Pure, network-free core of `library-type-resolution`: turn a declared
// `game.project` `[dependencies]` URL into the vendored pure-Lua library it
// corresponds to, or `null` when none match. Later slices add the archive read,
// `.defold-types/` materialization, and the `resolve` wiring that calls this for
// each `assetOnly` dependency. This module consumes library data targets as
// parsed data passed in, staying free of IO.
//
// A declared dependency URL is a moving ref (`.../archive/main.zip`, a pinned
// tag, a fork), so the match keys on a library name, not string equality. The
// name is the lowercased `host/owner/repo` (`libraryName`): a dependency matches
// the library holding its exact name, else, on a host some library names, the one
// library sharing its repo name, so a fork keeps its upstream's types, a repo name
// two libraries share matches neither, and a dependency on any other host matches
// nothing. Every lane keys on the upstream `repo` its registry entry pins.

export interface VendoredLibrary {
  readonly sourceId: string;
  readonly modules: string[];
  // Maps a verify module id to the `namespace` its target is published under
  // when the two differ (druid verifies on `druid.druid` but is published as
  // `druid`), which names the file `export-types` writes for it. Absent for
  // pure-Lua libraries, where the namespace is the module id.
  readonly namespaces?: Readonly<Record<string, string>>;
}

// A single LuaLS target from a library's `recipe.json`: the
// upstream repo, the require module the archive ships (`moduleId`, used to
// verify a match against the downloaded archive), and the `namespace` the
// library is published under.
export interface LualsTarget {
  readonly repo: string;
  readonly moduleId: string;
  readonly namespace: string;
}

export interface LualsTargets {
  readonly targets: readonly LualsTarget[];
}

// Group registry targets by library name so a repository shipping more
// than one module yields a single entry carrying every module and a merged
// `namespaces`. Both the LuaLS and script_api lanes feed the same
// `{ repo, moduleId, namespace }` shape here; `matchVendoredLibrary`'s `find`
// returns one entry per repo, and `resolve`'s per-module `confirmed` filter then
// verifies each module against the archive independently.
function groupTargetsBySourceId(
  targets: readonly { repo: string; moduleId: string; namespace: string }[],
): VendoredLibrary[] {
  const bySource = new Map<string, VendoredLibrary>();
  for (const target of targets) {
    const sourceId = libraryName(target.repo);
    const existing = bySource.get(sourceId);
    if (existing === undefined) {
      bySource.set(sourceId, {
        sourceId,
        modules: [target.moduleId],
        namespaces: { [target.moduleId]: target.namespace },
      });
      continue;
    }
    existing.modules.push(target.moduleId);
    (existing.namespaces as Record<string, string>)[target.moduleId] = target.namespace;
  }
  return [...bySource.values()].map((entry) => ({
    ...entry,
    modules: entry.modules.slice().sort(),
  }));
}

// Turn the LuaLS target list into `VendoredLibrary` entries. Each target
// verifies against the archive's shipped `moduleId` but is published under its
// `namespace`, so the namespace is recorded separately.
export function buildLualsRegistryEntries(targets: LualsTargets): VendoredLibrary[] {
  return groupTargetsBySourceId(targets.targets);
}

// A single script_api target from a library's `recipe.json`,
// projected to what registry matching needs: the upstream `repo` (source id) and
// the require `moduleId` shipped by the archive, plus the single-segment
// `namespace` it is published under.
export interface ScriptApiRegistryTarget {
  readonly repo: string;
  readonly moduleId: string;
  readonly namespace: string;
}

export interface ScriptApiRegistryTargets {
  readonly targets: readonly ScriptApiRegistryTarget[];
}

// Turn the script_api target list into `VendoredLibrary` entries. Like the LuaLS
// libraries, a script_api target verifies against its shipped `moduleId` but is
// published under its `namespace`, so the namespace is recorded separately
// (`bridge.bridge` -> `bridge`).
export function buildScriptApiRegistryEntries(
  targets: ScriptApiRegistryTargets,
): VendoredLibrary[] {
  return groupTargetsBySourceId(targets.targets);
}

// A single fork from a library's `library.json`,
// projected to what registry matching needs: the upstream `repo` (source id),
// the require `moduleId` shipped by the archive, and the single-segment
// `namespace` it is published under. An
// authored/forked library is one this repo maintains as a first-party
// hand-authored or forked `.d.ts` (its upstream has no usable structured source).
export interface AuthoredRegistryTarget {
  readonly repo: string;
  readonly moduleId: string;
  readonly namespace: string;
}

export interface AuthoredRegistryTargets {
  readonly targets: readonly AuthoredRegistryTarget[];
}

// Turn the authored target list into `VendoredLibrary` entries. Like the LuaLS
// and script_api libraries, an authored target verifies against its shipped
// `moduleId` but is published under its `namespace`, so the namespace is
// recorded separately (`defcon.console` -> `defcon`).
export function buildAuthoredRegistryEntries(targets: AuthoredRegistryTargets): VendoredLibrary[] {
  return groupTargetsBySourceId(targets.targets);
}

// Fold registry entries that share a `sourceId` into one, preserving first-seen
// order. A single upstream repo can ship modules across more than one lane (the
// ts-defold lane emits `nakama.nakama`, the authored lane emits
// `nakama.engine.defold` + `nakama.util.log`, both keyed `heroiclabs/nakama-defold`),
// and `matchVendoredLibrary` matches on `sourceId` with a first-match `find`, so the
// concatenated lanes must merge to one entry per source or the later lanes'
// modules are silently dropped. Union `modules` (dedupe + sort), merge every
// contributor's `namespaces`, and attach `namespaces` only when the
// merged record is non-empty so a source with none keeps the pure-Lua
// entry shape. Pure and IO-free.
export function mergeVendoredLibrariesBySourceId(
  entries: readonly VendoredLibrary[],
): VendoredLibrary[] {
  const bySource = new Map<string, { modules: Set<string>; namespaces: Record<string, string> }>();
  const order: string[] = [];
  for (const entry of entries) {
    let acc = bySource.get(entry.sourceId);
    if (acc === undefined) {
      acc = { modules: new Set<string>(), namespaces: {} };
      bySource.set(entry.sourceId, acc);
      order.push(entry.sourceId);
    }
    for (const module of entry.modules) {
      acc.modules.add(module);
    }
    if (entry.namespaces !== undefined) {
      Object.assign(acc.namespaces, entry.namespaces);
    }
  }
  return order.map((sourceId) => {
    const acc = bySource.get(sourceId) as {
      modules: Set<string>;
      namespaces: Record<string, string>;
    };
    const modules = [...acc.modules].sort();
    return Object.keys(acc.namespaces).length > 0
      ? { sourceId, modules, namespaces: acc.namespaces }
      : { sourceId, modules };
  });
}

// The bare repo segment of a dependency URL, lowercased: only the
// `.defold-types/` folder an extension's declarations land in is named by it.
export function normalizeSourceId(url: string): string {
  const name = libraryName(url);
  return name.slice(name.lastIndexOf("/") + 1);
}

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

// The URL's `host`, which already drops userinfo and a scheme's default port, so
// `github.com:443` is `github.com` while `git.acme.com:3000` keeps its port.
function hostOf(url: string, authority: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return authority.slice(authority.lastIndexOf("@") + 1).toLowerCase();
  }
}

/**
 * A library's name: the lowercased `host/owner/repo` of a dependency URL or a `repo`
 * URL. The repo is the segment before `archive`, else the last one, without
 * `.zip`/`.git`; a URL with no owner segment yields `host/repo`. Input with no
 * scheme is a typed name, lowercased and otherwise left alone.
 */
export function libraryName(urlOrName: string): string {
  const withoutFragment = urlOrName.split(/[?#]/, 1)[0] ?? "";
  if (!SCHEME.test(withoutFragment)) {
    return withoutFragment
      .split("/")
      .filter((segment) => segment.length > 0)
      .join("/")
      .toLowerCase();
  }
  const [authority = "", ...segments] = withoutFragment
    .replace(SCHEME, "")
    .split("/")
    .filter((segment, index) => index === 0 || segment.length > 0);
  if (segments.length === 0) {
    return "";
  }
  const archiveIndex = segments.findIndex((segment) => segment.toLowerCase() === "archive");
  const repoIndex = archiveIndex > 0 ? archiveIndex - 1 : segments.length - 1;
  const repo = (segments[repoIndex] ?? "").replace(/\.(zip|git)$/i, "");
  const owner = segments[repoIndex - 1];
  const host = hostOf(withoutFragment, authority);
  return [host, owner, repo]
    .filter((segment) => segment !== undefined && segment !== "")
    .join("/")
    .toLowerCase();
}

function repoSegment(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

function hostSegment(name: string): string {
  return name.slice(0, name.indexOf("/"));
}

// `exact` names the library holding the dependency's own `host/owner/repo`; `fork`
// the one library sharing its repo name; `shared` every library sharing it,
// none of which types the dependency.
export type LibraryNameMatch =
  | { readonly kind: "exact"; readonly name: string }
  | { readonly kind: "fork"; readonly name: string }
  | { readonly kind: "shared"; readonly names: readonly string[] };

// The repo-name fallback runs only on a host some library names, so a dependency on
// a company server or an IP address never takes a public library's types.
export function matchLibraryName(url: string, names: readonly string[]): LibraryNameMatch | null {
  const name = libraryName(url);
  if (name === "") {
    return null;
  }
  if (names.includes(name)) {
    return { kind: "exact", name };
  }
  const owned = names.filter((other) => other.includes("/"));
  const host = hostSegment(name);
  if (!owned.some((other) => hostSegment(other) === host)) {
    return null;
  }
  const repo = repoSegment(name);
  const sharing = [...new Set(owned.filter((other) => repoSegment(other) === repo))].sort();
  if (sharing.length === 0) {
    return null;
  }
  return sharing.length === 1
    ? { kind: "fork", name: sharing[0] as string }
    : { kind: "shared", names: sharing };
}

/**
 * Every name a typed name selects: each that is it, or ends in `/<typed>`,
 * compared lowercased, so `monarch`, `britzl/monarch` and
 * `github.com/britzl/monarch` all select `github.com/britzl/monarch`.
 */
export function namesSelectedBy(typed: string, names: readonly string[]): string[] {
  const wanted = typed.toLowerCase();
  return names.filter((name) => {
    const lower = name.toLowerCase();
    return lower === wanted || lower.endsWith(`/${wanted}`);
  });
}

// The name `matchLibraryName` finds for `url`, or null when none or several do.
export function matchedLibraryName(url: string, names: readonly string[]): string | null {
  const match = matchLibraryName(url, names);
  return match === null || match.kind === "shared" ? null : match.name;
}

// `names` defaults to the registry's own; pass every library's when another
// registry's names can share a repo name with these.
export function matchVendoredLibrary(
  url: string,
  registry: readonly VendoredLibrary[],
  names: readonly string[] = registry.map((library) => library.sourceId),
): { readonly library: VendoredLibrary; readonly kind: "exact" | "fork" } | null {
  const match = matchLibraryName(url, names);
  if (match === null || match.kind === "shared") {
    return null;
  }
  const library = registry.find((entry) => entry.sourceId === match.name);
  return library === undefined ? null : { library, kind: match.kind };
}
