import {
  type ApiAvailability,
  type ApiFunction,
  type ApiModule,
  type ApiSymbolIdentity,
  type ApiVariable,
  type AvailabilityLabel,
  availabilityLabel,
  groupByLogicalName,
  isSignatureTransition,
  normalizedFunctionSignature,
  symbolIdentityKey,
} from "@defold-typescript/types";
import { type ApiPage, type AvailabilityLookup, badgeCategoryFromLabel } from "./api-surface";

type ApiConstant = ApiModule["constants"][number];
type ApiProperty = ApiModule["properties"][number];
type ApiTypedef = ApiModule["typedefs"][number];

/**
 * The authoritative signatures artifact (`packages/types/api-signatures.json`):
 * bare-semver version -> {@link symbolIdentityKey} -> the TypeScript declaration
 * text for that symbol in that version. The Combined model reads a symbol's
 * signature from here rather than re-rendering it from ref-doc tokens, so the
 * projection cannot drift from the shipped `generated/*.d.ts`.
 */
export interface SignaturesArtifact {
  readonly versions: Record<string, Record<string, string>>;
}

/** One tracked version's engine surface, addressed by bare semver (`1.13.0`). */
export interface CombinedVersionSurface {
  readonly version: string;
  readonly modules: readonly ApiModule[];
}

export interface BuildCombinedSurfaceInput {
  readonly surfaces: readonly CombinedVersionSurface[];
  readonly signatures: SignaturesArtifact;
  /**
   * The committed `api-availability.json` lookup, consulted only for curated
   * facts (deprecation, replacement, Box2D backend) that the ref-doc snapshots
   * do not carry. Presence/`availableIn` is always recomputed from `surfaces`,
   * so a newly tracked version flows through without touching this overlay.
   */
  readonly overlay?: AvailabilityLookup;
}

/**
 * A single union symbol on the Combined surface: its node-free identity, the
 * authoritative signature for its newest version present, the recomputed
 * `availableIn` span and friendly label, whether it is one arm of a signature
 * transition, and any curated lifecycle facts. This is the domain row the
 * website render and (later) the search/LLM serialization both consume.
 */
export interface CombinedEntry {
  readonly identity: ApiSymbolIdentity;
  readonly authoritativeSignature: string;
  readonly availableIn: readonly string[];
  readonly label: AvailabilityLabel;
  readonly transition: boolean;
  readonly deprecatedSince?: string;
  readonly replacement?: ApiSymbolIdentity;
  readonly box2d?: NonNullable<ApiAvailability["box2d"]>;
}

/**
 * One namespace projected across every tracked version: the deterministically
 * ordered union `module` (signature transitions rendered adjacent, oldest arm
 * first), the synthetic availability lookup that feeds the existing badge
 * renderer (a symbol present in every version and carrying no curated fact holds
 * no record, hence no badge), and the per-symbol `entries`.
 */
export interface CombinedNamespace {
  readonly namespace: string;
  readonly module: ApiModule;
  readonly availability: AvailabilityLookup;
  readonly entries: readonly CombinedEntry[];
}

export interface CombinedSurface {
  readonly versions: readonly string[];
  readonly namespaces: readonly CombinedNamespace[];
}

/**
 * Project one Combined namespace as an `ApiPage` for the shared render / index /
 * search machinery: an `engine` page routed at the canonical `/api/<namespace>`,
 * carrying the union `module` and the synthetic availability lookup. Combined is
 * the canonical unprefixed surface, so the projection owns the canonical route at
 * its source — no consumer re-maps it afterward. Combined omits example
 * translations (they render as their Lua fallback) and signature overrides. Pure
 * — the node-free counterpart the canonical `/api` routes, the search index, and
 * the symbol index all reuse so none re-walks the raw per-version surfaces.
 */
export function combinedNamespaceToApiPage(ns: CombinedNamespace): ApiPage {
  return {
    namespace: ns.namespace,
    route: `/api/${ns.namespace}`,
    brief: ns.module.brief,
    module: ns.module,
    translations: {},
    signatures: {},
    category: "engine",
    availability: ns.availability,
    authoritativeSignatures: combinedAuthoritativeSignatures(ns),
  };
}

// Validates that a keyword/`;`-stripped member declaration is a well-formed
// `<binding>: T` before its type portion is spliced after the public identity
// name. The binding token itself is discarded (it may be an emitter-safe alias
// such as `_null`); only the type after the first `:` is kept.
const memberInnerFormShape = /^[A-Za-z_$][\w$]*\s*:/;

/**
 * Reduce an authoritative declaration from `api-signatures.json` to the inner
 * form the `/api` render layer emits, dispatching on the symbol's kind:
 *
 * - `FUNCTION` (`function get_constants(…): …;`) drops `function `/`;` and
 *   splices the namespace-qualified `identity.name` before the first `(`, so
 *   both arms of a signature transition re-qualify to their own overload.
 * - `CONSTANT`/`VARIABLE` (`const NAME: T;`, `const _mangled: T;`) and
 *   `PROPERTY` (`name: T;`) drop an optional binding keyword and `;`, then
 *   splice the namespace-qualified public `identity.name` before the type
 *   portion, so an emitter-safe binding alias (`_null`, `_delete`) never leaks.
 * - `TYPEDEF` (`type Name = T;`) drops the trailing `;` (dormant: pure aliases
 *   are not rendered as page symbols today, so nothing displays this yet).
 *
 * Returns `""` when the declaration does not match its kind's expected shape, so
 * an unrenderable entry falls the render layer back to the token-derived form.
 */
function innerRenderSignature(identity: ApiSymbolIdentity, declaration: string): string {
  const decl = declaration.trim();
  switch (identity.kind) {
    case "FUNCTION": {
      if (!decl.startsWith("function ")) return "";
      const body = decl.replace(/^function /, "").replace(/;\s*$/, "");
      const paren = body.indexOf("(");
      if (paren === -1) return "";
      return `${identity.name}${body.slice(paren)}`;
    }
    case "CONSTANT":
    case "VARIABLE":
    case "PROPERTY": {
      const body = decl.replace(/^(?:const|let|var)\s+/, "").replace(/;\s*$/, "");
      if (!memberInnerFormShape.test(body)) return "";
      return `${identity.name}: ${body.slice(body.indexOf(":") + 1).trim()}`;
    }
    case "TYPEDEF": {
      if (!decl.startsWith("type ")) return "";
      return decl.replace(/;\s*$/, "");
    }
    default:
      return "";
  }
}

/**
 * The exact-identity ({@link symbolIdentityKey}) to inner-render-form signature
 * map a Combined `ApiPage` carries. Keyed by the entry's identity so two arms of
 * a signature transition resolve to their own distinct authoritative signature.
 * Every kind is emitted with its namespace-qualified public identity name
 * (functions and members alike); an entry whose declaration does not match its
 * kind's expected shape is skipped, so a lookup miss falls the render layer back
 * to the token-derived signature.
 */
export function combinedAuthoritativeSignatures(
  ns: CombinedNamespace,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const entry of ns.entries) {
    const inner = innerRenderSignature(entry.identity, entry.authoritativeSignature);
    if (inner) map.set(symbolIdentityKey(entry.identity), inner);
  }
  return map;
}

/**
 * The llms-full line body for a Combined entry, kind-aware so the agent contract
 * never carries an emitter-safe binding alias. A `FUNCTION` keeps its full
 * authoritative declaration (`function …;`) verbatim; a member (constant,
 * variable, property) emits the shared public inner form (`json.null: unknown`,
 * not `const _null`). Falls back to the raw declaration only for a member whose
 * declaration does not match its expected shape.
 */
export function llmsSignatureForEntry(entry: CombinedEntry): string {
  if (entry.identity.kind === "FUNCTION") return entry.authoritativeSignature;
  return (
    innerRenderSignature(entry.identity, entry.authoritativeSignature) ||
    entry.authoritativeSignature
  );
}

/** Every Combined namespace projected as an `ApiPage`, in projection order. */
export function combinedApiPages(combined: CombinedSurface): ApiPage[] {
  return combined.namespaces.map(combinedNamespaceToApiPage);
}

/**
 * The availability span tag alone — `[since X]`, `[through X]`, `[versions: …]`,
 * or the closed-range `[X–Y]`; `""` for an all-versions span. The lifecycle
 * tail ({@link compactAvailability}) builds on this.
 */
function spanTag(label: AvailabilityLabel): string {
  switch (label.kind) {
    case "since":
      return `[since ${label.from}]`;
    case "through":
      return `[through ${label.to}]`;
    case "range":
      return `[${label.from}–${label.to}]`;
    case "discrete":
      return `[versions: ${(label.versions ?? []).join(", ")}]`;
    default:
      return "";
  }
}

/**
 * The compact, machine-readable availability tail an agent-facing artifact
 * appends to a Combined entry's authoritative signature: the span tag, then any
 * curated lifecycle facts — `[signature transition]` (one arm of a same-name
 * overload change), `[deprecated since X]`, `[replaced by namespace.symbol]`,
 * `[Box2D: …]` — in that deterministic order, space-joined and text-only. An
 * entry present in every tracked version and carrying no curated fact yields the
 * empty string, so the absence of a tag reads as "available in every tracked
 * version, no lifecycle caveat".
 */
export function compactAvailability(entry: CombinedEntry): string {
  const tags: string[] = [];
  const span = spanTag(entry.label);
  if (span) tags.push(span);
  if (entry.transition) tags.push("[signature transition]");
  if (entry.deprecatedSince) tags.push(`[deprecated since ${entry.deprecatedSince}]`);
  if (entry.replacement) tags.push(`[replaced by ${entry.replacement.name}]`);
  if (entry.box2d && entry.box2d.length > 0) tags.push(`[Box2D: ${entry.box2d.join(", ")}]`);
  return tags.join(" ");
}

/** Per-category badge tallies for a Combined namespace title. */
export interface NamespaceBadgeCounts {
  readonly new: number;
  readonly changed: number;
  readonly deprecated: number;
}

/**
 * Tally the color-badge categories over a Combined namespace's entries: each
 * entry adds to every category it carries (a changed-and-deprecated symbol bumps
 * both). Derives from the entry's already-computed `label.kind` + `deprecatedSince`
 * via the shared {@link badgeCategoryFromLabel}, so the title pills and the
 * per-symbol dots can never disagree.
 */
export function namespaceBadgeCounts(ns: CombinedNamespace): NamespaceBadgeCounts {
  let isNew = 0;
  let changed = 0;
  let deprecated = 0;
  for (const entry of ns.entries) {
    const category = badgeCategoryFromLabel(entry.label.kind, entry.deprecatedSince !== undefined);
    if (category.isNew) isNew += 1;
    if (category.isChanged) changed += 1;
    if (category.isDeprecated) deprecated += 1;
  }
  return { new: isNew, changed, deprecated };
}

function compareSemverDesc(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10));
  const pb = b.split(".").map((part) => Number.parseInt(part, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) return db - da;
  }
  if (a < b) return 1;
  if (a > b) return -1;
  return 0;
}

/**
 * Widen a presence-derived `availableIn` with the existence a curated
 * `deprecatedSince` proves: a symbol deprecated as of `D` existed in every
 * tracked version `<= D`, even those whose (incomplete) typings omit it. Unions
 * every such version into `availableIn` and returns the result in the canonical
 * newest-first axis order. With no `deprecatedSince` the presence set is returned
 * unchanged, so a genuinely-new symbol never over-widens.
 */
function availableWithDeprecation(
  availableIn: readonly string[],
  deprecatedSince: string | undefined,
  versions: readonly string[],
): string[] {
  if (deprecatedSince === undefined) return [...availableIn];
  const covered = new Set(availableIn);
  for (const version of versions) {
    if (compareSemverDesc(version, deprecatedSince) >= 0) covered.add(version);
  }
  return versions.filter((version) => covered.has(version));
}

function nameKey(id: Pick<ApiSymbolIdentity, "namespace" | "kind" | "name">): string {
  return `${id.namespace} ${id.kind} ${id.name}`;
}

function memberIdentity(namespace: string, kind: string, name: string): ApiSymbolIdentity {
  return { namespace, kind, name, signature: "" };
}

function funcIdentity(namespace: string, fn: ApiFunction): ApiSymbolIdentity {
  return { namespace, kind: "FUNCTION", name: fn.name, signature: normalizedFunctionSignature(fn) };
}

function curatedFacts(
  record: ApiAvailability | undefined,
): Pick<CombinedEntry, "deprecatedSince" | "replacement" | "box2d"> {
  if (!record) return {};
  return {
    ...(record.deprecatedSince !== undefined ? { deprecatedSince: record.deprecatedSince } : {}),
    ...(record.replacement !== undefined ? { replacement: record.replacement } : {}),
    ...(record.box2d !== undefined ? { box2d: record.box2d } : {}),
  };
}

interface PresenceRecord {
  identity: ApiSymbolIdentity;
  availableIn: string[];
}

interface NamespaceAccumulator {
  namespace: string;
  brief: string;
  description: string;
  functions: Map<string, ApiFunction>;
  variables: Map<string, ApiVariable>;
  constants: Map<string, ApiConstant>;
  properties: Map<string, ApiProperty>;
  typedefs: Map<string, ApiTypedef>;
}

/**
 * Build the reusable Combined projection domain model from an ordered set of
 * per-version engine surfaces. Presence (`availableIn`) is recomputed from the
 * surfaces themselves — the version axis is derived by descending semver so the
 * output is independent of input order and auto-expands when a version is added.
 * Signatures come from the authoritative artifact; curated lifecycle facts are
 * overlaid from `api-availability.json`. Pure data: no JSX, no I/O.
 */
export function buildCombinedSurface(input: BuildCombinedSurfaceInput): CombinedSurface {
  const surfaces = [...input.surfaces].sort((a, b) => compareSemverDesc(a.version, b.version));
  const versions = surfaces.map((surface) => surface.version);
  const overlayRecords = input.overlay?.records;

  // Per-identity presence (newest-first, mirroring the canonical version axis)
  // plus the newest concrete definition object seen for each identity.
  const presence = new Map<string, PresenceRecord>();
  const namespaces = new Map<string, NamespaceAccumulator>();
  const accumFor = (module: ApiModule): NamespaceAccumulator => {
    let accum = namespaces.get(module.namespace);
    if (!accum) {
      accum = {
        namespace: module.namespace,
        brief: module.brief,
        description: module.description,
        functions: new Map(),
        variables: new Map(),
        constants: new Map(),
        properties: new Map(),
        typedefs: new Map(),
      };
      namespaces.set(module.namespace, accum);
    }
    return accum;
  };
  const seePresence = (identity: ApiSymbolIdentity, version: string): string => {
    const key = symbolIdentityKey(identity);
    const record = presence.get(key) ?? { identity, availableIn: [] };
    if (!record.availableIn.includes(version)) record.availableIn.push(version);
    presence.set(key, record);
    return key;
  };

  for (const surface of surfaces) {
    for (const module of surface.modules) {
      const accum = accumFor(module);
      for (const fn of module.functions) {
        const key = seePresence(funcIdentity(module.namespace, fn), surface.version);
        if (!accum.functions.has(key)) accum.functions.set(key, fn);
      }
      for (const variable of module.variables) {
        const key = seePresence(
          memberIdentity(module.namespace, "VARIABLE", variable.name),
          surface.version,
        );
        if (!accum.variables.has(key)) accum.variables.set(key, variable);
      }
      for (const constant of module.constants) {
        const key = seePresence(
          memberIdentity(module.namespace, "CONSTANT", constant.name),
          surface.version,
        );
        if (!accum.constants.has(key)) accum.constants.set(key, constant);
      }
      for (const property of module.properties) {
        const key = seePresence(
          memberIdentity(module.namespace, "PROPERTY", property.name),
          surface.version,
        );
        if (!accum.properties.has(key)) accum.properties.set(key, property);
      }
      for (const typedef of module.typedefs) {
        const key = seePresence(
          memberIdentity(module.namespace, "TYPEDEF", typedef.name),
          surface.version,
        );
        if (!accum.typedefs.has(key)) accum.typedefs.set(key, typedef);
      }
    }
  }

  // Signature transitions: logical names whose disjoint non-universal overloads
  // cover a contiguous span (the name never disappears, only its signature).
  const nonUniversal: ApiAvailability[] = [];
  for (const record of presence.values()) {
    if (record.availableIn.length < versions.length) {
      nonUniversal.push({ identity: record.identity, availableIn: record.availableIn });
    }
  }
  const transitionNames = new Set<string>();
  for (const group of groupByLogicalName(nonUniversal, versions)) {
    if (isSignatureTransition(group, versions)) transitionNames.add(nameKey(group));
  }

  const oldestIndex = (key: string): number =>
    (presence.get(key)?.availableIn ?? []).reduce(
      (max, version) => Math.max(max, versions.indexOf(version)),
      -1,
    );
  const byName = <T extends { name: string }>(a: T, b: T): number => a.name.localeCompare(b.name);
  const fnSort =
    (namespace: string) =>
    (a: ApiFunction, b: ApiFunction): number => {
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      const ka = symbolIdentityKey(funcIdentity(namespace, a));
      const kb = symbolIdentityKey(funcIdentity(namespace, b));
      // Oldest arm first: the overload reaching the oldest version (a higher index
      // on the newest-first axis) leads; the identity key is the stable tiebreak.
      const diff = oldestIndex(kb) - oldestIndex(ka);
      return diff !== 0 ? diff : ka.localeCompare(kb);
    };

  const entryFor = (identity: ApiSymbolIdentity): CombinedEntry => {
    const key = symbolIdentityKey(identity);
    const presenceIn = presence.get(key)?.availableIn ?? [];
    // The signature lookup stays on real presence — a widened version has no
    // typings to draw a declaration from.
    const newest = versions.find((version) => presenceIn.includes(version)) ?? versions[0] ?? "";
    const facts = curatedFacts(overlayRecords?.get(key));
    const availableIn = availableWithDeprecation(presenceIn, facts.deprecatedSince, versions);
    return {
      identity,
      authoritativeSignature: input.signatures.versions[newest]?.[key] ?? "",
      availableIn,
      label: availabilityLabel(availableIn, versions),
      transition: transitionNames.has(nameKey(identity)),
      ...facts,
    };
  };

  const result: CombinedNamespace[] = [];
  for (const accum of namespaces.values()) {
    const ns = accum.namespace;
    const functions = [...accum.functions.values()].sort(fnSort(ns));
    const variables = [...accum.variables.values()].sort(byName);
    const constants = [...accum.constants.values()].sort(byName);
    const properties = [...accum.properties.values()].sort(byName);
    const typedefs = [...accum.typedefs.values()].sort(byName);

    const identities: ApiSymbolIdentity[] = [
      ...functions.map((fn) => funcIdentity(ns, fn)),
      ...variables.map((v) => memberIdentity(ns, "VARIABLE", v.name)),
      ...constants.map((c) => memberIdentity(ns, "CONSTANT", c.name)),
      ...properties.map((p) => memberIdentity(ns, "PROPERTY", p.name)),
      ...typedefs.map((t) => memberIdentity(ns, "TYPEDEF", t.name)),
    ];

    const records = new Map<string, ApiAvailability>();
    for (const identity of identities) {
      const key = symbolIdentityKey(identity);
      const presenceIn = presence.get(key)?.availableIn ?? [];
      const curated = overlayRecords?.get(key);
      // A symbol present in every version and carrying no curated fact needs no
      // badge, so it holds no record — the render layer then shows nothing. The
      // skip keys on real presence: a deprecated symbol always carries a curated
      // fact, so widening never sneaks it past this guard.
      if (presenceIn.length === versions.length && !curated) continue;
      const facts = curatedFacts(curated);
      const availableIn = availableWithDeprecation(presenceIn, facts.deprecatedSince, versions);
      records.set(key, { identity, availableIn, ...facts });
    }

    result.push({
      namespace: ns,
      module: {
        namespace: ns,
        brief: accum.brief,
        description: accum.description,
        functions,
        variables,
        constants,
        properties,
        typedefs,
      },
      availability: { versions, records },
      entries: identities.map(entryFor),
    });
  }
  result.sort((a, b) => a.namespace.localeCompare(b.namespace));

  return { versions, namespaces: result };
}
