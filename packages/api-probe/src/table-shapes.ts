import ts from "typescript";
import type { LuaKind } from "../../types/scripts/engine-binding-extract";
import {
  type DeclaredKinds,
  declaredKinds,
  UnmappedLuaKindError,
} from "../../types/scripts/lua-kind";

// What a declared table holds under one key: its kinds, `nil` among them when
// the key may be absent, and the shape of the value when it is a table.
export interface DeclaredField {
  readonly kinds: DeclaredKinds;
  readonly shape?: DeclaredShape;
}

// The keys a declared table names, and what it holds under every other key of
// the index kind.
export interface DeclaredShape {
  readonly fields: Readonly<Record<string, DeclaredField>>;
  readonly index?: { readonly key: DeclaredKinds; readonly value: DeclaredField };
}

// What the engine reported for each path inside an ok call's returned tables:
// `1.version` is the `version` key of value 1, `1[number]` every number key.
export type FieldReport = Readonly<Record<string, readonly string[]>>;

// Shapes nested deeper than this are not compared, which keeps a recursive
// declaration finite.
export const SHAPE_DEPTH = 4;

const EXTENSION_TABLES: ReadonlySet<string> = new Set([
  "LuaTable",
  "LuaMap",
  "ReadonlyLuaMap",
  "LuaSet",
  "ReadonlyLuaSet",
]);
const EXTENSION_SETS: ReadonlySet<string> = new Set(["LuaSet", "ReadonlyLuaSet"]);
const DEFERRED =
  ts.TypeFlags.TypeParameter |
  ts.TypeFlags.IndexedAccess |
  ts.TypeFlags.Index |
  ts.TypeFlags.Conditional |
  ts.TypeFlags.Substitution;

export function kindsOf(type: ts.Type, checker: ts.TypeChecker): DeclaredKinds {
  try {
    return declaredKinds(type, checker);
  } catch (error) {
    if (error instanceof UnmappedLuaKindError) return "any";
    throw error;
  }
}

// A Defold buffer reports as plain userdata. An `Opaque` handle hides its
// representation: most are userdata, a render target is a numeric asset handle.
export function kindMatches(actual: string, declared: Exclude<DeclaredKinds, "any">): boolean {
  if ((declared as readonly string[]).includes(actual)) return true;
  if (actual === "userdata") return declared.includes("buffer");
  return actual === "number" && declared.includes("userdata");
}

function unionKinds(all: readonly DeclaredKinds[]): DeclaredKinds {
  if (all.some((kinds) => kinds === "any")) return "any";
  return [...new Set((all as LuaKind[][]).flat())].sort();
}

function holdsTable(field: DeclaredField): boolean {
  return field.kinds === "any" || field.kinds.includes("table");
}

// A value one of several declarations describes: a table value is compared
// only when every declaration that allows a table gives it a shape.
function unionFields(all: readonly DeclaredField[]): DeclaredField {
  const kinds = unionKinds(all.map((field) => field.kinds));
  const tables = all.filter(holdsTable);
  const shapes = tables.flatMap((field) => (field.shape === undefined ? [] : [field.shape]));
  const shape =
    shapes.length > 0 && shapes.length === tables.length ? unionShapes(shapes) : undefined;
  return shape === undefined ? { kinds } : { kinds, shape };
}

const ABSENT: DeclaredField = { kinds: ["nil"] };

// A field is required only when every shape requires it.
function unionShapes(shapes: readonly DeclaredShape[]): DeclaredShape {
  const names = new Set(shapes.flatMap((shape) => Object.keys(shape.fields)));
  const fields: Record<string, DeclaredField> = {};
  for (const name of [...names].sort()) {
    fields[name] = unionFields(shapes.map((shape) => shape.fields[name] ?? ABSENT));
  }
  const indexes = shapes.flatMap((shape) => (shape.index === undefined ? [] : [shape.index]));
  if (indexes.length === 0) return { fields };
  return {
    fields,
    index: {
      key: unionKinds(indexes.map((index) => index.key)),
      value: unionFields(indexes.map((index) => index.value)),
    },
  };
}

// A field is required when any member of the intersection requires it.
function intersectShapes(shapes: readonly DeclaredShape[]): DeclaredShape {
  const names = new Set(shapes.flatMap((shape) => Object.keys(shape.fields)));
  const fields: Record<string, DeclaredField> = {};
  for (const name of [...names].sort()) {
    const all = shapes.flatMap((shape) => {
      const field = shape.fields[name];
      return field === undefined ? [] : [field];
    });
    const merged = unionFields(all);
    const required = all.some((field) => field.kinds !== "any" && !field.kinds.includes("nil"));
    fields[name] =
      required && merged.kinds !== "any"
        ? { ...merged, kinds: merged.kinds.filter((kind) => kind !== "nil") }
        : merged;
  }
  const indexed = unionShapes(shapes.filter((shape) => shape.index !== undefined));
  return indexed.index === undefined ? { fields } : { fields, index: indexed.index };
}

function fieldOf(type: ts.Type, checker: ts.TypeChecker, depth: number): DeclaredField {
  const kinds = kindsOf(type, checker);
  const shape = declaredShape(type, checker, depth + 1);
  return shape === undefined ? { kinds } : { kinds, shape };
}

function optional(field: DeclaredField): DeclaredField {
  if (field.kinds === "any" || field.kinds.includes("nil")) return field;
  return { ...field, kinds: [...field.kinds, "nil" as const].sort() };
}

function extensionTable(type: ts.Type): string | undefined {
  const symbol = type.getSymbol();
  const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
  if (symbol === undefined || file === undefined || !file.includes("language-extensions")) {
    return undefined;
  }
  return EXTENSION_TABLES.has(symbol.name) ? symbol.name : undefined;
}

// One object type, never a union or an intersection.
function objectShape(
  type: ts.Type,
  checker: ts.TypeChecker,
  depth: number,
): DeclaredShape | undefined {
  const extension = extensionTable(type);
  if (extension !== undefined) {
    const [key, value] = checker.getTypeArguments(type as ts.TypeReference);
    if (key === undefined) return undefined;
    return {
      fields: {},
      index: {
        key: kindsOf(key, checker),
        value: EXTENSION_SETS.has(extension)
          ? { kinds: ["boolean"] }
          : value === undefined
            ? { kinds: "any" }
            : fieldOf(value, checker, depth),
      },
    };
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const elements = checker.getTypeArguments(type as ts.TypeReference);
    if (elements.length === 0) return undefined;
    return {
      fields: {},
      index: {
        key: ["number"],
        value: unionFields(elements.map((element) => fieldOf(element, checker, depth))),
      },
    };
  }
  const fields: Record<string, DeclaredField> = {};
  for (const property of checker.getPropertiesOfType(type)) {
    if (property.name.startsWith("__")) continue;
    const propertyType = checker.getTypeOfSymbol(property);
    if (checker.getNonNullableType(propertyType).getCallSignatures().length > 0) continue;
    const field = fieldOf(propertyType, checker, depth);
    fields[property.name] = property.flags & ts.SymbolFlags.Optional ? optional(field) : field;
  }
  const indexes = checker.getIndexInfosOfType(type).map((info) => ({
    fields: {},
    index: { key: kindsOf(info.keyType, checker), value: fieldOf(info.type, checker, depth) },
  }));
  if (Object.keys(fields).length === 0 && indexes.length === 0) return undefined;
  const index = indexes.length === 0 ? undefined : unionShapes(indexes).index;
  return index === undefined ? { fields } : { fields, index };
}

function tableShape(
  type: ts.Type,
  checker: ts.TypeChecker,
  depth: number,
): DeclaredShape | undefined {
  if (!type.isIntersection()) return objectShape(type, checker, depth);
  const shapes = type.types
    .filter((member) => member.flags & ts.TypeFlags.Object)
    .flatMap((member) => {
      const shape = objectShape(member, checker, depth);
      return shape === undefined ? [] : [shape];
    });
  return shapes.length === 0 ? undefined : intersectShapes(shapes);
}

function constituents(type: ts.Type, checker: ts.TypeChecker): ts.Type[] {
  if (type.isUnion()) return type.types.flatMap((member) => constituents(member, checker));
  if (type.flags & DEFERRED) {
    const constraint = checker.getBaseConstraintOfType(type);
    return constraint === undefined || constraint === type ? [] : constituents(constraint, checker);
  }
  return [type];
}

// The keys and values a declared type says its table holds, read from the
// constituents that are Lua tables. `undefined` when none names a key or an
// index (`object`, `{}`), or when one of several does not: that table is not
// compared.
export function declaredShape(
  type: ts.Type,
  checker: ts.TypeChecker,
  depth = 0,
): DeclaredShape | undefined {
  if (depth >= SHAPE_DEPTH) return undefined;
  const tables = constituents(type, checker).filter((member) => {
    const kinds = kindsOf(member, checker);
    return kinds !== "any" && kinds.length === 1 && kinds[0] === "table";
  });
  if (tables.length === 0) return undefined;
  const shapes: DeclaredShape[] = [];
  for (const table of tables) {
    const shape = tableShape(table, checker, depth);
    if (shape === undefined) return undefined;
    shapes.push(shape);
  }
  return unionShapes(shapes);
}

interface ReportNode {
  readonly kinds: Set<string>;
  // Keyed by segment: `.name` for a string key, `[kind]` for any other.
  readonly children: Map<string, ReportNode>;
}

function reportNode(): ReportNode {
  return { kinds: new Set(), children: new Map() };
}

function segments(path: string): string[] {
  const out: string[] = [];
  let at = 0;
  while (at < path.length) {
    const end =
      path[at] === "["
        ? path.indexOf("]", at) + 1
        : [path.indexOf(".", at + 1), path.indexOf("[", at + 1)]
            .filter((i) => i !== -1)
            .reduce((a, b) => Math.min(a, b), path.length);
    if (end <= at) break;
    out.push(path.slice(at, end));
    at = end;
  }
  return out;
}

function reportTree(position: number, report: FieldReport): ReportNode {
  const root = reportNode();
  const prefix = String(position);
  for (const [path, kinds] of Object.entries(report)) {
    const rest = path.slice(prefix.length);
    if (!path.startsWith(prefix) || (rest[0] !== "." && rest[0] !== "[")) continue;
    let node = root;
    for (const segment of segments(rest)) {
      let child = node.children.get(segment);
      if (child === undefined) {
        child = reportNode();
        node.children.set(segment, child);
      }
      node = child;
    }
    for (const kind of kinds) node.kinds.add(kind);
  }
  return root;
}

// Every element under one index key kind, judged together.
function mergeNodes(nodes: readonly ReportNode[]): ReportNode {
  const merged = reportNode();
  for (const node of nodes) {
    for (const kind of node.kinds) merged.kinds.add(kind);
    for (const [segment, child] of node.children) {
      const existing = merged.children.get(segment);
      merged.children.set(segment, existing === undefined ? child : mergeNodes([existing, child]));
    }
  }
  return merged;
}

function label(path: string): string {
  return path.startsWith(".") ? path.slice(1) : path;
}

function compareField(
  position: number,
  path: string,
  node: ReportNode | undefined,
  field: DeclaredField,
  problems: string[],
): void {
  if (field.kinds === "any") return;
  const declared = field.kinds.join("|");
  if (node === undefined) {
    if (!field.kinds.includes("nil")) {
      problems.push(`value ${position} field ${label(path)} is absent, declared ${declared}`);
    }
    return;
  }
  for (const kind of [...node.kinds].sort()) {
    if (!kindMatches(kind, field.kinds)) {
      problems.push(`value ${position} field ${label(path)} is ${kind}, declared ${declared}`);
    }
  }
  if (field.shape !== undefined && node.kinds.has("table")) {
    compareShape(position, path, node, field.shape, problems);
  }
}

function compareShape(
  position: number,
  path: string,
  node: ReportNode,
  shape: DeclaredShape,
  problems: string[],
): void {
  const rest = new Map(node.children);
  for (const [name, field] of Object.entries(shape.fields)) {
    const segment = `.${name}`;
    compareField(position, `${path}${segment}`, rest.get(segment), field, problems);
    rest.delete(segment);
  }
  const index = shape.index;
  if (index !== undefined) {
    const groups = new Map<string, ReportNode[]>();
    for (const [segment, child] of rest) {
      const key = segment.startsWith(".") ? "string" : segment.slice(1, -1);
      if (index.key !== "any" && !kindMatches(key, index.key)) continue;
      groups.set(key, [...(groups.get(key) ?? []), child]);
      rest.delete(segment);
    }
    for (const [key, nodes] of groups) {
      compareField(position, `${path}[${key}]`, mergeNodes(nodes), index.value, problems);
    }
  }
  for (const segment of rest.keys()) {
    problems.push(`value ${position} field ${label(`${path}${segment}`)} is undeclared`);
  }
}

// How the fields the engine reported for returned value `position` differ from
// its declared shape: a required field absent, a field of another kind, or a
// key the shape does not declare, at every depth the shape describes.
export function shapeMismatches(
  position: number,
  shape: DeclaredShape,
  report: FieldReport,
): string[] {
  const problems: string[] = [];
  compareShape(position, "", reportTree(position, report), shape, problems);
  return problems;
}
