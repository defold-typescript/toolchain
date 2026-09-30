import { type ApiModule, parseDefoldApiDoc } from "./api-doc";
import { correctionPins, pinMatches } from "./correction-pins";
import type { ParamTypeCorrection } from "./emit-dts";
import type { ProvenanceSurface } from "./optional-correction-provenance";

export interface ParamTypeProvenance {
  readonly key: string;
  readonly sightedIn: readonly string[];
  readonly neededBy: readonly string[];
  readonly resolvedIn: readonly string[];
}

const PARAM_SEPARATOR = ":param:";

// A target needs a correction while any declaration of the slot there still
// states one of its pins, so an overload that shows the defect keeps it alive.
// `nil` is optionality, which `isDocOptional` owns, so `pinMatches` compares
// only the concrete tokens. Any other declared token set — fixed, or retyped
// without a `retypedUpstream` pin — no longer carries the contradiction the
// entry records, and the entry goes once no target needs it.
export function paramCorrectionProvenance(
  entries: readonly [string, ParamTypeCorrection][],
  surfaces: readonly ProvenanceSurface[],
): ParamTypeProvenance[] {
  const parsed = new Map<ProvenanceSurface, ApiModule>();
  const parse = (surface: ProvenanceSurface): ApiModule => {
    let module = parsed.get(surface);
    if (!module) {
      module = parseDefoldApiDoc(surface.doc);
      parsed.set(surface, module);
    }
    return module;
  };

  return entries.map(([key, correction]) => {
    const separator = key.lastIndexOf(PARAM_SEPARATOR);
    if (separator < 0) throw new Error(`paramCorrectionProvenance: malformed key ${key}`);
    const element = key.slice(0, separator);
    const slot = key.slice(separator + PARAM_SEPARATOR.length);
    const namespace = element.slice(0, element.lastIndexOf("."));
    const pins = correctionPins(correction);

    const neededByTarget = new Map<string, boolean>();
    for (const surface of surfaces) {
      if (surface.namespace !== namespace) continue;
      for (const fn of parse(surface).functions) {
        if (fn.name !== element) continue;
        for (const parameter of fn.parameters) {
          if (parameter.name !== slot) continue;
          const needed = neededByTarget.get(surface.target) ?? false;
          neededByTarget.set(surface.target, needed || pinMatches(parameter.types, pins));
        }
      }
    }

    const sightedIn = [...neededByTarget.keys()].sort();
    return {
      key,
      sightedIn,
      neededBy: sightedIn.filter((target) => neededByTarget.get(target) === true),
      resolvedIn: sightedIn.filter((target) => neededByTarget.get(target) === false),
    };
  });
}
