import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as apiDoc from "../src/api-doc";
import * as docCorrections from "../src/doc-corrections";
import * as emitDts from "../src/emit-dts";
import {
  CALLBACK_SIGNATURE_CURATIONS,
  ENGINE_SLOT_RULES,
  LIST_FIELD_CORRECTIONS,
  NESTED_FIELD_CURATIONS,
  PARAM_TYPE_CORRECTIONS,
  PROPERTY_KEY_RANGES,
  PROPERTY_TYPE_CORRECTIONS,
  pinEvidenceKey,
  RETURN_TYPE_CORRECTIONS,
  RETURN_TYPE_OVERRIDES,
  type RefDocPin,
  STRUCT_MEMBER_ADDITIONS,
  TABLE_FIELD_TYPE_OVERRIDES,
  TABLE_SLOT_CURATIONS,
  TABLE_SLOT_FIELD_ADDITIONS,
  TYPEDEF_ALIAS_CORRECTIONS,
  VARIABLE_TYPE_OVERRIDES,
} from "../src/emit-dts";
import * as emitMessages from "../src/emit-messages";
import {
  MESSAGE_ENGINE_CORRECTIONS,
  MESSAGE_FIELD_CONSTANT_GROUPS,
  MESSAGE_FIELD_CORRECTIONS,
} from "../src/emit-messages";

export const REPLACEMENT_PIN_BASELINE_FILE = join(
  import.meta.dirname,
  "replacement-pin-baseline.json",
);

export type PinKind = "binding" | "engine" | "refDoc";

// A table whose entries put a type in place of, or beside, what upstream
// declares. `pinsOf` names the pins an entry carries, of which it may carry one.
// A `binding` or `engine` pin holds where the entry's ledger line is in
// `bindingEvidenceFor` on some vendored target; a `refDoc` pin, read through
// `refDocOf`, holds where it is in `refDocEvidenceFor` over the retained
// ref-docs, which look for it in the element `elementOf` names.
export interface ReplacementTable<Entry = unknown> {
  readonly name: string;
  readonly entries: Iterable<readonly [string, Entry]>;
  pinsOf(entry: Entry): readonly PinKind[];
  refDocOf(entry: Entry): RefDocPin | undefined;
  elementOf(key: string): string;
  readonly accepts: readonly PinKind[];
}

// Every ledger key opens with its element: `<element>:param:<slot>`,
// `<element>:return:<slot>`, `<struct>:member:<name>`, or the bare element.
function keyElement(key: string): string {
  const colon = key.indexOf(":");
  return colon === -1 ? key : key.slice(0, colon);
}

function unpinned<Entry>(
  name: string,
  entries: Iterable<readonly [string, Entry]>,
): ReplacementTable<Entry> {
  return {
    name,
    entries,
    pinsOf: () => [],
    refDocOf: () => undefined,
    elementOf: keyElement,
    accepts: [],
  };
}

// Each pin kind is read from the entry field of the same name.
type PinFields = { readonly [Kind in PinKind]?: Kind extends "refDoc" ? RefDocPin : unknown };

function pinned<Entry extends PinFields>(
  name: string,
  entries: Iterable<readonly [string, Entry]>,
  accepts: readonly PinKind[],
): ReplacementTable<Entry> {
  return {
    name,
    entries,
    pinsOf: (entry) => accepts.filter((kind) => entry[kind] !== undefined),
    refDocOf: (entry) => (accepts.includes("refDoc") ? entry.refDoc : undefined),
    elementOf: keyElement,
    accepts,
  };
}

export function messageFieldEntries<
  Entry extends { readonly origin: string; readonly name: string; readonly field: string },
>(entries: readonly Entry[]): (readonly [string, Entry])[] {
  return entries.map((entry) => [`${entry.origin}.${entry.name}:${entry.field}`, entry] as const);
}

// `optional` and `required` change a field's optionality, not its type.
const MESSAGE_TYPE_KINDS: ReadonlySet<string> = new Set(["retype", "add-field", "add-message"]);

// A table is registered when one of its entries contradicts a type upstream
// declares, or supplies one upstream omits, from evidence the emitter does not
// read from the reference itself. Every other exported correction table is in
// UNPINNED_TABLES with the reason it is not.
export const REPLACEMENT_TABLES: readonly ReplacementTable[] = [
  pinned("PARAM_TYPE_CORRECTIONS", PARAM_TYPE_CORRECTIONS, ["binding"]),
  pinned("RETURN_TYPE_CORRECTIONS", RETURN_TYPE_CORRECTIONS, ["binding"]),
  pinned("TABLE_FIELD_TYPE_OVERRIDES", TABLE_FIELD_TYPE_OVERRIDES, ["binding"]),
  pinned("STRUCT_MEMBER_ADDITIONS", STRUCT_MEMBER_ADDITIONS, ["binding"]),
  pinned("PROPERTY_KEY_RANGES", PROPERTY_KEY_RANGES, ["engine"]),
  unpinned("PROPERTY_TYPE_CORRECTIONS", PROPERTY_TYPE_CORRECTIONS),
  unpinned("RETURN_TYPE_OVERRIDES", RETURN_TYPE_OVERRIDES),
  unpinned("VARIABLE_TYPE_OVERRIDES", VARIABLE_TYPE_OVERRIDES),
  unpinned("TYPEDEF_ALIAS_CORRECTIONS", TYPEDEF_ALIAS_CORRECTIONS),
  unpinned("ENGINE_SLOT_RULES", ENGINE_SLOT_RULES),
  unpinned("LIST_FIELD_CORRECTIONS", LIST_FIELD_CORRECTIONS),
  pinned("TABLE_SLOT_CURATIONS", TABLE_SLOT_CURATIONS, ["refDoc", "binding", "engine"]),
  unpinned("TABLE_SLOT_FIELD_ADDITIONS", TABLE_SLOT_FIELD_ADDITIONS),
  unpinned("NESTED_FIELD_CURATIONS", NESTED_FIELD_CURATIONS),
  unpinned("CALLBACK_SIGNATURE_CURATIONS", CALLBACK_SIGNATURE_CURATIONS),
  unpinned("MESSAGE_FIELD_CORRECTIONS", messageFieldEntries(MESSAGE_FIELD_CORRECTIONS)),
  unpinned("MESSAGE_FIELD_CONSTANT_GROUPS", messageFieldEntries(MESSAGE_FIELD_CONSTANT_GROUPS)),
  unpinned(
    "MESSAGE_ENGINE_CORRECTIONS",
    MESSAGE_ENGINE_CORRECTIONS.filter((entry) => MESSAGE_TYPE_KINDS.has(entry.kind)).map(
      (entry) => [`${entry.origin}.${entry.name}:${entry.kind}`, entry] as const,
    ),
  ),
];

export const UNPINNED_TABLES: ReadonlyMap<string, string> = new Map([
  ["OPTIONAL_SLOT_CORRECTIONS", "changes a parameter's optionality, not its type"],
  ["REQUIRED_SLOT_CORRECTIONS", "changes a parameter's optionality, not its type"],
  ["HAND_DECLARED_OPTIONAL_SLOTS", "records the optionality an authored overload declares"],
  ["REQUIRED_FIELD_CORRECTIONS", "changes a table field's optionality, not its type"],
  ["OPTIONAL_MEMBER_CORRECTIONS", "changes a struct member's optionality, not its type"],
  ["RETURN_FIELD_OPTIONALITY_CORRECTIONS", "changes a return field's optionality, not its type"],
  ["READ_ONLY_PROPERTY_CORRECTIONS", "changes a property's mutability, not its type"],
  ["FUNCTION_NAME_CORRECTIONS", "corrects a function's name"],
  ["DOC_CORRECTIONS", "replaces doc text"],
  ["ARBITRARY_TABLE_SLOTS", "tells the audit a slot's emitted Record is faithful"],
  ["ARBITRARY_TABLE_SLOT_KEYS", "tells the audit a slot's emitted Record is faithful"],
  ["MAPPING_TABLE_SLOTS", "types the key and value the slot's own prose names"],
  ["HOMOGENEOUS_ARRAY_SLOTS", "types the element the slot's own prose or example names"],
  ["FIRST_SLOT_ALTERNATIVES", "adds the overload the slot's own doc names, checked at emit time"],
  [
    "CONSTANT_SLOT_RESOLUTIONS",
    "brands a constant slot with constants the reference names, read at emit time",
  ],
  ["CONSTANT_UNION_ALIASES", "names a constant union the reference declares"],
  ["OVERLOAD_SLOT_ALIASES", "names the type each target's own reference gives the slot"],
]);

export const CORRECTION_TABLE_NAME =
  /_(CORRECTIONS|OVERRIDES|ADDITIONS|RANGES|CURATIONS|SLOTS|SLOT_KEYS|RESOLUTIONS|RULES|ALTERNATIVES|ALIASES|CLASSIFICATIONS|GROUPS)$/;

export const CORRECTION_TABLE_MODULES: readonly Record<string, unknown>[] = [
  emitDts,
  emitMessages,
  apiDoc,
  docCorrections,
];

// One finding per exported correction table that is registered and excluded
// other than exactly once, and per classification naming no exported table.
export function tableClassificationFindings(
  tables: readonly ReplacementTable[] = REPLACEMENT_TABLES,
  unpinned: ReadonlyMap<string, string> = UNPINNED_TABLES,
  modules: readonly Record<string, unknown>[] = CORRECTION_TABLE_MODULES,
): string[] {
  const exported = new Set(
    modules.flatMap((exports) =>
      Object.entries(exports)
        .filter(
          ([name, value]) =>
            CORRECTION_TABLE_NAME.test(name) &&
            (value instanceof Map || value instanceof Set || Array.isArray(value)),
        )
        .map(([name]) => name),
    ),
  );
  const named = [...tables.map((table) => table.name), ...unpinned.keys()];
  const findings: string[] = [];
  for (const name of exported) {
    const count = named.filter((candidate) => candidate === name).length;
    if (count === 0) findings.push(`${name}: neither registered nor excluded`);
    if (count > 1) findings.push(`${name}: classified ${count} times`);
  }
  for (const name of new Set(named)) {
    if (!exported.has(name)) findings.push(`${name}: not an exported table`);
  }
  return findings;
}

const PIN_NAMES: Readonly<Record<PinKind, string>> = {
  binding: "a binding pin",
  engine: "an engine pin",
  refDoc: "a refDoc pin",
};

function acceptedPins(accepts: readonly PinKind[]): string {
  if (accepts.length === 0) return "the table has no pin field yet";
  return `the table accepts ${accepts.map((kind) => PIN_NAMES[kind]).join(" or ")}`;
}

// One finding per entry that is neither pinned with a holding pin nor
// baselined, and per baseline line left after its entry was pinned or removed.
export function replacementPinFindings(
  tables: readonly ReplacementTable[],
  baseline: readonly string[],
  evidenceKeys: ReadonlySet<string>,
): string[] {
  const findings: string[] = [];
  const baselined = new Set(baseline);
  const lines = new Set<string>();
  const pinned = new Set<string>();
  for (const table of tables) {
    for (const [key, entry] of table.entries) {
      const line = pinEvidenceKey(table.name, key);
      if (lines.has(line)) throw new Error(`${line}: two entries share this ledger key`);
      lines.add(line);
      const kinds = table.pinsOf(entry);
      if (kinds.length > 0) pinned.add(line);
      if (kinds.length > 1) {
        findings.push(`${line}: carries more than one pin`);
      } else if (kinds.length === 1) {
        if (!evidenceKeys.has(line)) {
          const where = kinds[0] === "refDoc" ? "retained ref-doc" : "vendored target";
          findings.push(`${line}: its pin holds on no ${where}`);
        }
      } else if (!baselined.has(line)) {
        findings.push(`${line}: no pin (${acceptedPins(table.accepts)})`);
      }
    }
  }
  for (const line of baseline) {
    if (pinned.has(line)) findings.push(`${line}: stale, the entry is pinned`);
    else if (!lines.has(line)) findings.push(`${line}: stale, no such entry`);
  }
  return findings;
}

export function parseReplacementPinBaseline(raw: unknown, source: string): string[] {
  if (!Array.isArray(raw)) throw new Error(`${source}: expected an array of ledger lines`);
  const lines: string[] = [];
  for (const line of raw) {
    if (typeof line !== "string") {
      throw new Error(`${source}: ${JSON.stringify(line)} is not a string`);
    }
    const previous = lines.at(-1);
    if (previous === line) throw new Error(`${source}: ${line} is listed twice`);
    if (previous !== undefined && line < previous) {
      throw new Error(`${source}: ${line} sorts before ${previous}`);
    }
    lines.push(line);
  }
  return lines;
}

export function readReplacementPinBaseline(path: string = REPLACEMENT_PIN_BASELINE_FILE): string[] {
  return parseReplacementPinBaseline(JSON.parse(readFileSync(path, "utf8")), path);
}
