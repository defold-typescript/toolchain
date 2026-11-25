import {
  CALLBACK_SIGNATURE_CURATIONS,
  ENGINE_SLOT_RULES,
  LIST_FIELD_CORRECTIONS,
  NESTED_FIELD_CURATIONS,
  PARAM_TYPE_CORRECTIONS,
  PROPERTY_TYPE_CORRECTIONS,
  RETURN_TYPE_CORRECTIONS,
  RETURN_TYPE_OVERRIDES,
  TABLE_FIELD_TYPE_OVERRIDES,
  TABLE_SLOT_CURATIONS,
  TABLE_SLOT_FIELD_ADDITIONS,
  TYPEDEF_ALIAS_CORRECTIONS,
  VARIABLE_TYPE_OVERRIDES,
} from "../src/emit-dts";
import {
  MESSAGE_ENGINE_CORRECTIONS,
  MESSAGE_FIELD_CONSTANT_GROUPS,
  MESSAGE_FIELD_CORRECTIONS,
  type MessageEngineCorrection,
  messageEngineCorrectionKey,
  messageFieldKey,
} from "../src/emit-messages";
import type { CorrectionPins } from "../src/engine-pin";

// A correction table whose entries may rest on the engine source, each under the
// ledger key its emit site gates it by.
export interface EnginePinnedTable<Entry extends CorrectionPins = CorrectionPins> {
  readonly name: string;
  readonly entries: Iterable<readonly [string, Entry]>;
}

export function messageFieldEntries<
  Entry extends { readonly origin: string; readonly name: string; readonly field: string },
>(entries: readonly Entry[]): (readonly [string, Entry])[] {
  return entries.map((entry) => [messageFieldKey(entry), entry] as const);
}

// `optional` and `required` change a field's optionality, not its type, and
// carry no pin.
const MESSAGE_TYPE_KINDS: ReadonlySet<string> = new Set(["retype", "add-field", "add-message"]);

export function messageEngineCorrectionEntries(
  entries: readonly MessageEngineCorrection[],
): (readonly [string, MessageEngineCorrection])[] {
  return entries
    .filter((entry) => MESSAGE_TYPE_KINDS.has(entry.kind))
    .map((entry) => [messageEngineCorrectionKey(entry), entry] as const);
}

export const ENGINE_PINNED_TABLES: readonly EnginePinnedTable[] = [
  { name: "RETURN_TYPE_CORRECTIONS", entries: RETURN_TYPE_CORRECTIONS },
  { name: "PARAM_TYPE_CORRECTIONS", entries: PARAM_TYPE_CORRECTIONS },
  { name: "TABLE_FIELD_TYPE_OVERRIDES", entries: TABLE_FIELD_TYPE_OVERRIDES },
  { name: "TABLE_SLOT_CURATIONS", entries: TABLE_SLOT_CURATIONS },
  { name: "PROPERTY_TYPE_CORRECTIONS", entries: PROPERTY_TYPE_CORRECTIONS },
  { name: "ENGINE_SLOT_RULES", entries: ENGINE_SLOT_RULES },
  { name: "LIST_FIELD_CORRECTIONS", entries: LIST_FIELD_CORRECTIONS },
  { name: "CALLBACK_SIGNATURE_CURATIONS", entries: CALLBACK_SIGNATURE_CURATIONS },
  { name: "TABLE_SLOT_FIELD_ADDITIONS", entries: TABLE_SLOT_FIELD_ADDITIONS },
  { name: "TYPEDEF_ALIAS_CORRECTIONS", entries: TYPEDEF_ALIAS_CORRECTIONS },
  { name: "RETURN_TYPE_OVERRIDES", entries: RETURN_TYPE_OVERRIDES },
  { name: "VARIABLE_TYPE_OVERRIDES", entries: VARIABLE_TYPE_OVERRIDES },
  { name: "NESTED_FIELD_CURATIONS", entries: NESTED_FIELD_CURATIONS },
  {
    name: "MESSAGE_FIELD_CORRECTIONS",
    entries: messageFieldEntries(MESSAGE_FIELD_CORRECTIONS),
  },
  {
    name: "MESSAGE_FIELD_CONSTANT_GROUPS",
    entries: messageFieldEntries(MESSAGE_FIELD_CONSTANT_GROUPS),
  },
  {
    name: "MESSAGE_ENGINE_CORRECTIONS",
    entries: messageEngineCorrectionEntries(MESSAGE_ENGINE_CORRECTIONS),
  },
];
