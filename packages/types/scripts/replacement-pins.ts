import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CALLBACK_SIGNATURE_CURATIONS,
  ENGINE_SLOT_RULES,
  LIST_FIELD_CORRECTIONS,
  NESTED_FIELD_CURATIONS,
  PARAM_TYPE_CORRECTIONS,
  PROPERTY_KEY_RANGES,
  PROPERTY_TYPE_CORRECTIONS,
  RETURN_TYPE_CORRECTIONS,
  RETURN_TYPE_OVERRIDES,
  STRUCT_MEMBER_ADDITIONS,
  TABLE_FIELD_TYPE_OVERRIDES,
  TABLE_SLOT_CURATIONS,
  TABLE_SLOT_FIELD_ADDITIONS,
  TYPEDEF_ALIAS_CORRECTIONS,
  VARIABLE_TYPE_OVERRIDES,
} from "../src/emit-dts";
import { MESSAGE_ENGINE_CORRECTIONS, MESSAGE_FIELD_CORRECTIONS } from "../src/emit-messages";

export const REPLACEMENT_PIN_BASELINE_FILE = join(
  import.meta.dirname,
  "replacement-pin-baseline.json",
);

export type PinKind = "binding" | "engine";

// A table whose entries put a type in place of, or beside, what upstream
// declares. `pinOf` names the engine-source pin an entry carries; a pinned
// entry holds where its key is in `bindingEvidenceFor` on some vendored target.
export interface ReplacementTable<Entry = unknown> {
  readonly name: string;
  readonly entries: Iterable<readonly [string, Entry]>;
  pinOf(entry: Entry): PinKind | undefined;
  readonly accepts: readonly PinKind[];
}

function unpinned<Entry>(
  name: string,
  entries: Iterable<readonly [string, Entry]>,
): ReplacementTable<Entry> {
  return { name, entries, pinOf: () => undefined, accepts: [] };
}

function bindingPinned<Entry extends { readonly binding?: unknown }>(
  name: string,
  entries: Iterable<readonly [string, Entry]>,
): ReplacementTable<Entry> {
  return {
    name,
    entries,
    pinOf: (entry) => (entry.binding === undefined ? undefined : "binding"),
    accepts: ["binding"],
  };
}

function enginePinned<Entry extends { readonly engine?: unknown }>(
  name: string,
  entries: Iterable<readonly [string, Entry]>,
): ReplacementTable<Entry> {
  return {
    name,
    entries,
    pinOf: (entry) => (entry.engine === undefined ? undefined : "engine"),
    accepts: ["engine"],
  };
}

// `optional` and `required` change a field's optionality, not its type.
const MESSAGE_TYPE_KINDS: ReadonlySet<string> = new Set(["retype", "add-field", "add-message"]);

// A table is registered when one of its entries contradicts a type upstream
// declares, or supplies one upstream omits, from evidence the emitter does not
// read from the reference itself. Every other exported correction table is in
// UNPINNED_TABLES with the reason it is not.
export const REPLACEMENT_TABLES: readonly ReplacementTable[] = [
  bindingPinned("PARAM_TYPE_CORRECTIONS", PARAM_TYPE_CORRECTIONS),
  bindingPinned("RETURN_TYPE_CORRECTIONS", RETURN_TYPE_CORRECTIONS),
  bindingPinned("TABLE_FIELD_TYPE_OVERRIDES", TABLE_FIELD_TYPE_OVERRIDES),
  bindingPinned("STRUCT_MEMBER_ADDITIONS", STRUCT_MEMBER_ADDITIONS),
  enginePinned("PROPERTY_KEY_RANGES", PROPERTY_KEY_RANGES),
  unpinned("PROPERTY_TYPE_CORRECTIONS", PROPERTY_TYPE_CORRECTIONS),
  unpinned("RETURN_TYPE_OVERRIDES", RETURN_TYPE_OVERRIDES),
  unpinned("VARIABLE_TYPE_OVERRIDES", VARIABLE_TYPE_OVERRIDES),
  unpinned("TYPEDEF_ALIAS_CORRECTIONS", TYPEDEF_ALIAS_CORRECTIONS),
  unpinned("ENGINE_SLOT_RULES", ENGINE_SLOT_RULES),
  unpinned("LIST_FIELD_CORRECTIONS", LIST_FIELD_CORRECTIONS),
  unpinned("TABLE_SLOT_CURATIONS", TABLE_SLOT_CURATIONS),
  unpinned("TABLE_SLOT_FIELD_ADDITIONS", TABLE_SLOT_FIELD_ADDITIONS),
  unpinned("NESTED_FIELD_CURATIONS", NESTED_FIELD_CURATIONS),
  unpinned("CALLBACK_SIGNATURE_CURATIONS", CALLBACK_SIGNATURE_CURATIONS),
  unpinned(
    "MESSAGE_FIELD_CORRECTIONS",
    MESSAGE_FIELD_CORRECTIONS.map(
      (entry) => [`${entry.origin}.${entry.name}:${entry.field}`, entry] as const,
    ),
  ),
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

function acceptedPins(accepts: readonly PinKind[]): string {
  if (accepts.length === 0) return "the table has no pin field yet";
  const kinds = accepts.map((kind) => (kind === "engine" ? "an engine pin" : "a binding pin"));
  return `the table accepts ${kinds.join(" or ")}`;
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
      const line = `${table.name}:${key}`;
      if (lines.has(line)) throw new Error(`${line}: two entries share this ledger key`);
      lines.add(line);
      if (table.pinOf(entry) !== undefined) {
        pinned.add(line);
        if (!evidenceKeys.has(key)) findings.push(`${line}: its pin holds on no vendored target`);
      } else if (!baselined.has(line)) {
        findings.push(`${line}: no binding or engine pin (${acceptedPins(table.accepts)})`);
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
