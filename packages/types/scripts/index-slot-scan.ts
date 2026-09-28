import * as ts from "typescript";
import { type ApiFunction, type ApiParameter, parseDefoldApiDoc } from "../src/api-doc";
import {
  ONE_BASED_PHRASE,
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

function scanSlot(key: string, slot: ApiParameter, hits: IndexSlotHit[]): void {
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
  for (const field of slot.fields ?? []) {
    if (seen.has(field.name)) continue;
    seen.add(field.name);
    scanSlot(`${key}:${field.name}`, field, hits);
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

function scanFunction(fn: ApiFunction, hits: IndexSlotHit[]): void {
  for (const slot of fn.parameters) scanSlot(`${fn.name}:param:${slot.name}`, slot, hits);
  for (const slot of fn.returnValues) scanSlot(`${fn.name}:return:${slot.name}`, slot, hits);
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
  for (const fn of module.functions) scanFunction(fn, hits);
  for (const typedef of module.typedefs) {
    for (const fn of typedef.functions ?? []) scanFunction(fn, hits);
  }
  if (bindings) scanBindings(module.functions, namespace, bindings, hits);
  const unique = new Map<string, IndexSlotHit>();
  for (const hit of hits) if (!unique.has(hit.key)) unique.set(hit.key, hit);
  return [...unique.values()];
}

// The slot name a declared return takes when no ref-doc names it, as for a
// return an authored overlay supplies (`b2d.body.create_shape`).
export const UNNAMED_RETURN_SLOT = "result";

// Every slot key a ref-doc declares: each param and return, their nested
// fields, and each field its prose lists.
export function refDocSlotKeys(doc: unknown): string[] {
  const module = parseDefoldApiDoc(doc);
  const keys: string[] = [];
  const addSlot = (key: string, slot: ApiParameter): void => {
    keys.push(key);
    for (const field of splitSlotFields(slot.doc).fields) keys.push(`${key}:${field.name}`);
    for (const field of slot.fields ?? []) addSlot(`${key}:${field.name}`, field);
  };
  const addFunction = (fn: ApiFunction): void => {
    for (const slot of fn.parameters) addSlot(`${fn.name}:param:${slot.name}`, slot);
    for (const slot of fn.returnValues) addSlot(`${fn.name}:return:${slot.name}`, slot);
  };
  for (const fn of module.functions) addFunction(fn);
  for (const typedef of module.typedefs) for (const fn of typedef.functions ?? []) addFunction(fn);
  return keys;
}

function typeFieldKeys(prefix: string, type: ts.TypeNode | undefined, keys: string[]): void {
  if (type === undefined) return;
  if (ts.isParenthesizedTypeNode(type) || ts.isArrayTypeNode(type)) {
    typeFieldKeys(prefix, ts.isArrayTypeNode(type) ? type.elementType : type.type, keys);
  } else if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
    for (const member of type.types) typeFieldKeys(prefix, member, keys);
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
    const name = names[position] ?? (elements.length === 1 ? UNNAMED_RETURN_SLOT : undefined);
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
