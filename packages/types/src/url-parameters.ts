import type { ApiModule } from "./api-doc";

// How a parameter names something the project declares. `none` is the default
// and the only non-affirmative value: a type shape is necessary but not
// sufficient (`model.get_mesh_enabled#mesh_id` carries the address triple while
// naming a mesh inside the model asset), so a slot is classified only
// deliberately. The first three address the scene graph; `gui-node` names a node
// inside the one `.gui` that owns the script, which is not an address at all;
// `animation` names a block inside the atlas of a component a *sibling*
// argument addresses, which is why it is the one class needing a companion;
// `resource-path` names a project file outright, so it is scoped by the
// extensions its entry declares rather than by anything in the scene graph.
export type UrlParameterClass =
  | "none"
  | "game-object"
  | "component"
  | "either"
  | "gui-node"
  | "animation"
  | "resource-path";

export interface UrlParameterEntry {
  fqn: string;
  parameter: string;
  class: UrlParameterClass;
  // The parameter of the *same* function whose literal names the component the
  // candidates are scoped to. Required for `animation` and absent otherwise —
  // enforced by the drift guard rather than the type, because a per-class entry
  // shape would fan the table's one interface out into a union for a single
  // optional field.
  addressParameter?: string;
  // The file extensions this slot's literal may name, each written with its
  // leading dot. Required for `resource-path` and absent otherwise — enforced by
  // the drift guard for the same reason `addressParameter` is. Recorded per
  // entry rather than per class because the six constructors sharing the class
  // each accept a different one.
  resourceExtensions?: readonly string[];
  // `"generated"` for a slot the emitter derives from the ref-doc, otherwise a
  // package-relative path to the hand-authored `.d.ts` that declares it,
  // resolved against the `packages/types` package root. Not repo-relative: the
  // table ships inside `@defold-typescript/types`, so a published consumer has
  // no repo root to resolve a `packages/types/` prefix against.
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
  types: readonly string[];
  // The declaring function's ref-doc examples, verbatim. The parameter prose
  // alone cannot refute a `resource-path` extension — every one of the six reads
  // "optional resource path string to the resource" — so the example is the only
  // place the claim is checkable.
  examples: string;
}

const ADDRESS_TYPES = ["string", "hash", "url"] as const;

// The type shape a class needs its slot to carry. A classification is a judgment
// about prose, but it is still refutable by the signature: nothing that cannot
// hold a `url` can be an address, and nothing that cannot hold a `string` can
// name a node.
export const REQUIRED_TYPES: Record<Exclude<UrlParameterClass, "none">, readonly string[]> = {
  "game-object": ADDRESS_TYPES,
  component: ADDRESS_TYPES,
  either: ADDRESS_TYPES,
  "gui-node": ["string", "hash"],
  animation: ["string", "hash"],
  "resource-path": ["string"],
};

function bareName(fqn: string): string {
  const lastDot = fqn.lastIndexOf(".");
  return lastDot === -1 ? fqn : fqn.slice(lastDot + 1);
}

function carriesAll(types: readonly string[], required: readonly string[]): boolean {
  const lowered = new Set(types.map((token) => token.toLowerCase()));
  return required.every((token) => lowered.has(token));
}

function carriesAddressTriple(types: readonly string[]): boolean {
  return carriesAll(types, ADDRESS_TYPES);
}

// Whether a slot declaring `types` could carry `parameterClass`. A superset is
// fine — the shape is a floor, not an equality — and `none` is always satisfied
// because it asserts nothing.
export function parameterTypesSatisfyClass(
  types: readonly string[],
  parameterClass: UrlParameterClass,
): boolean {
  if (parameterClass === "none") return true;
  return carriesAll(types, REQUIRED_TYPES[parameterClass]);
}

// The generated surface's whole parameter universe. Functions named in a
// module's `skipFunctions` contribute nothing: the emitter suppresses them in
// favour of hand-authored overloads, so counting them here would conflate the
// two surfaces.
export function collectParameterSlots(sources: readonly UrlParameterSource[]): UrlParameterSlot[] {
  const slots: UrlParameterSlot[] = [];
  for (const { module, skipFunctions } of sources) {
    const skipped = new Set(skipFunctions ?? []);
    for (const fn of module.functions) {
      if (skipped.has(bareName(fn.name))) continue;
      for (const parameter of fn.parameters) {
        slots.push({
          fqn: fn.name,
          parameter: parameter.name,
          module: module.namespace,
          doc: parameter.doc,
          types: parameter.types,
          examples: fn.examples ?? "",
        });
      }
    }
  }
  return slots;
}

// The address-triple subset of the above — the universe a classification survey
// of `msg.post`-shaped slots walks.
export function collectUrlParameterSlots(
  sources: readonly UrlParameterSource[],
): UrlParameterSlot[] {
  return collectParameterSlots(sources).filter((slot) => carriesAddressTriple(slot.types));
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
