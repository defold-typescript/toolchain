import type { ClassifiedSlot } from "@defold-typescript/transpiler";
import type ts from "typescript";

// The editor's own `ts` is not in scope here and is not needed: this is a
// string-enum member whose value is its name, and the plugin builds plain data.
// Exported because the details panel restates the kind of the entry it answers
// for, and a second literal there could drift from what was offered.
export const CONTRIBUTED_ENTRY_KIND = "string" as ts.ScriptElementKind;

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
function keyAboveAll(baseEntries: readonly ts.CompletionEntry[]): string {
  return `${baseEntries.reduce(
    (greatest, base) => (base.sortText > greatest ? base.sortText : greatest),
    "zz",
  )}0`;
}

// The one `ts.CompletionEntry` field the host round-trips verbatim as the
// details request's `source` argument, which is what lets a later request
// recognize an entry as ours rather than guess from its name. Namespaced rather
// than a bare word because a host is free to surface it beside the label.
export const DEFOLD_COMPLETION_SOURCE = "defold-typescript/scene";

function entriesFor(
  ids: ReadonlySet<string>,
  offeredName: (id: string) => string,
  baseEntries: readonly ts.CompletionEntry[],
  replacementSpan: { start: number; length: number },
): ts.CompletionEntry[] {
  // Where a project has generated the scene-derived union, the base service
  // already offers the whole literal. Drop our duplicate rather than the base's:
  // the plugin only ever adds.
  const offered = new Set(baseEntries.map((base) => base.name));
  const sortText = keyAboveAll(baseEntries);
  return [...ids]
    .sort()
    .filter((id) => !offered.has(offeredName(id)))
    .map((id) => ({
      name: id,
      kind: CONTRIBUTED_ENTRY_KIND,
      kindModifiers: "",
      sortText,
      replacementSpan,
      source: DEFOLD_COMPLETION_SOURCE,
    }));
}

// One entry per component id, each replacing only the `#fragment` span inside
// the quotes. Nothing here touches the filesystem or the host, so the whole
// judgment is a function of the slot, the id universe, and what the base
// service already offers.
export function buildSceneCompletionEntries(input: {
  slot: ClassifiedSlot;
  ids: ReadonlySet<string>;
  baseEntries: readonly ts.CompletionEntry[];
}): ts.CompletionEntry[] {
  const { slot, ids, baseEntries } = input;
  if (slot.fragmentStart === -1) return [];

  const fragmentOffset = slot.fragmentStart - slot.textStart;
  const prefix = slot.text.slice(0, fragmentOffset);
  return entriesFor(ids, (id) => `${prefix}${id}`, baseEntries, {
    start: slot.fragmentStart,
    length: slot.text.length - fragmentOffset,
  });
}

// One entry per game-object path, each replacing only the path half inside the
// quotes — the mirror image of `buildSceneCompletionEntries`, which keeps the
// path and edits the fragment. A literal carrying no `#` is all path, so its
// span is the whole text; `offeredName` re-attaches the surviving fragment so
// the dedup compares the literal an accepted entry would produce, not a bare id.
export function buildAddressPathCompletionEntries(input: {
  slot: ClassifiedSlot;
  paths: ReadonlySet<string>;
  baseEntries: readonly ts.CompletionEntry[];
}): ts.CompletionEntry[] {
  const { slot, paths, baseEntries } = input;
  // `fragmentStart` is the first character *after* the `#`, so the separator
  // itself belongs to the surviving suffix rather than to the replaced span.
  const length =
    slot.fragmentStart === -1 ? slot.text.length : slot.fragmentStart - slot.textStart - 1;
  const suffix = slot.text.slice(length);
  return entriesFor(paths, (path) => `${path}${suffix}`, baseEntries, {
    start: slot.textStart,
    length,
  });
}

// One entry per id, for the kinds whose literal is the name outright — a `.gui`
// node id and an atlas animation id. Unlike an address, neither has a path half
// to keep: the whole inside-quotes text is the name, so accepting an entry
// replaces all of it and no caret guard is needed. One builder rather than two,
// because a second copy would be free to drift on span or dedup.
export function buildWholeLiteralCompletionEntries(input: {
  slot: ClassifiedSlot;
  ids: ReadonlySet<string>;
  baseEntries: readonly ts.CompletionEntry[];
}): ts.CompletionEntry[] {
  const { slot, ids, baseEntries } = input;
  return entriesFor(ids, (id) => id, baseEntries, {
    start: slot.textStart,
    length: slot.text.length,
  });
}
