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
import type { AvailabilityLookup } from "./api-surface";

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
    const availableIn = presence.get(key)?.availableIn ?? [];
    const newest = versions.find((version) => availableIn.includes(version)) ?? versions[0] ?? "";
    return {
      identity,
      authoritativeSignature: input.signatures.versions[newest]?.[key] ?? "",
      availableIn,
      label: availabilityLabel(availableIn, versions),
      transition: transitionNames.has(nameKey(identity)),
      ...curatedFacts(overlayRecords?.get(key)),
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
      const availableIn = presence.get(key)?.availableIn ?? [];
      const curated = overlayRecords?.get(key);
      // A symbol present in every version and carrying no curated fact needs no
      // badge, so it holds no record — the render layer then shows nothing.
      if (availableIn.length === versions.length && !curated) continue;
      records.set(key, { identity, availableIn, ...curatedFacts(curated) });
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
