// The ledger line a pinned entry's evidence is recorded under, `<TABLE>:<key>`,
// so a key two tables share never vouches for the other table's entry.
export function pinEvidenceKey(table: string, key: string): string {
  return `${table}:${key}`;
}

export interface BindingPin {
  // Relative to the target's vendored `engine/` tree.
  readonly file: string;
  // Paths an older release keeps the same binding under; a target that does
  // not vendor `file` is read at the first of these it vendors.
  readonly formerFiles?: readonly string[];
  readonly cFunction: string;
  // Token snippets the function body must contain and must lack; at least one.
  readonly contains?: string;
  readonly lacks?: string;
  // A macro whose `#ifdef` must enclose `contains`; the pin holds only if the
  // function shows the snippet and, read with that `#ifdef`'s arms skipped, the
  // function is gone or lacks it.
  readonly guard?: string;
}

// A token snippet the target's vendored engine evidence must contain. With
// `cFunction` it is matched in that function's body, without it anywhere in
// the file.
export interface EngineSourcePin {
  // Relative to the target's vendored `engine/` tree, as `BindingPin.file` is.
  readonly file: string;
  readonly cFunction?: string;
  readonly contains: string;
}

// Text an element's own ref-doc states, which an entry only makes precise. It
// holds where a retained target's ref-doc for that element contains it, compared
// with tags dropped and whitespace collapsed. It classifies the entry and never
// gates its emit.
export interface RefDocPin {
  readonly contains: string;
}

// The pins a correction entry may carry, of which it carries one. A `refDoc`
// pin only classifies it. A `binding` pin, or `engine` pins that must all hold,
// rest it on the engine source: it then applies only on a target whose vendored
// source shows the pin (the `EmitOptions.bindingEvidence` keys).
export interface CorrectionPins {
  readonly refDoc?: RefDocPin;
  readonly binding?: BindingPin;
  readonly engine?: readonly EngineSourcePin[];
}

// Whether the entry `key` of `table` applies on the target whose engine evidence
// is `bindingEvidence`: an entry with no `binding` or `engine` pin applies
// everywhere, and a pinned one only where its ledger line is in the evidence.
export function pinnedEntryApplies(
  table: string,
  key: string,
  pins: CorrectionPins,
  bindingEvidence: ReadonlySet<string>,
): boolean {
  if (pins.binding === undefined && pins.engine === undefined) return true;
  return bindingEvidence.has(pinEvidenceKey(table, key));
}

// The entry `table` holds for `key`, where it applies on the target whose engine
// evidence is `bindingEvidence`.
export function evidencedEntry<Entry extends CorrectionPins>(
  table: string,
  entries: ReadonlyMap<string, Entry>,
  key: string,
  bindingEvidence: ReadonlySet<string>,
): Entry | undefined {
  const entry = entries.get(key);
  return entry !== undefined && pinnedEntryApplies(table, key, entry, bindingEvidence)
    ? entry
    : undefined;
}
