import {
  INDEX_BASE_MARKERS,
  INDEX_SLOT_CLASSIFICATIONS,
  type IndexSlotClassification,
} from "./index-slot-classifications";

type NativeBase = "native-1" | "native-0";

export interface EngineIndexBaseRow {
  readonly base: NativeBase;
  readonly elements: readonly string[];
  // The slot, or the field path inside it, in plain words.
  readonly position: string;
  // The classification keys the row covers.
  readonly keys: readonly string[];
}

interface Slot {
  readonly key: string;
  readonly element: string;
  readonly kind: "param" | "return";
  readonly path: readonly string[];
  readonly base: NativeBase;
  readonly fromEnd: boolean;
}

const KEY = /^(.+?):(param|return):(.+)$/;
const BASE_LABELS: Readonly<Record<NativeBase, string>> = {
  "native-1": "**1-based**",
  "native-0": "**0-based**",
};

function nativeSlot(key: string, classification: IndexSlotClassification): Slot | undefined {
  if (classification.class === "not-a-position") return undefined;
  const match = KEY.exec(key);
  if (match?.[1] === undefined || match[3] === undefined) return undefined;
  return {
    key,
    element: match[1],
    kind: match[2] === "return" ? "return" : "param",
    path: match[3].split(":"),
    base: classification.class,
    fromEnd: classification.fromEnd === true,
  };
}

// `b2d.fixture.get_density` -> `b2d.fixture`, `client:send` -> `client`.
function namespaceOf(element: string): string {
  const end = Math.max(element.lastIndexOf("."), element.lastIndexOf(":"));
  return end < 0 ? element : element.slice(0, end);
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): [T, ...T[]][] {
  const groups = new Map<string, [T, ...T[]]>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }
  return [...groups.values()];
}

function codeList(names: readonly string[]): string {
  const code = names.map((name) => `\`${name}\``);
  if (code.length < 2) return code.join("");
  return `${code.slice(0, -1).join(", ")} and ${code[code.length - 1]}`;
}

function describePosition(
  kind: "param" | "return",
  parent: readonly string[],
  leaves: readonly string[],
  fromEnd: boolean,
): string {
  const names = codeList(leaves);
  const holder = parent.length === 0 ? "" : `\`${parent.join(".")}\``;
  let position: string;
  if (parent.length === 0) position = kind === "return" ? `returned ${names}` : names;
  else {
    const fields = leaves.length === 1 ? "field" : "fields";
    position = `${names} ${fields} of ${kind === "return" ? "the returned " : ""}${holder}`;
  }
  return fromEnd ? `${position}; counts from the end when negative` : position;
}

/**
 * Every engine position the classification table records, one row per slot of
 * one base in one namespace. Slots that differ only in their last name and are
 * taken by the same functions share a row (`x` and `y`), so each row states
 * one fact about one set of calls. Rows come 1-based first, then 0-based, each
 * in table order.
 */
export function engineIndexBaseRows(
  classifications: ReadonlyMap<string, IndexSlotClassification> = INDEX_SLOT_CLASSIFICATIONS,
): EngineIndexBaseRow[] {
  const slots = [...classifications].flatMap(([key, classification]) => {
    const slot = nativeSlot(key, classification);
    return slot === undefined ? [] : [slot];
  });
  const bySlot = groupBy(slots, (slot) =>
    [slot.base, namespaceOf(slot.element), slot.kind, slot.path.join(":")].join("|"),
  );
  const merged = groupBy(bySlot, (group) =>
    [
      group[0].base,
      group[0].kind,
      group[0].path.slice(0, -1).join(":"),
      group[0].fromEnd,
      group.map((slot) => slot.element).join(","),
    ].join("|"),
  );
  const rows = merged.map((groups): EngineIndexBaseRow => {
    const [first] = groups[0];
    return {
      base: first.base,
      elements: groups[0].map((slot) => slot.element),
      position: describePosition(
        first.kind,
        first.path.slice(0, -1),
        groups.map(([slot]) => slot.path.at(-1) ?? ""),
        first.fromEnd,
      ),
      keys: groups.flatMap((group) => group.map((slot) => slot.key)),
    };
  });
  return [
    ...rows.filter((row) => row.base === "native-1"),
    ...rows.filter((row) => row.base === "native-0"),
  ];
}

// The guide's table of engine positions by base, so the guide lists exactly
// the positions the hovers annotate.
export function engineIndexBaseTable(
  classifications: ReadonlyMap<string, IndexSlotClassification> = INDEX_SLOT_CLASSIFICATIONS,
): string {
  const lines = ["| Base | API | Position |", "| --- | --- | --- |"];
  for (const row of engineIndexBaseRows(classifications)) {
    const base = `${INDEX_BASE_MARKERS[row.base]} ${BASE_LABELS[row.base]}`;
    const api = row.elements.map((element) => `\`${element}\``).join(", ");
    lines.push(`| ${base} | ${api} | ${row.position} |`);
  }
  return lines.join("\n");
}
