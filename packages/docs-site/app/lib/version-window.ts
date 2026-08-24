import { type ApiFunction, symbolIdentityKey } from "@defold-typescript/types";
import {
  type CombinedEntry,
  type CombinedNamespace,
  type CombinedSurface,
  compareSemverDesc,
  funcIdentity,
  memberIdentity,
  type SignaturesArtifact,
} from "./combined-surface";

/**
 * An inclusive version range over the tracked axis, in bare semver (`1.13.0`).
 * `from` is older-or-equal to `to`; {@link resolveVersionWindow} is the only
 * place that ordering is established, so no consumer has to re-check it.
 */
export interface VersionWindow {
  readonly from: string;
  readonly to: string;
}

/** One option in a `From`/`To` selector column. */
export interface WindowOption {
  readonly version: string;
  readonly href: string;
  readonly isCurrent: boolean;
}

/** Both selector columns, each already carrying the clamped destination href. */
export interface WindowOptionHrefs {
  readonly from: readonly WindowOption[];
  readonly to: readonly WindowOption[];
}

// The route/`api-targets.json` vocabulary is `defold-`-prefixed; the projection
// axis is bare semver. Every string entering this module is normalized here and
// only the href builders prefix it again.
function bareVersion(id: string): string {
  return id.replace(/^defold-/, "");
}

// True when `a` sits older than `b` on the descending-semver axis.
function isOlder(a: string, b: string): boolean {
  return compareSemverDesc(a, b) > 0;
}

// The inclusive newest-first slice of the tracked axis the window spans; empty
// for a bound that is untracked or inverted, which drops every entry.
function windowSlice(versions: readonly string[], window: VersionWindow): string[] {
  const newestIndex = versions.indexOf(window.to);
  const oldestIndex = versions.indexOf(window.from);
  if (newestIndex === -1 || oldestIndex === -1 || newestIndex > oldestIndex) return [];
  return versions.slice(newestIndex, oldestIndex + 1);
}

// The newest declaration the window genuinely contains, or `undefined` when it
// contains none. `availableIn` is a presence set widened by curation, so an
// in-window version can be available while owning no typings at all; an empty
// string is the miss `entryFor` writes, not a declaration, so it is skipped too.
function declaredInWindow(
  entry: CombinedEntry,
  signatures: SignaturesArtifact,
  inSlice: ReadonlySet<string>,
): string | undefined {
  const key = symbolIdentityKey(entry.identity);
  for (const version of entry.availableIn) {
    if (!inSlice.has(version)) continue;
    const declaration = signatures.versions[version]?.[key];
    if (declaration) return declaration;
  }
  return undefined;
}

/**
 * The declaration a windowed entry is authoritative for. When the window's `to`
 * does not cap the entry, the built value is returned verbatim: that preserves
 * the resolution {@link buildCombinedSurface} made from *real* presence, which a
 * deprecation-widened span would otherwise re-resolve to a version owning no
 * declaration at all. A capped window resolves the newest in-window version that
 * genuinely *declares* the identity, stepping over widened versions that declare
 * nothing, and keeps the built value when the window declares it nowhere — a real
 * declaration from outside the window beats no declaration at all, which is the
 * same degradation the uncapped branch already chooses.
 */
function windowedSignature(
  entry: CombinedEntry,
  signatures: SignaturesArtifact,
  inSlice: ReadonlySet<string>,
): string {
  const newestInWindow = entry.availableIn.find((version) => inSlice.has(version));
  if (newestInWindow === undefined || newestInWindow === entry.availableIn[0]) {
    return entry.authoritativeSignature;
  }
  return declaredInWindow(entry, signatures, inSlice) ?? entry.authoritativeSignature;
}

function windowNamespace(
  ns: CombinedNamespace,
  signatures: SignaturesArtifact,
  inSlice: ReadonlySet<string>,
): CombinedNamespace | null {
  const survivors = ns.entries.filter((entry) =>
    entry.availableIn.some((version) => inSlice.has(version)),
  );
  if (survivors.length === 0) return null;
  const kept = new Set(survivors.map((entry) => symbolIdentityKey(entry.identity)));
  const keepsFunction = (fn: ApiFunction): boolean =>
    kept.has(symbolIdentityKey(funcIdentity(ns.namespace, fn)));
  const keepsMember =
    (kind: string) =>
    (member: { readonly name: string }): boolean =>
      kept.has(symbolIdentityKey(memberIdentity(ns.namespace, kind, member.name)));

  return {
    namespace: ns.namespace,
    module: {
      ...ns.module,
      functions: ns.module.functions.filter(keepsFunction),
      variables: ns.module.variables.filter(keepsMember("VARIABLE")),
      constants: ns.module.constants.filter(keepsMember("CONSTANT")),
      properties: ns.module.properties.filter(keepsMember("PROPERTY")),
      typedefs: ns.module.typedefs.filter(keepsMember("TYPEDEF")),
    },
    availability: {
      // The label axis stays the full tracked set on purpose: `availabilityLabels`
      // and `badgeCategory` recompute a span against it at render time, so
      // narrowing it here would silently relabel a symbol the window merely
      // scoped — a `Since Defold X` badge collapsing to "available everywhere".
      versions: ns.availability.versions,
      records: new Map([...ns.availability.records].filter(([key]) => kept.has(key))),
      transitions: ns.availability.transitions,
    },
    entries: survivors.map((entry) => ({
      ...entry,
      authoritativeSignature: windowedSignature(entry, signatures, inSlice),
    })),
  };
}

/**
 * Narrow an already-built Combined projection to a `[from, to]` window: an entry
 * survives when its `availableIn` meets the inclusive slice of the tracked axis
 * between the two bounds, and a namespace left with no entry is dropped. `to`
 * alone excludes a symbol added after the target; `from` alone excludes one whose
 * span ended before the reader cares.
 *
 * Membership is the only thing that narrows. The returned `versions` and every
 * namespace's `availability.versions` stay the full tracked axis, so labels
 * remain absolute; the bounds ride along on {@link CombinedSurface.window}
 * instead. Pure — the input surface is memoized process-wide and is never
 * mutated.
 */
export function windowCombinedSurface(
  combined: CombinedSurface,
  signatures: SignaturesArtifact,
  window: VersionWindow,
): CombinedSurface {
  const inSlice = new Set(windowSlice(combined.versions, window));
  const namespaces: CombinedNamespace[] = [];
  for (const ns of combined.namespaces) {
    const windowed = windowNamespace(ns, signatures, inSlice);
    if (windowed) namespaces.push(windowed);
  }
  return { versions: combined.versions, namespaces, window };
}

/**
 * Resolve a route's version and its optional `?since=` into a valid window.
 * Both vocabularies are accepted for either bound. An untracked `to` is
 * unresolvable (`null`) so the route layer can 404 it; an untracked or malformed
 * `since` is a hand-edited URL rather than a missing page, so it widens to the
 * oldest tracked version, and a `since` newer than `to` clamps down to `to` —
 * `from > to` is never representable.
 */
export function resolveVersionWindow(
  versions: readonly string[],
  to: string,
  since: string | null | undefined,
): VersionWindow | null {
  const target = bareVersion(to);
  if (!versions.includes(target)) return null;
  const oldest = versions[versions.length - 1] ?? target;
  if (!since) return { from: oldest, to: target };
  const wanted = bareVersion(since);
  if (!versions.includes(wanted)) return { from: oldest, to: target };
  return { from: isOlder(target, wanted) ? target : wanted, to: target };
}

/**
 * The route a window addresses: the `to` bound owns the path version and `from`
 * rides in `?since=`, emitted only when it is not the oldest tracked version so
 * the full-range URL stays clean. The single place the path/query split is
 * encoded.
 */
export function windowHref(
  namespace: string | undefined,
  window: VersionWindow,
  versions: readonly string[],
  versionId: (bare: string) => string = defoldVersionId,
): string {
  const path = `/api/${versionId(window.to)}${namespace ? `/${namespace}` : ""}`;
  return window.from === versions[versions.length - 1]
    ? path
    : `${path}?since=${versionId(window.from)}`;
}

// The route segment a bare axis version is addressed by. Defaults to the
// `defold-` release convention every tracked target follows today; a registry
// whose ids are shaped otherwise passes its own mapper rather than having the
// prefix baked into the URL.
function defoldVersionId(bare: string): string {
  return `defold-${bare}`;
}

// True when any version the window spans contributes a page for the namespace.
// Each map value is that version's own contribution, so ownership over a range
// is the union across the slice rather than a lookup at either bound.
function ownsInWindow(
  namespacesByVersion: Record<string, readonly string[]>,
  namespace: string,
  window: VersionWindow,
  versions: readonly string[],
): boolean {
  return windowSlice(versions, window).some((version) =>
    (namespacesByVersion[version] ?? []).includes(namespace),
  );
}

/**
 * Both selector columns for a namespace, with the clamp already applied so the
 * markup renders plain links and holds no logic: choosing a bound always honors
 * that bound exactly and moves the *other* one only when it would otherwise be
 * crossed. A JS-disabled reader following any of these hrefs lands on a valid
 * window.
 *
 * `namespacesByVersion` (bare-keyed, optional) makes the namespace conditional:
 * an option keeps it only when the window its href *addresses* contains a page
 * for it, and otherwise drops to that window's index. The check is the whole
 * window rather than its `to` bound because the destination is a range: a
 * namespace that ended before `to` is still on the page the option opens, and
 * that window is always inside the routed `{oldest, to}` family, so a preserved
 * namespace can never link at a 404. Omitting the map keeps the namespace on
 * every option, which is right for a surface that owns it everywhere.
 */
export function windowOptionHrefs(
  namespace: string | undefined,
  window: VersionWindow,
  versions: readonly string[],
  namespacesByVersion?: Record<string, readonly string[]>,
  versionId?: (bare: string) => string,
): WindowOptionHrefs {
  const optionFor = (bound: VersionWindow, marked: boolean, version: string): WindowOption => {
    const owned =
      !namespace ||
      !namespacesByVersion ||
      ownsInWindow(namespacesByVersion, namespace, bound, versions);
    return {
      version,
      href: windowHref(owned ? namespace : undefined, bound, versions, versionId),
      isCurrent: marked,
    };
  };
  return {
    from: versions.map((version) =>
      optionFor(
        { from: version, to: isOlder(version, window.to) ? window.to : version },
        version === window.from,
        version,
      ),
    ),
    to: versions.map((version) =>
      optionFor(
        { from: isOlder(window.from, version) ? window.from : version, to: version },
        version === window.to,
        version,
      ),
    ),
  };
}
