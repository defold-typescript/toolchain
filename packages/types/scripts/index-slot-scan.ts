import * as ts from "typescript";
import {
  type ApiFunction,
  type ApiParameter,
  type ApiStruct,
  FUNCTION_NAME_CORRECTIONS,
  parseDefoldApiDoc,
} from "../src/api-doc";
import { htmlToDocText } from "../src/doc-comment";
import {
  ONE_BASED_PHRASE,
  OVERRIDE_RETURN_SLOT,
  splitSlotFields,
  ZERO_BASED_PHRASE,
} from "../src/index-slot-classifications";
import type { BindingExtraction } from "./engine-binding-extract";
import { loadApiTargets } from "./regen";

export type IndexSlotEvidence =
  | "name"
  | "prose-1-based"
  | "prose-0-based"
  | "prose-index"
  | "cxx-minus-one";

export interface IndexSlotHit {
  readonly key: string;
  readonly evidence: IndexSlotEvidence;
}

const INDEX_NAME = /(^|_)index$|^idx$/i;
const INDEX_WORD = /\bindex\b/i;
const CODE_SPAN = /`([^`]*)`/g;

// Their types come from `lua-types` and keep Lua's own 1-based semantics.
const LUA_STDLIB_NAMESPACES: ReadonlySet<string> = new Set(
  loadApiTargets().flatMap((target) => (target.luaStdlib ?? []).map((lib) => lib.namespace)),
);

function evidenceFor(name: string, prose: string): IndexSlotEvidence | undefined {
  if (ONE_BASED_PHRASE.test(prose)) return "prose-1-based";
  if (ZERO_BASED_PHRASE.test(prose)) return "prose-0-based";
  if (INDEX_NAME.test(name)) return "name";
  if (INDEX_WORD.test(prose.replace(CODE_SPAN, ""))) return "prose-index";
  return undefined;
}

type StructIndex = ReadonlyMap<string, ApiStruct>;

const STRUCT_REFERENCE = /^([A-Za-z_][\w.]*)(?:\[\])?$/;

function structIndex(structs: readonly ApiStruct[] | undefined): StructIndex {
  return new Map((structs ?? []).map((struct) => [struct.name, struct]));
}

// The members of the ref-doc STRUCT a slot's type names, read as fields of the
// slot, so a base a member states is keyed to that member. `within` holds the
// structs already expanded on this path, so a self-referencing struct stops.
function structFields(
  slot: ApiParameter,
  structs: StructIndex,
  within: ReadonlySet<string>,
): { readonly fields: ApiParameter[]; readonly within: ReadonlySet<string> } {
  for (const type of slot.types) {
    const name = STRUCT_REFERENCE.exec(type)?.[1];
    const struct = name === undefined || within.has(name) ? undefined : structs.get(name);
    if (struct === undefined) continue;
    return {
      fields: struct.members.map((member) => ({
        name: member.name,
        doc: member.doc,
        types: [member.type],
        isOptional: member.isOptional,
      })),
      within: new Set([...within, struct.name]),
    };
  }
  return { fields: [], within };
}

function scanSlot(
  key: string,
  slot: ApiParameter,
  hits: IndexSlotHit[],
  structs: StructIndex,
  within: ReadonlySet<string> = new Set(),
): void {
  const { prose, fields } = splitSlotFields(slot.doc);
  const own = evidenceFor(slot.name, prose);
  if (own !== undefined) hits.push({ key, evidence: own });
  const seen = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.name)) continue;
    seen.add(field.name);
    const evidence = evidenceFor(field.name, field.prose);
    if (evidence !== undefined) hits.push({ key: `${key}:${field.name}`, evidence });
  }
  const members = structFields(slot, structs, within);
  for (const field of [...(slot.fields ?? []), ...members.fields]) {
    if (seen.has(field.name)) continue;
    seen.add(field.name);
    scanSlot(`${key}:${field.name}`, field, hits, structs, members.within);
  }
  // A key named only in the slot's prose (`table with ... and \`group_index\``).
  if (slot.types.includes("table")) {
    for (const match of prose.matchAll(CODE_SPAN)) {
      const name = match[1] ?? "";
      if (seen.has(name) || !INDEX_NAME.test(name) || !/^[A-Za-z_]\w*$/.test(name)) continue;
      seen.add(name);
      hits.push({ key: `${key}:${name}`, evidence: "name" });
    }
  }
}

function scanFunction(fn: ApiFunction, hits: IndexSlotHit[], structs: StructIndex): void {
  for (const slot of fn.parameters) {
    scanSlot(`${fn.name}:param:${slot.name}`, slot, hits, structs);
  }
  for (const slot of fn.returnValues) {
    scanSlot(`${fn.name}:return:${slot.name}`, slot, hits, structs);
  }
}

// A binding that subtracts 1 from a checked argument, keyed to the ref-doc
// parameter at that stack position.
function scanBindings(
  functions: readonly ApiFunction[],
  namespace: string,
  bindings: Pick<BindingExtraction, "functions">,
  hits: IndexSlotHit[],
): void {
  for (const binding of bindings.functions) {
    if (binding.namespace !== namespace) continue;
    const name = `${namespace}.${binding.name}`;
    for (const slot of binding.slots) {
      if (slot.minusOne !== true) continue;
      const param = functions.find((fn) => fn.name === name)?.parameters[slot.index - 1];
      if (param) hits.push({ key: `${name}:param:${param.name}`, evidence: "cxx-minus-one" });
    }
  }
}

export function scanIndexSlots(
  doc: unknown,
  namespace: string,
  bindings?: Pick<BindingExtraction, "functions">,
): IndexSlotHit[] {
  if (LUA_STDLIB_NAMESPACES.has(namespace)) return [];
  const module = parseDefoldApiDoc(doc);
  const hits: IndexSlotHit[] = [];
  const structs = structIndex(module.structs);
  for (const fn of module.functions) scanFunction(fn, hits, structs);
  for (const typedef of module.typedefs) {
    for (const fn of typedef.functions ?? []) scanFunction(fn, hits, structs);
  }
  if (bindings) scanBindings(module.functions, namespace, bindings, hits);
  const unique = new Map<string, IndexSlotHit>();
  for (const hit of hits) if (!unique.has(hit.key)) unique.set(hit.key, hit);
  return [...unique.values()];
}

export function isIndexName(name: string): boolean {
  return INDEX_NAME.test(name);
}

// The class fields a library typedef declares, keyed `<Typedef>:field:<member>`.
export function classFieldKeys(doc: unknown): string[] {
  return parseDefoldApiDoc(doc).typedefs.flatMap((typedef) =>
    (typedef.properties ?? []).map((member) => `${typedef.name}:field:${member.name}`),
  );
}

// The class fields that hold a position: index-named members, and members whose
// prose states a base.
export function scanTypedefMemberSlots(doc: unknown): IndexSlotHit[] {
  const hits: IndexSlotHit[] = [];
  for (const typedef of parseDefoldApiDoc(doc).typedefs) {
    for (const member of typedef.properties ?? []) {
      const prose = htmlToDocText(`${member.brief}\n${member.description}`);
      const evidence = ONE_BASED_PHRASE.test(prose)
        ? "prose-1-based"
        : ZERO_BASED_PHRASE.test(prose)
          ? "prose-0-based"
          : INDEX_NAME.test(member.name)
            ? "name"
            : undefined;
      if (evidence !== undefined) {
        hits.push({ key: `${typedef.name}:field:${member.name}`, evidence });
      }
    }
  }
  return hits;
}

const CALLBACK_DOC = /^function\s*\(([^)]*)\)/;

// The arguments a callback slot passes, named by a slot doc of the form
// `function(_, day)`, keyed as fields of that slot. `_` names nothing.
export function callbackArgKeys(doc: unknown): string[] {
  const module = parseDefoldApiDoc(doc);
  const keys: string[] = [];
  const addFunction = (fn: ApiFunction): void => {
    for (const [kind, slots] of [
      ["param", fn.parameters],
      ["return", fn.returnValues],
    ] as const) {
      for (const slot of slots) {
        const args = CALLBACK_DOC.exec(htmlToDocText(slot.doc).trim())?.[1] ?? "";
        for (const arg of args.split(",").map((name) => name.trim())) {
          if (arg !== "_" && /^[A-Za-z_]\w*$/.test(arg)) {
            keys.push(`${fn.name}:${kind}:${slot.name}:${arg}`);
          }
        }
      }
    }
  };
  for (const fn of module.functions) addFunction(fn);
  for (const typedef of module.typedefs) for (const fn of typedef.functions ?? []) addFunction(fn);
  return keys;
}

export interface FunctionBaseStatement {
  readonly fn: string;
  readonly class: "native-1" | "native-0";
  readonly phrase: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function statementsIn(fn: string, element: Record<string, unknown>): FunctionBaseStatement[] {
  const notes = Array.isArray(element.notes) ? element.notes : [];
  const texts = [element.description, ...notes].filter((t): t is string => typeof t === "string");
  const found = new Map<string, FunctionBaseStatement>();
  for (const text of texts) {
    for (const sentence of htmlToDocText(text).split(/(?<=[.!?])\s+|\n/)) {
      for (const [phrase, base] of [
        [ONE_BASED_PHRASE, "native-1"],
        [ZERO_BASED_PHRASE, "native-0"],
      ] as const) {
        if (!found.has(base) && phrase.test(sentence)) {
          found.set(base, { fn, class: base, phrase: sentence.trim() });
        }
      }
    }
  }
  return [...found.values()];
}

// The bases a function states for itself, in its description or its notes
// rather than in a slot's prose ("The index values are zero based"). The
// parser drops `notes`, so they are read from the raw elements; examples are
// never read.
export function scanFunctionBaseStatements(
  doc: unknown,
  namespace: string,
): FunctionBaseStatement[] {
  if (LUA_STDLIB_NAMESPACES.has(namespace) || !isRecord(doc)) return [];
  const elements = Array.isArray(doc.elements) ? doc.elements.filter(isRecord) : [];
  const statements: FunctionBaseStatement[] = [];
  for (const element of elements) {
    const name = typeof element.name === "string" ? element.name : "";
    if (element.type === "FUNCTION") {
      statements.push(...statementsIn(FUNCTION_NAME_CORRECTIONS.get(name)?.name ?? name, element));
    } else if (element.type === "TYPEDEF" && Array.isArray(element.functions)) {
      for (const fn of element.functions.filter(isRecord)) {
        statements.push(...statementsIn(typeof fn.name === "string" ? fn.name : "", fn));
      }
    }
  }
  return statements;
}

// Every slot key a ref-doc declares: each param and return, their nested
// fields, and each field its prose lists.
export function refDocSlotKeys(doc: unknown): string[] {
  const module = parseDefoldApiDoc(doc);
  const keys: string[] = [];
  const structs = structIndex(module.structs);
  const addSlot = (key: string, slot: ApiParameter, within: ReadonlySet<string>): void => {
    keys.push(key);
    for (const field of splitSlotFields(slot.doc).fields) keys.push(`${key}:${field.name}`);
    const members = structFields(slot, structs, within);
    for (const field of [...(slot.fields ?? []), ...members.fields]) {
      addSlot(`${key}:${field.name}`, field, members.within);
    }
  };
  const addFunction = (fn: ApiFunction): void => {
    for (const slot of fn.parameters) addSlot(`${fn.name}:param:${slot.name}`, slot, new Set());
    for (const slot of fn.returnValues) addSlot(`${fn.name}:return:${slot.name}`, slot, new Set());
  };
  for (const fn of module.functions) addFunction(fn);
  for (const typedef of module.typedefs) for (const fn of typedef.functions ?? []) addFunction(fn);
  return keys;
}

const LUA_LITERALS: ReadonlySet<string> = new Set(["true", "false", "nil"]);

// The most values a `LuaMultiReturn<...>` type text can hold: the longest of
// its tuples, so `LuaMultiReturn<[false] | [true, number, number]>` holds 3.
function multiReturnArity(text: string): number | undefined {
  const source = ts.createSourceFile("return.ts", `type T = ${text};`, ts.ScriptTarget.Latest);
  const [statement] = source.statements;
  if (statement === undefined || !ts.isTypeAliasDeclaration(statement)) return undefined;
  const type = statement.type;
  if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return undefined;
  if (type.typeName.text !== "LuaMultiReturn") return undefined;
  const [argument] = type.typeArguments ?? [];
  if (argument === undefined) return undefined;
  const tuples = ts.isUnionTypeNode(argument) ? argument.types : [argument];
  const lengths = tuples.flatMap((tuple) =>
    ts.isTupleTypeNode(tuple) ? [tuple.elements.length] : [],
  );
  return lengths.length === 0 ? undefined : Math.max(...lengths);
}

// Each unnamed multi-value return a library page declares, keyed
// `<fn>:return:`, with the values its prose names in tuple order: the leading
// code spans, one per tuple position. `components` is empty when the prose
// names fewer values than the tuple holds.
export function tupleComponentKeys(doc: unknown): { key: string; components: readonly string[] }[] {
  const module = parseDefoldApiDoc(doc);
  const slots: { key: string; components: readonly string[] }[] = [];
  const addFunction = (fn: ApiFunction): void => {
    for (const slot of fn.returnValues) {
      if (slot.name !== "" || slot.types.length !== 1) continue;
      const arity = multiReturnArity(slot.types[0] ?? "");
      if (arity === undefined) continue;
      const named = [...htmlToDocText(slot.doc).matchAll(CODE_SPAN)]
        .map((match) => match[1] ?? "")
        .filter((name) => /^[A-Za-z_]\w*$/.test(name) && !LUA_LITERALS.has(name))
        .slice(0, arity);
      slots.push({ key: `${fn.name}:return:`, components: named.length < arity ? [] : named });
    }
  };
  for (const fn of module.functions) addFunction(fn);
  for (const typedef of module.typedefs) for (const fn of typedef.functions ?? []) addFunction(fn);
  return slots;
}

function typeFieldKeys(prefix: string, type: ts.TypeNode | undefined, keys: string[]): void {
  if (type === undefined) return;
  if (ts.isParenthesizedTypeNode(type) || ts.isArrayTypeNode(type)) {
    typeFieldKeys(prefix, ts.isArrayTypeNode(type) ? type.elementType : type.type, keys);
  } else if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
    for (const member of type.types) typeFieldKeys(prefix, member, keys);
  } else if (ts.isTupleTypeNode(type)) {
    for (const element of type.elements) typeFieldKeys(prefix, element, keys);
  } else if (ts.isRestTypeNode(type) || ts.isNamedTupleMember(type)) {
    typeFieldKeys(prefix, type.type, keys);
  } else if (ts.isTypeLiteralNode(type)) {
    for (const member of type.members) {
      if (!ts.isPropertySignature(member) || member.name === undefined) continue;
      if (!ts.isIdentifier(member.name) && !ts.isStringLiteral(member.name)) continue;
      const key = `${prefix}:${member.name.text}`;
      keys.push(key);
      typeFieldKeys(key, member.type, keys);
    }
  }
}

function multiReturnElements(type: ts.TypeNode | undefined): readonly ts.TypeNode[] | undefined {
  if (type === undefined || !ts.isTypeReferenceNode(type)) return undefined;
  if (!ts.isIdentifier(type.typeName) || type.typeName.text !== "LuaMultiReturn") return undefined;
  const [tuple] = type.typeArguments ?? [];
  if (tuple === undefined || !ts.isTupleTypeNode(tuple)) return undefined;
  return tuple.elements.map((element) => (ts.isNamedTupleMember(element) ? element.type : element));
}

function signatureSlotKeys(
  fn: string,
  signature: ts.SignatureDeclarationBase,
  returnNames: (fn: string) => readonly string[],
  keys: string[],
): void {
  for (const parameter of signature.parameters) {
    if (!ts.isIdentifier(parameter.name) || parameter.name.text === "this") continue;
    const key = `${fn}:param:${parameter.name.text}`;
    keys.push(key);
    typeFieldKeys(key, parameter.type, keys);
  }
  const type = signature.type;
  if (type === undefined || type.kind === ts.SyntaxKind.VoidKeyword) return;
  const names = returnNames(fn);
  const elements = multiReturnElements(type) ?? [type];
  elements.forEach((element, position) => {
    const name = names[position] ?? (elements.length === 1 ? OVERRIDE_RETURN_SLOT : undefined);
    if (name === undefined) return;
    const key = `${fn}:return:${name}`;
    keys.push(key);
    typeFieldKeys(key, element, keys);
  });
}

function namespaceSlotKeys(
  path: string,
  body: ts.ModuleBody | undefined,
  returnNames: (fn: string) => readonly string[],
  keys: string[],
): void {
  if (body === undefined) return;
  if (ts.isModuleDeclaration(body)) {
    namespaceSlotKeys(`${path}.${body.name.text}`, body.body, returnNames, keys);
    return;
  }
  if (!ts.isModuleBlock(body)) return;
  for (const statement of body.statements) {
    if (ts.isModuleDeclaration(statement)) {
      const name = statement.name.text;
      const nested = path === "" ? name : `${path}.${name}`;
      namespaceSlotKeys(nested, statement.body, returnNames, keys);
    } else if (ts.isFunctionDeclaration(statement) && statement.name !== undefined && path !== "") {
      signatureSlotKeys(`${path}.${statement.name.text}`, statement, returnNames, keys);
    } else if (ts.isInterfaceDeclaration(statement) && path !== "") {
      for (const member of statement.members) {
        if (!ts.isMethodSignature(member) || !ts.isIdentifier(member.name)) continue;
        const fn = `${statement.name.text}:${member.name.text}`;
        signatureSlotKeys(fn, member, returnNames, keys);
      }
    }
  }
}

// Every slot key an emitted declaration file declares, overlays included: each
// `declare global` namespace function and interface method, keyed the way the
// ref-doc keys it (`b2d.shape.get_body:param:shape_index`, `client:send:...`).
// A declaration names no return, so `returnNames` supplies the ref-doc's names
// in tuple order.
export function declaredSlotKeys(
  dts: string,
  returnNames: (fn: string) => readonly string[],
): string[] {
  const file = ts.createSourceFile("surface.d.ts", dts, ts.ScriptTarget.Latest, false);
  const keys: string[] = [];
  for (const statement of file.statements) {
    if (ts.isModuleDeclaration(statement) && statement.name.text === "global") {
      namespaceSlotKeys("", statement.body, returnNames, keys);
    }
  }
  return [...new Set(keys)];
}

// The index-named slots an emitted declaration file declares. This sees what
// the ref-doc scan cannot: authored overloads and authored table shapes.
export function scanDeclaredIndexSlots(
  dts: string,
  returnNames: (fn: string) => readonly string[],
): IndexSlotHit[] {
  return declaredSlotKeys(dts, returnNames)
    .filter((key) => INDEX_NAME.test(key.slice(key.lastIndexOf(":") + 1)))
    .map((key) => ({ key, evidence: "name" }));
}
