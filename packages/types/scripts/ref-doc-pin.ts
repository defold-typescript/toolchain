import { pinEvidenceKey } from "../src/engine-pin";
import type { ProvenanceSurface } from "../src/optional-correction-provenance";
import type { ReplacementTable } from "./replacement-pins";

const ENTITIES: Readonly<Record<string, string>> = {
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
  "&amp;": "&",
};

// Ref-doc HTML as its reader sees it: tags dropped, entities decoded, whitespace
// collapsed, and no space beside punctuation, so a reflow, a `<code>` span or a
// highlighter's token spacing never decides a match. A pin's snippet goes
// through the same normalization.
export function refDocText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:quot|#39|apos|lt|gt|nbsp|amp);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/\s+/g, " ")
    .replace(/ ?([^\w\s]) ?/g, "$1")
    .trim();
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function slotDocs(slots: unknown): string[] {
  return Array.isArray(slots)
    ? slots.map((slot) => text((slot as { doc?: unknown } | null)?.doc))
    : [];
}

// Each text field of every element named `name` in the raw doc: its brief,
// description, parameter and return docs, and examples. A namespace may declare
// one name twice (the Box2D v2 and v3 bindings), and either declaration counts.
function elementTexts(doc: unknown, name: string): string[] {
  const elements = (doc as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) return [];
  return elements
    .filter((element) => (element as { name?: unknown } | null)?.name === name)
    .flatMap((element) => {
      const raw = element as Record<string, unknown>;
      return [
        text(raw.brief),
        text(raw.description),
        ...slotDocs(raw.parameters),
        ...slotDocs(raw.returnvalues),
        text(raw.examples),
      ].map(refDocText);
    });
}

// Whether `surface` documents `namespace`: its own namespace, or one it nests
// (`editor` documents `editor.tx.add`).
function documents(surface: ProvenanceSurface, namespace: string): boolean {
  return surface.namespace === namespace || namespace.startsWith(`${surface.namespace}.`);
}

// The ledger lines of the `refDoc`-pinned entries whose snippet one text field
// of their own element states on some surface of the element's namespace. A
// sibling element's text is no evidence: the pin vouches for what this
// element's ref-doc says, not what the namespace says somewhere.
export function refDocEvidenceFor(
  tables: readonly ReplacementTable[],
  surfaces: readonly ProvenanceSurface[],
): ReadonlySet<string> {
  const evidence = new Set<string>();
  for (const table of tables) {
    for (const [key, entry] of table.entries) {
      const pin = table.refDocOf(entry);
      if (pin === undefined) continue;
      const wanted = refDocText(pin.contains);
      if (wanted === "") throw new Error(`${table.name}:${key}: refDoc pin states no text`);
      const { namespace, name } = table.elementOf(key);
      const holds = surfaces.some(
        (surface) =>
          documents(surface, namespace) &&
          elementTexts(surface.doc, name).some((field) => field.includes(wanted)),
      );
      if (holds) evidence.add(pinEvidenceKey(table.name, key));
    }
  }
  return evidence;
}
