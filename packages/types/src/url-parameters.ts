import type { ApiModule } from "./api-doc";

// How a parameter addresses the scene graph. `none` is the default and the only
// non-affirmative value: the `string | hash | url` triple is necessary but not
// sufficient (`model.get_mesh_enabled#mesh_id` carries it while naming a mesh
// inside the model asset), so a slot is addressing only once it is classified.
export type UrlParameterClass = "none" | "game-object" | "component" | "either";

export interface UrlParameterEntry {
  fqn: string;
  parameter: string;
  class: UrlParameterClass;
  // `"generated"` for a slot the emitter derives from the ref-doc, otherwise a
  // repo-relative path to the hand-authored `.d.ts` that declares it.
  source: string;
  // A verbatim phrase from the ref-doc `doc` the classification was judged from;
  // required whenever `source` is `"generated"`, absent for hand-authored slots
  // that have no ref-doc prose to pin against.
  evidence?: string;
}

export type UrlParameterTable = UrlParameterEntry[];

export interface UrlParameterSource {
  module: ApiModule;
  skipFunctions?: readonly string[];
}

export interface UrlParameterSlot {
  fqn: string;
  parameter: string;
  module: string;
  doc: string;
}

const ADDRESS_TYPES = ["string", "hash", "url"] as const;

function bareName(fqn: string): string {
  const lastDot = fqn.lastIndexOf(".");
  return lastDot === -1 ? fqn : fqn.slice(lastDot + 1);
}

function carriesAddressTriple(types: readonly string[]): boolean {
  const lowered = new Set(types.map((token) => token.toLowerCase()));
  return ADDRESS_TYPES.every((token) => lowered.has(token));
}

// The generated surface's triple-typed parameter universe. Functions named in a
// module's `skipFunctions` contribute nothing: the emitter suppresses them in
// favour of hand-authored overloads, so counting them here would conflate the
// two surfaces.
export function collectUrlParameterSlots(
  sources: readonly UrlParameterSource[],
): UrlParameterSlot[] {
  const slots: UrlParameterSlot[] = [];
  for (const { module, skipFunctions } of sources) {
    const skipped = new Set(skipFunctions ?? []);
    for (const fn of module.functions) {
      if (skipped.has(bareName(fn.name))) continue;
      for (const parameter of fn.parameters) {
        if (!carriesAddressTriple(parameter.types)) continue;
        slots.push({
          fqn: fn.name,
          parameter: parameter.name,
          module: module.namespace,
          doc: parameter.doc,
        });
      }
    }
  }
  return slots;
}

// Pure lookup, dependency-free like `signature-store.ts`: this module is
// reachable from `index.ts`, so a `node:fs`/ambient-`Bun` reference here would
// fail type-checking in every downstream consumer that compiles the shipped
// `src/` graph.
export function classifyUrlParameter(
  table: UrlParameterTable,
  fqn: string,
  parameter: string,
): UrlParameterClass {
  for (const entry of table) {
    if (entry.fqn === fqn && entry.parameter === parameter) return entry.class;
  }
  return "none";
}
