import { correctedDoc, docCorrectionKey } from "./doc-corrections";

export interface ApiModule {
  namespace: string;
  brief: string;
  description: string;
  functions: ApiFunction[];
  variables: ApiVariable[];
  constants: ApiConstant[];
  properties: ApiProperty[];
  typedefs: ApiTypedef[];
  /**
   * Each ref-doc `ENUM`, whose members are also lowered into `constants`. Absent
   * on a hand-built module, which reads the same as an empty list.
   */
  enums?: ApiEnum[];
  /** Each ref-doc `STRUCT`. Absent on a hand-built module, read as an empty list. */
  structs?: ApiStruct[];
}

/** A ref-doc `STRUCT`: a named table shape. */
export interface ApiStruct {
  name: string;
  brief: string;
  description: string;
  members: ApiStructMember[];
}

/** One `STRUCT` member; upstream marks an optional one with a `name?` suffix. */
export interface ApiStructMember {
  name: string;
  doc: string;
  /** One LuaLS type expression. */
  type: string;
  isOptional: boolean;
}

/** A ref-doc `ENUM`: a named set of constants, each lowered into `constants`. */
export interface ApiEnum {
  name: string;
  brief: string;
  description: string;
  /** The member FQNs, in documentation order. */
  members: string[];
}

export interface ApiProperty {
  name: string;
  types: string[];
  brief: string;
  description: string;
}

export interface ApiTypedef {
  name: string;
  functions?: ApiFunction[];
  properties?: ApiVariable[];
  /** A union alias's top-level arms; a shape with members carries none. */
  types?: string[];
  /** The type text of each parent an interface-backed typedef extends. */
  extends?: string[];
  /**
   * The type an engine ref-doc `TYPEDEF` aliases (`parameters[0].types`): a
   * handle's `userdata`/`number`, or the arms of a union, literal or record alias.
   */
  aliasOf?: string[];
  /** See {@link ApiFunction.global}. */
  global?: true;
}

export interface ApiConstant {
  name: string;
  brief: string;
  description: string;
  /**
   * Present when the constant is a member of an `ENUM` whose value type is
   * `string` (`parameters[0].types`); absence means a number, as every
   * pre-`ENUM` constant is.
   */
  valueType?: "string";
  /** Present when an `ENUM` member is typed `<ENUM>|nil`: some platforms leave it unset. */
  nilable?: true;
  /** The documented constant a back-filled one shares its value, and so its type, with. */
  aliasOf?: string;
  /** See {@link ApiFunction.global}. */
  global?: true;
}

export interface ApiFunction {
  name: string;
  brief: string;
  description: string;
  parameters: ApiParameter[];
  returnValues: ApiParameter[];
  examples?: string;
  /**
   * A pre-rendered generic-parameter clause (`<T extends druid_widget>`) inserted
   * between the name and the `(` at render time. Present only on LuaLS-lowered
   * library functions; engine ref-docs carry no `generics`, so it stays absent.
   */
  generics?: string;
  /**
   * Present exactly when the source carried a `@deprecated` tag; `""` for a bare
   * tag. Absence is the only encoding of "not deprecated", so a bare tag stays
   * distinguishable from an untagged symbol.
   */
  deprecated?: string;
  /**
   * Present exactly when the source declared the symbol as an ambient global —
   * outside the library's `declare module` block — so it is reachable without
   * the module import. Absence is the only encoding of "module member"; the key
   * is never written as `false`.
   */
  global?: true;
  /**
   * Present exactly when this symbol's prose was imported from the upstream
   * source rather than written in the declaration — the authored/forked library
   * lane lowers upstream's own LuaDoc summary for a member its fork documents
   * nowhere. Absence is the only encoding of first-party prose, so every engine
   * and hand-authored symbol reads as before.
   */
  docSource?: "upstream";
}

export interface ApiParameter {
  name: string;
  doc: string;
  types: string[];
  isOptional: boolean;
  /**
   * True for a `...` variadic parameter. `parseParameterList` always sets it
   * (`false` when the ref-doc omits `is_vararg`, so engine docs read as before);
   * optional on the interface so hand-built engine `ApiParameter` literals need
   * not spell out `false`.
   */
  isVararg?: boolean;
  /**
   * Per-member docs for an object-literal type, extracted as a tree alongside
   * the flat `types` token (never inside it). Absent for plain-typed params.
   */
  fields?: ApiParameter[];
}

export interface ApiVariable {
  name: string;
  brief: string;
  description: string;
  types: string[];
  /**
   * True for an optional member of a typedef shape (`clear?: boolean`). Set only
   * when the element carries `is_optional: "True"`, so a module-level engine
   * ref-doc VARIABLE — which never carries the key — leaves it absent.
   */
  isOptional?: boolean;
  /** See {@link ApiFunction.deprecated}. */
  deprecated?: string;
  /** See {@link ApiFunction.global}. */
  global?: true;
  /** See {@link ApiFunction.docSource}. */
  docSource?: "upstream";
}

/** The `{ global }` key to spread onto a parsed element, empty for a module member. */
function globalKey(element: Record<string, unknown>): { global?: true } {
  return element.global === true ? { global: true } : {};
}

/** The `{ docSource }` key to spread onto a parsed element, empty for first-party
 * prose. Only the one recognised value yields a key: an unknown provenance would
 * otherwise reach a page with no marker the render layer knows how to draw. */
function docSourceKey(element: Record<string, unknown>): { docSource?: "upstream" } {
  return element.docSource === "upstream" ? { docSource: "upstream" } : {};
}

// A function the ref-doc names differently from the name its engine binding
// registers, so the documented call raises "attempt to call a nil value". Keyed
// by the ref-doc FQN; `name` is the registered FQN and `evidence` the
// registration. The parse renames the element, so the declaration, the signature
// store, the example translations and every audit read the bound name. An entry
// is deleted once no retained target documents the old name.
export interface FunctionNameCorrection {
  readonly name: string;
  readonly evidence: string;
}

export const FUNCTION_NAME_CORRECTIONS: ReadonlyMap<string, FunctionNameCorrection> = new Map([
  [
    "sys.set_render_enable",
    {
      name: "sys.set_render_enabled",
      evidence: 'script_engine.cpp registers {"set_render_enabled", EngineSys_SetRenderEnabled}',
    },
  ],
]);

export function parseDefoldApiDoc(input: unknown): ApiModule {
  if (!isRecord(input)) {
    throw new Error(`parseDefoldApiDoc: expected object, got ${describeKind(input)}`);
  }
  const info = input.info;
  if (!isRecord(info)) {
    throw new Error(`parseDefoldApiDoc: missing or invalid "info" field`);
  }
  const namespace = info.namespace;
  if (typeof namespace !== "string" || namespace.length === 0) {
    throw new Error(`parseDefoldApiDoc: missing or invalid "info.namespace"`);
  }
  const brief = stringOr(info.brief, "");
  const description = stringOr(info.description, "");

  const rawElements = input.elements;
  const elements = Array.isArray(rawElements) ? rawElements : [];

  const functions: ApiFunction[] = [];
  const variables: ApiVariable[] = [];
  const constants: ApiConstant[] = [];
  const properties: ApiProperty[] = [];
  const typedefs: ApiTypedef[] = [];
  const enums: ApiEnum[] = [];
  const structs: ApiStruct[] = [];

  for (const element of elements) {
    if (!isRecord(element)) continue;
    const type = element.type;
    if (type === "FUNCTION") {
      const fn = withDocCorrections(parseFunction(element));
      const corrected = FUNCTION_NAME_CORRECTIONS.get(fn.name);
      functions.push(corrected === undefined ? fn : { ...fn, name: corrected.name });
    } else if (type === "VARIABLE") {
      variables.push(parseVariable(element));
    } else if (type === "CONSTANT") {
      constants.push(parseConstant(element));
    } else if (type === "PROPERTY") {
      const property = parseProperty(element);
      const doc = correctedDoc(
        docCorrectionKey(namespace, "property", property.name),
        property.description,
      );
      properties.push(doc === property.description ? property : { ...property, description: doc });
    } else if (type === "TYPEDEF") {
      typedefs.push(parseTypedef(element));
    } else if (type === "ENUM") {
      const members = parseEnumMembers(element);
      constants.push(...members);
      enums.push({
        name: stringOr(element.name, ""),
        brief: stringOr(element.brief, ""),
        description: stringOr(element.description, ""),
        members: members.map((m) => m.name),
      });
    } else if (type === "STRUCT") {
      structs.push(parseStruct(element));
    }
  }

  return {
    namespace,
    brief,
    description,
    functions,
    variables,
    constants,
    properties,
    typedefs,
    enums,
    structs,
  };
}

// Withholds one overload of a documented function — the one whose `param` has
// exactly the upstream type `type`, or whose return value has exactly the
// upstream type `returns` — while its same-named siblings still emit.
// `name` is the local name, like a `skipFunctions` rule.
export type SkipOverloadRule = { readonly name: string } & (
  | { readonly param: string; readonly type: string }
  | { readonly returns: string }
);

const hasExactType = (slot: ApiParameter, type: string): boolean =>
  slot.types.length === 1 && slot.types[0] === type;

export function withholdOverloads(
  module: ApiModule,
  rules: readonly SkipOverloadRule[],
): ApiModule {
  let functions = module.functions;
  for (const rule of rules) {
    const fqn = `${module.namespace}.${rule.name}`;
    const matches =
      "returns" in rule
        ? (fn: ApiFunction) => fn.returnValues.some((r) => hasExactType(r, rule.returns))
        : (fn: ApiFunction) =>
            fn.parameters.some((p) => p.name === rule.param && hasExactType(p, rule.type));
    const kept = functions.filter((fn) => fn.name !== fqn || !matches(fn));
    if (kept.length === functions.length) {
      const selector =
        "returns" in rule ? `return value is ${rule.returns}` : `${rule.param} is ${rule.type}`;
      throw new Error(`skipOverloads: ${fqn} has no overload whose ${selector}`);
    }
    functions = kept;
  }
  return functions === module.functions ? module : { ...module, functions };
}

// Keyed by the ref-doc FQN, before any `FUNCTION_NAME_CORRECTIONS` rename.
function withDocCorrections(fn: ApiFunction): ApiFunction {
  const correct = (slot: "param" | "return") => (p: ApiParameter) => {
    const doc = correctedDoc(docCorrectionKey(fn.name, slot, p.name), p.doc);
    return doc === p.doc ? p : { ...p, doc };
  };
  return {
    ...fn,
    parameters: fn.parameters.map(correct("param")),
    returnValues: fn.returnValues.map(correct("return")),
  };
}

function parseTypedef(element: Record<string, unknown>): ApiTypedef {
  const functions = parseFunctionList(element.functions);
  const properties = parseVariableList(element.properties);
  const types = parseStringArray(element.types);
  const parents = parseStringArray(element.extends);
  const [aliased] = parseParameterList(element.parameters);
  const aliasOf = aliased?.types ?? [];
  return {
    name: stringOr(element.name, ""),
    ...(functions.length > 0 ? { functions } : {}),
    ...(properties.length > 0 ? { properties } : {}),
    ...(types.length > 0 ? { types } : {}),
    ...(parents.length > 0 ? { extends: parents } : {}),
    ...(aliasOf.length > 0 ? { aliasOf } : {}),
    ...globalKey(element),
  };
}

function parseStruct(element: Record<string, unknown>): ApiStruct {
  const raw = Array.isArray(element.members) ? element.members : [];
  const members: ApiStructMember[] = [];
  for (const member of raw) {
    if (!isRecord(member)) continue;
    const name = stringOr(member.name, "");
    const isOptional = name.endsWith("?");
    members.push({
      name: isOptional ? name.slice(0, -1) : name,
      doc: stringOr(member.doc, ""),
      type: stringOr(member.type, ""),
      isOptional,
    });
  }
  return {
    name: stringOr(element.name, ""),
    brief: stringOr(element.brief, ""),
    description: stringOr(element.description, ""),
    members,
  };
}

function parseProperty(element: Record<string, unknown>): ApiProperty {
  const brief = stringOr(element.brief, "");
  const span = /<span class="type">([^<]+)<\/span>/.exec(brief);
  const types =
    span && span[1] !== undefined
      ? span[1]
          .split("|")
          .map((t) => t.trim())
          .filter((t) => t.length > 0)
      : [];
  return {
    name: stringOr(element.name, ""),
    types,
    brief,
    description: stringOr(element.description, ""),
  };
}

function parseConstant(element: Record<string, unknown>): ApiConstant {
  return {
    name: stringOr(element.name, ""),
    brief: stringOr(element.brief, ""),
    description: stringOr(element.description, ""),
    ...globalKey(element),
  };
}

// A member carries one `doc` string where a constant carried `brief` and
// `description`; both take it.
function parseEnumMembers(element: Record<string, unknown>): ApiConstant[] {
  // A member named bare (1.13.2's bullet3d enums) is registered on the enum's
  // own namespace, so it takes that prefix.
  const enumName = stringOr(element.name, "");
  const owner = enumName.includes(".") ? enumName.slice(0, enumName.lastIndexOf(".")) : "";
  const qualify = (name: string): string =>
    name.includes(".") || owner === "" ? name : `${owner}.${name}`;
  const [value] = parseParameterList(element.parameters);
  const valueType = value?.types.length === 1 && value.types[0] === "string" ? "string" : null;
  const raw = Array.isArray(element.members) ? element.members : [];
  const out: ApiConstant[] = [];
  for (const member of raw) {
    if (!isRecord(member)) continue;
    const doc = stringOr(member.doc, "");
    out.push({
      name: qualify(stringOr(member.name, "")),
      brief: doc,
      description: doc,
      ...(valueType === null ? {} : { valueType }),
      ...(stringOr(member.type, "").endsWith("|nil") ? { nilable: true } : {}),
    });
  }
  return out;
}

function parseFunction(element: Record<string, unknown>): ApiFunction {
  return {
    name: stringOr(element.name, ""),
    brief: stringOr(element.brief, ""),
    description: stringOr(element.description, ""),
    parameters: parseParameterList(element.parameters),
    returnValues: parseParameterList(element.returnvalues),
    examples: stringOr(element.examples, ""),
    ...(typeof element.generics === "string" ? { generics: element.generics } : {}),
    ...(typeof element.deprecated === "string" ? { deprecated: element.deprecated } : {}),
    ...globalKey(element),
    ...docSourceKey(element),
  };
}

function parseVariable(element: Record<string, unknown>): ApiVariable {
  return {
    name: stringOr(element.name, ""),
    brief: stringOr(element.brief, ""),
    description: stringOr(element.description, ""),
    types: parseStringArray(element.types),
    ...(element.is_optional === "True" ? { isOptional: true } : {}),
    ...(typeof element.deprecated === "string" ? { deprecated: element.deprecated } : {}),
    ...globalKey(element),
    ...docSourceKey(element),
  };
}

function parseFunctionList(raw: unknown): ApiFunction[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiFunction[] = [];
  for (const item of raw) {
    if (isRecord(item)) out.push(parseFunction(item));
  }
  return out;
}

function parseVariableList(raw: unknown): ApiVariable[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiVariable[] = [];
  for (const item of raw) {
    if (isRecord(item)) out.push(parseVariable(item));
  }
  return out;
}

function parseParameterList(raw: unknown): ApiParameter[] {
  if (!Array.isArray(raw)) return [];
  const out: ApiParameter[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    out.push({
      name: stringOr(item.name, ""),
      doc: stringOr(item.doc, ""),
      types: parseStringArray(item.types),
      isOptional: item.is_optional === "True",
      isVararg: item.is_vararg === "True",
      ...(Array.isArray(item.fields) ? { fields: parseParameterList(item.fields) } : {}),
    });
  }
  return out;
}

function parseStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") out.push(item);
  }
  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function describeKind(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
