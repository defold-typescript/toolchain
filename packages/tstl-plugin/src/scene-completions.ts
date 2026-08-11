import type { AddressSlot } from "@defold-typescript/transpiler";
import type ts from "typescript";

// The editor's own `ts` is not in scope here and is not needed: this is a
// string-enum member whose value is its name, and the plugin builds plain data.
const STRING_KIND = "string" as ts.ScriptElementKind;

// One entry per component id, each replacing only the `#fragment` span inside
// the quotes. Nothing here touches the filesystem or the host, so the whole
// judgment is a function of the slot, the id universe, and what the base
// service already offers.
export function buildSceneCompletionEntries(input: {
  slot: AddressSlot;
  ids: ReadonlySet<string>;
  baseEntries: readonly ts.CompletionEntry[];
}): ts.CompletionEntry[] {
  const { slot, ids, baseEntries } = input;
  if (slot.fragmentStart === -1) return [];

  const fragmentOffset = slot.fragmentStart - slot.textStart;
  const replacementSpan = {
    start: slot.fragmentStart,
    length: slot.text.length - fragmentOffset,
  };
  // Where a project has generated the scene-derived URL union, the base service
  // already offers the whole address literal. Drop our duplicate rather than
  // the base's: the plugin only ever adds.
  const offered = new Set(baseEntries.map((base) => base.name));
  const prefix = slot.text.slice(0, fragmentOffset);

  // `sortText` is compared as a string, and TypeScript's own priorities are
  // "10"–"18" with `"z"`-prefixed deprecated variants, so "z18" is the greatest
  // key it produces. A string that strictly extends the greatest key present
  // sorts after it, and therefore after every key at or below it — which is how
  // one derived key lands the contributed entries last however the base list is
  // keyed, including keys no host of ours chose. The "zz" seed is the floor for
  // an empty base, where there is no maximum to extend: above everything
  // TypeScript emits, rather than below it the way a bare "z" would be. One
  // shared key for every entry, so their alphabetical order survives a tie
  // broken on the label.
  const sortText = `${baseEntries.reduce(
    (greatest, base) => (base.sortText > greatest ? base.sortText : greatest),
    "zz",
  )}0`;

  return [...ids]
    .sort()
    .filter((id) => !offered.has(`${prefix}${id}`))
    .map((id) => ({
      name: id,
      kind: STRING_KIND,
      kindModifiers: "",
      sortText,
      replacementSpan,
    }));
}
