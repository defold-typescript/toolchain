import type { ApiFunction, ApiModule, ApiParameter } from "./api-doc";
import { DEFOLD_TYPE_MAP } from "./core-types";
import { pinMatches } from "./correction-pins";
import { splitTopLevel } from "./luals-type-expr";

/**
 * A type correction as identity applies it: where the slot still declares one of
 * `pins`, its values are the declared ones less `removes` plus `adds`, or
 * `replaces` outright. Every list is written in ref-doc or TypeScript spelling;
 * both canonicalize to the same values.
 */
export interface IdentityCorrection {
  readonly pins: readonly (readonly string[])[];
  readonly adds?: readonly string[];
  readonly removes?: readonly string[];
  readonly replaces?: readonly string[];
  /** A return correction's slot name, when it rewrites one of several returns. */
  readonly slot?: string;
}

/**
 * The corrections this repo records from verified engine behavior. Identity
 * follows them rather than each release's markup, so a release whose ref-doc
 * starts stating what a correction already did is not a change.
 */
export interface IdentityCorrections {
  /** `<element>:param:<slot>` keys a correction makes optional. */
  readonly optionalSlots: readonly string[];
  /** `<element>:param:<slot>` keys a correction keeps required. */
  readonly requiredSlots: readonly string[];
  /** Keyed `<element>:param:<slot>`. */
  readonly parameterCorrections: Readonly<Record<string, IdentityCorrection>>;
  /** Keyed by element. */
  readonly returnCorrections: Readonly<Record<string, IdentityCorrection>>;
  /** Constant-family aliases a correction may name (`window.DimModeStateSettable`), with members. */
  readonly constantFamilies: Readonly<Record<string, readonly string[]>>;
}

/**
 * The names a ref-doc type token may refer to, gathered across every committed
 * target so each release's spelling resolves the same way, plus the corrections.
 * A name keeps its kind across releases: a 1.13.2 `STRUCT` is a table wherever
 * it appears.
 */
export interface IdentityVocabulary extends Omit<IdentityCorrections, "constantFamilies"> {
  /** `STRUCT` names: a table at runtime. */
  readonly tables: readonly string[];
  /** `ENUM` names and constant families, with the runtime type of their members. */
  readonly enums: Readonly<Record<string, "number" | "string">>;
  /** Constants whose value is a string; every other constant is a number. */
  readonly stringConstants: readonly string[];
  /** Non-handle `TYPEDEF` names and the tokens they alias. */
  readonly aliases: Readonly<Record<string, readonly string[]>>;
}

export const NO_IDENTITY_CORRECTIONS: IdentityCorrections = {
  optionalSlots: [],
  requiredSlots: [],
  parameterCorrections: {},
  returnCorrections: {},
  constantFamilies: {},
};

const sortedRecord = <T>(entries: Iterable<[string, T]>): Record<string, T> =>
  Object.fromEntries([...entries].sort(([a], [b]) => a.localeCompare(b)));

export function buildIdentityVocabulary(
  modules: readonly ApiModule[],
  corrections: IdentityCorrections = NO_IDENTITY_CORRECTIONS,
): IdentityVocabulary {
  const tables = new Set<string>();
  const stringConstants = new Set<string>();
  const aliases = new Map<string, readonly string[]>();
  const enumMembers = new Map<string, readonly string[]>(
    Object.entries(corrections.constantFamilies),
  );
  for (const module of modules) {
    for (const struct of module.structs ?? []) tables.add(struct.name);
    for (const constant of module.constants) {
      if (constant.valueType === "string") stringConstants.add(constant.name);
    }
    for (const enumeration of module.enums ?? []) {
      enumMembers.set(enumeration.name, enumeration.members);
    }
    for (const typedef of module.typedefs) {
      const aliasOf = typedef.aliasOf;
      if (aliasOf === undefined || (aliasOf.length === 1 && aliasOf[0] === "userdata")) continue;
      aliases.set(typedef.name, aliasOf);
    }
  }
  const enums = [...enumMembers].map(([name, members]): [string, "number" | "string"] => [
    name,
    members.length > 0 && members.every((member) => stringConstants.has(member))
      ? "string"
      : "number",
  ]);
  return {
    tables: [...tables].sort(),
    enums: sortedRecord(enums),
    stringConstants: [...stringConstants].sort(),
    aliases: sortedRecord(aliases),
    optionalSlots: [...corrections.optionalSlots].sort(),
    requiredSlots: [...corrections.requiredSlots].sort(),
    parameterCorrections: sortedRecord(Object.entries(corrections.parameterCorrections)),
    returnCorrections: sortedRecord(Object.entries(corrections.returnCorrections)),
  };
}

// Tokens a later release renamed without changing what they denote.
const RENAMED_TOKENS: Readonly<Record<string, string>> = {
  // 1.13.2 names the lifecycle callbacks' `self` after what it is.
  script_instance: "userdata",
};

const CONSTANT_FQN = /^[a-z_][\w.]*\.[A-Z][A-Z0-9_]*$/;
const NUMERIC_LITERAL = /^-?\d+(\.\d+)?$/;
const STRING_LITERAL = /^(".*"|'.*')$/;
// The TypeScript table types a correction writes.
const TS_TABLE = /^(Record|LuaMap|ReadonlyLuaMap|LuaTable)\b/;

function canonicalLeaves(
  token: string,
  vocabulary: IdentityVocabulary,
  expanding: ReadonlySet<string>,
): string[] {
  const trimmed = token.trim();
  const arms = splitTopLevel(trimmed, "|");
  if (arms.length > 1) return arms.flatMap((arm) => canonicalLeaves(arm, vocabulary, expanding));
  if (trimmed.endsWith("?")) {
    return [...canonicalLeaves(trimmed.slice(0, -1), vocabulary, expanding), "nil"];
  }
  if (/^(fun|function)\b/.test(trimmed) || trimmed.includes("=>")) return ["function"];
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) {
    return canonicalLeaves(trimmed.slice(1, -1), vocabulary, expanding);
  }
  if (trimmed.startsWith("typeof ")) {
    return canonicalLeaves(trimmed.slice("typeof ".length), vocabulary, expanding);
  }
  if (trimmed === "nil" || trimmed === "undefined") return ["nil"];
  // Every table shape — a bare or typed `table`, a list, an inline record, a
  // struct, a built-in message payload — is one Lua table at runtime; its
  // documented fields are not part of what identifies the call.
  if (
    trimmed === "table" ||
    trimmed.startsWith("table<") ||
    trimmed.startsWith("{") ||
    trimmed.endsWith("[]") ||
    trimmed.startsWith("message.") ||
    TS_TABLE.test(trimmed) ||
    vocabulary.tables.includes(trimmed)
  ) {
    return ["table"];
  }
  if (STRING_LITERAL.test(trimmed)) return ["string"];
  if (NUMERIC_LITERAL.test(trimmed)) return ["number"];
  if (trimmed === "true" || trimmed === "false") return ["boolean"];
  // An enum, one of its constants, or the untyped `constant` older releases
  // wrote are all the value the engine registered: a number unless declared a
  // string.
  const enumType = vocabulary.enums[trimmed];
  if (enumType !== undefined) return [enumType];
  if (vocabulary.stringConstants.includes(trimmed)) return ["string"];
  if (trimmed === "constant" || CONSTANT_FQN.test(trimmed)) return ["number"];
  const aliasOf = vocabulary.aliases[trimmed];
  if (aliasOf !== undefined && !expanding.has(trimmed)) {
    const next = new Set(expanding).add(trimmed);
    return aliasOf.flatMap((aliased) => canonicalLeaves(aliased, vocabulary, next));
  }
  const renamed = RENAMED_TOKENS[trimmed] ?? trimmed;
  // Primitive synonyms (`integer` and `number`, `buffer_data` and `buffer`) are
  // the tokens the engine vocabulary maps to one TypeScript type.
  return [
    Object.hasOwn(DEFOLD_TYPE_MAP, renamed)
      ? ((DEFOLD_TYPE_MAP as Readonly<Record<string, string>>)[renamed] as string)
      : renamed,
  ];
}

/**
 * A slot's ref-doc tokens in a vocabulary-neutral form: the runtime values the
 * slot takes, sorted and without duplicates, so a release that only respells a
 * slot keeps its identity while one that changes what it takes does not.
 */
export function canonicalIdentityTypes(
  types: readonly string[],
  vocabulary: IdentityVocabulary,
): string[] {
  return [
    ...new Set(types.flatMap((token) => canonicalLeaves(token, vocabulary, new Set()))),
  ].sort();
}

function correctedTypes(
  types: readonly string[],
  correction: IdentityCorrection | undefined,
  vocabulary: IdentityVocabulary,
): string[] {
  if (correction === undefined || !pinMatches(types, correction.pins)) {
    return canonicalIdentityTypes(types, vocabulary);
  }
  if (correction.replaces !== undefined) {
    return canonicalIdentityTypes(correction.replaces, vocabulary);
  }
  const removed = new Set(canonicalIdentityTypes(correction.removes ?? [], vocabulary));
  return [
    ...new Set([
      ...canonicalIdentityTypes(types, vocabulary).filter((value) => !removed.has(value)),
      ...canonicalIdentityTypes(correction.adds ?? [], vocabulary),
    ]),
  ].sort();
}

export interface IdentitySlot {
  readonly types: readonly string[];
  readonly isOptional: boolean;
}

/** A parameter as identity reads it: its corrected values and effective optionality. */
export function identityParameter(
  fn: ApiFunction,
  parameter: ApiParameter,
  vocabulary: IdentityVocabulary,
): IdentitySlot {
  const key = `${fn.name}:param:${parameter.name}`;
  const types = correctedTypes(parameter.types, vocabulary.parameterCorrections[key], vocabulary);
  // A slot a correction keeps required may still take an explicit nil, which
  // stays part of what it takes; anywhere else, taking nil is being omissible.
  if (vocabulary.requiredSlots.includes(key)) return { types, isOptional: false };
  return {
    types: types.filter((value) => value !== "nil"),
    isOptional:
      parameter.isOptional || types.includes("nil") || vocabulary.optionalSlots.includes(key),
  };
}

/** A return value as identity reads it, with a return correction applied where it holds. */
export function identityReturn(
  fn: ApiFunction,
  returned: ApiParameter,
  vocabulary: IdentityVocabulary,
): IdentitySlot {
  const correction = vocabulary.returnCorrections[fn.name];
  const applies =
    correction !== undefined &&
    (correction.slot === undefined
      ? fn.returnValues.length === 1
      : correction.slot === returned.name);
  return {
    types: correctedTypes(returned.types, applies ? correction : undefined, vocabulary),
    isOptional: returned.isOptional,
  };
}
