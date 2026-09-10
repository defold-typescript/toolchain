import { type ApiModule, parseDefoldApiDoc } from "./api-doc";
import { isMarkedOptional } from "./emit-dts";

export interface ProvenanceSurface {
  readonly target: string;
  readonly namespace: string;
  readonly doc: unknown;
}

export interface CorrectionProvenance {
  readonly key: string;
  readonly sightedIn: readonly string[];
  readonly neededBy: readonly string[];
  readonly markedIn: readonly string[];
}

interface ManifestEntry {
  readonly namespace: string;
  readonly doc: unknown;
}

interface VersionedManifestEntry extends ManifestEntry {
  readonly versionId: string;
  readonly editor?: boolean;
}

// Every runtime module regen emits through the global correction table: the
// default target's manifest plus every older generated target's. Editor-VM
// entries are outside the scope the corrections cover.
export function retainedSurfaces(
  defaultTarget: string,
  defaultManifest: readonly ManifestEntry[],
  versionedManifest: readonly VersionedManifestEntry[],
): ProvenanceSurface[] {
  return [
    ...defaultManifest.map((entry) => ({
      target: defaultTarget,
      namespace: entry.namespace,
      doc: entry.doc,
    })),
    ...versionedManifest
      .filter((entry) => entry.editor !== true)
      .map((entry) => ({ target: entry.versionId, namespace: entry.namespace, doc: entry.doc })),
  ];
}

const PARAM_SEPARATOR = ":param:";

// A target needs a correction while any sighting of the slot there is unmarked,
// so an overload that marks it in one declaration and not another still needs
// it. The correction can go only once no target needs it.
export function correctionProvenance(
  keys: readonly string[],
  surfaces: readonly ProvenanceSurface[],
): CorrectionProvenance[] {
  const parsed = new Map<ProvenanceSurface, ApiModule>();
  const parse = (surface: ProvenanceSurface): ApiModule => {
    let module = parsed.get(surface);
    if (!module) {
      module = parseDefoldApiDoc(surface.doc);
      parsed.set(surface, module);
    }
    return module;
  };

  return keys.map((key) => {
    const separator = key.lastIndexOf(PARAM_SEPARATOR);
    if (separator < 0) throw new Error(`correctionProvenance: malformed key ${key}`);
    const element = key.slice(0, separator);
    const slot = key.slice(separator + PARAM_SEPARATOR.length);
    const namespace = element.slice(0, element.lastIndexOf("."));

    const markedByTarget = new Map<string, boolean>();
    for (const surface of surfaces) {
      if (surface.namespace !== namespace) continue;
      for (const fn of parse(surface).functions) {
        if (fn.name !== element) continue;
        for (const parameter of fn.parameters) {
          if (parameter.name !== slot) continue;
          const marked = markedByTarget.get(surface.target) ?? true;
          markedByTarget.set(surface.target, marked && isMarkedOptional(parameter));
        }
      }
    }

    const sightedIn = [...markedByTarget.keys()].sort();
    return {
      key,
      sightedIn,
      neededBy: sightedIn.filter((target) => markedByTarget.get(target) === false),
      markedIn: sightedIn.filter((target) => markedByTarget.get(target) === true),
    };
  });
}

// Reads the raw doc rather than `parseDefoldApiDoc`, which folds an absent
// `is_optional` into `isOptional: false` and so erases the difference between a
// parameter upstream calls required and one it never classified at all.
export function whollyUnmarkedNamespaces(
  surfaces: readonly ProvenanceSurface[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const surface of surfaces) {
    const namespaces = out.get(surface.target) ?? [];
    out.set(surface.target, namespaces);
    const parameters = rawFunctionParameters(surface.doc);
    if (parameters.length > 0 && parameters.every((parameter) => !("is_optional" in parameter))) {
      namespaces.push(surface.namespace);
    }
  }
  for (const namespaces of out.values()) namespaces.sort();
  return out;
}

function rawFunctionParameters(doc: unknown): Record<string, unknown>[] {
  if (!isRecord(doc) || !Array.isArray(doc.elements)) return [];
  return doc.elements.flatMap((element) =>
    isRecord(element) && element.type === "FUNCTION" && Array.isArray(element.parameters)
      ? element.parameters.filter(isRecord)
      : [],
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
