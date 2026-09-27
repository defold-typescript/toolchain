import { resolve } from "node:path";
import ts from "typescript";
import type { LuaKind } from "./engine-binding-extract";
import { gateCompilerOptions } from "./example-typecheck";
import type { ApiTarget } from "./regen";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const CORE_TYPES_FILE = resolve(PACKAGE_ROOT, "src", "core-types.ts");

export type DeclaredKinds = LuaKind[] | "any";

export class UnmappedLuaKindError extends Error {
  override readonly name = "UnmappedLuaKindError";
  constructor(readonly typeText: string) {
    super(`no Lua kind for declared type ${typeText}`);
  }
}

const CORE_KINDS: ReadonlyMap<string, LuaKind> = new Map<string, LuaKind>([
  ["Hash", "hash"],
  ["Url", "url"],
  ["Vector", "vector"],
  ["Vector3", "vector3"],
  ["Vector4", "vector4"],
  ["Quaternion", "quat"],
  ["Matrix4", "matrix4"],
]);

const PRIMITIVE_KINDS: ReadonlySet<LuaKind> = new Set<LuaKind>(["number", "string", "boolean"]);

function coreKind(type: ts.Type, checker: ts.TypeChecker): LuaKind | undefined {
  const symbol = type.getSymbol();
  const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
  if (!symbol || file === undefined || resolve(file) !== CORE_TYPES_FILE) return undefined;
  if (symbol.name === "Opaque") {
    const [name] = checker.getTypeArguments(type as ts.TypeReference);
    return name?.isStringLiteral() && name.value === "buffer" ? "buffer" : "userdata";
  }
  return CORE_KINDS.get(symbol.name);
}

function collectKinds(type: ts.Type, checker: ts.TypeChecker, out: Set<LuaKind>): boolean {
  const flags = type.flags;
  if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
  if (flags & ts.TypeFlags.Never) return true;
  if (flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Null)) {
    out.add("nil");
    return true;
  }
  if (flags & ts.TypeFlags.NumberLike) {
    out.add("number");
    return true;
  }
  if (flags & ts.TypeFlags.StringLike) {
    out.add("string");
    return true;
  }
  if (flags & ts.TypeFlags.BooleanLike) {
    out.add("boolean");
    return true;
  }
  if (type.isUnion()) {
    return type.types.every((member) => collectKinds(member, checker, out));
  }
  if (type.isIntersection()) {
    // A branded primitive (`number & { __brand }`) is its primitive, and a
    // branded handle is its handle; only a plain object intersection is a table.
    const members = type.types.map((member) => {
      const kinds = new Set<LuaKind>();
      return collectKinds(member, checker, kinds) ? kinds : undefined;
    });
    if (members.some((kinds) => kinds === undefined)) return false;
    const all = members.flatMap((kinds) => [...(kinds as Set<LuaKind>)]);
    const primitives = all.filter((kind) => PRIMITIVE_KINDS.has(kind));
    const handles = all.filter((kind) => kind !== "table" && kind !== "function");
    const chosen =
      primitives.length > 0
        ? primitives
        : handles.length > 0
          ? handles
          : all.includes("function")
            ? ["function" as const]
            : ["table" as const];
    for (const kind of chosen) out.add(kind);
    return true;
  }
  if (
    flags &
    (ts.TypeFlags.TypeParameter |
      ts.TypeFlags.IndexedAccess |
      ts.TypeFlags.Index |
      ts.TypeFlags.Conditional |
      ts.TypeFlags.Substitution)
  ) {
    const constraint = checker.getBaseConstraintOfType(type);
    if (!constraint || constraint === type) return false;
    return collectKinds(constraint, checker, out);
  }
  if (flags & ts.TypeFlags.Object) {
    const core = coreKind(type, checker);
    if (core) out.add(core);
    else if (type.getCallSignatures().length > 0) out.add("function");
    else out.add("table");
    return true;
  }
  throw new UnmappedLuaKindError(checker.typeToString(type));
}

// `undefined`/`void` members come back as `nil`, which is what marks a slot
// optional. A declared `unknown` or `any` is `"any"`: reported, never widened
// into every kind.
export function declaredKinds(type: ts.Type, checker: ts.TypeChecker): DeclaredKinds {
  const out = new Set<LuaKind>();
  if (!collectKinds(type, checker, out)) return "any";
  return [...out].sort();
}

export interface DeclaredSlot {
  readonly index: number;
  readonly kinds: DeclaredKinds;
  readonly optional: boolean;
  // Named properties of the slot's object members, or `null` when no member
  // names any (a `Record`, `LuaMap` or array reads whatever it is given).
  readonly fields: string[] | null;
}

export interface DeclaredFunction {
  readonly name: string;
  readonly minArgs: number;
  readonly maxArgs: number | "variadic";
  readonly slots: DeclaredSlot[];
  // One per signature; `"variadic"` for a multi-return with a rest element.
  readonly returnCounts: (number | "variadic")[];
}

export interface DeclaredSurface {
  readonly functions: Map<string, DeclaredFunction>;
  readonly constants: Set<string>;
  readonly unmapped: string[];
}

export function surfaceEntry(target: ApiTarget): string {
  return target.default === true
    ? resolve(PACKAGE_ROOT, "index.d.ts")
    : resolve(PACKAGE_ROOT, target.generatedDir, "index.d.ts");
}

// The surface a consumer of `target` loads: the generated declarations plus
// every hand-authored overlay the entry imports.
export function surfaceProgram(target: ApiTarget): ts.Program {
  return ts.createProgram({ rootNames: [surfaceEntry(target)], options: gateCompilerOptions() });
}

function globalNamespaces(program: ts.Program, checker: ts.TypeChecker): Map<string, ts.Symbol> {
  const found = new Map<string, ts.Symbol>();
  const visit = (statements: ts.NodeArray<ts.Statement>) => {
    for (const statement of statements) {
      if (!ts.isModuleDeclaration(statement)) continue;
      if (statement.flags & ts.NodeFlags.GlobalAugmentation) {
        if (statement.body && ts.isModuleBlock(statement.body)) visit(statement.body.statements);
        continue;
      }
      if (!ts.isIdentifier(statement.name) || found.has(statement.name.text)) continue;
      const symbol = checker.getSymbolAtLocation(statement.name);
      if (symbol) found.set(statement.name.text, symbol);
    }
  };
  for (const file of program.getSourceFiles()) {
    if (file.fileName.includes("/node_modules/")) continue;
    visit(file.statements);
  }
  return found;
}

function namespaceSymbol(
  roots: ReadonlyMap<string, ts.Symbol>,
  checker: ts.TypeChecker,
  namespace: string,
): ts.Symbol | undefined {
  const [head, ...rest] = namespace.split(".");
  let symbol = roots.get(head ?? "");
  for (const part of rest) {
    if (!symbol) return undefined;
    symbol = checker.getExportsOfModule(symbol).find((member) => member.name === part);
  }
  return symbol;
}

function objectFields(type: ts.Type, checker: ts.TypeChecker): string[] | null {
  const members = type.isUnion() ? type.types : [type];
  let fields: Set<string> | null = null;
  for (const member of members) {
    if (!(member.flags & ts.TypeFlags.Object) || coreKind(member, checker)) continue;
    if (member.getCallSignatures().length > 0 || checker.isArrayType(member)) continue;
    if (checker.isTupleType(member)) continue;
    const names = checker.getPropertiesOfType(member).map((property) => property.name);
    if (names.length === 0) continue;
    fields ??= new Set();
    for (const name of names) fields.add(name);
  }
  return fields ? [...fields].sort() : null;
}

function returnCount(signature: ts.Signature, checker: ts.TypeChecker): number | "variadic" {
  const type = signature.getReturnType();
  if (type.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)) return 0;
  if (type.aliasSymbol?.name === "LuaMultiReturn") {
    const tuple = type.aliasTypeArguments?.[0];
    if (tuple && checker.isTupleType(tuple)) {
      const target = (tuple as ts.TypeReference).target as ts.TupleType;
      return target.hasRestElement ? "variadic" : target.fixedLength;
    }
    return "variadic";
  }
  return 1;
}

interface SlotAccumulator {
  kinds: Set<LuaKind> | "any";
  optional: boolean;
  fields: Set<string> | null;
}

function readFunction(
  name: string,
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  unmapped: string[],
): DeclaredFunction {
  const type = checker.getTypeOfSymbol(symbol);
  const signatures = type.getCallSignatures();
  const slots = new Map<number, SlotAccumulator>();
  let minArgs = Number.POSITIVE_INFINITY;
  let maxArgs: number | "variadic" = 0;
  const returnCounts: (number | "variadic")[] = [];
  const counts: { length: number; variadic: boolean }[] = [];

  for (const signature of signatures) {
    const params = signature.getParameters();
    // `go.get<P>()(url, key)`: the empty call only applies a type argument and
    // the transpiler erases it, so the inner call is the one Lua sees.
    if (
      params.length === 0 &&
      (signature.getTypeParameters()?.length ?? 0) > 0 &&
      signature.getReturnType().getCallSignatures().length > 0
    ) {
      continue;
    }
    let required = 0;
    let variadic = false;
    params.forEach((param, i) => {
      const declaration = param.valueDeclaration;
      if (!declaration || !ts.isParameter(declaration)) return;
      const rest = declaration.dotDotDotToken !== undefined;
      const optional = rest || checker.isOptionalParameter(declaration);
      if (!optional) required = i + 1;
      if (rest) variadic = true;
      let paramType = checker.getTypeOfSymbol(param);
      if (rest && checker.isArrayType(paramType)) {
        paramType = checker.getTypeArguments(paramType as ts.TypeReference)[0] ?? paramType;
      }
      let kinds: DeclaredKinds;
      try {
        kinds = declaredKinds(paramType, checker);
      } catch (error) {
        if (!(error instanceof UnmappedLuaKindError)) throw error;
        unmapped.push(`${name} slot ${i + 1}: ${error.typeText}`);
        kinds = "any";
      }
      const slot = slots.get(i + 1) ?? { kinds: new Set<LuaKind>(), optional: false, fields: null };
      if (kinds === "any") slot.kinds = "any";
      else if (slot.kinds !== "any") for (const kind of kinds) slot.kinds.add(kind);
      if (optional || (kinds !== "any" && kinds.includes("nil"))) slot.optional = true;
      const fields = objectFields(checker.getNonNullableType(paramType), checker);
      if (fields) {
        slot.fields ??= new Set();
        for (const field of fields) slot.fields.add(field);
      }
      slots.set(i + 1, slot);
    });
    minArgs = Math.min(minArgs, required);
    if (variadic) maxArgs = "variadic";
    else if (maxArgs !== "variadic") maxArgs = Math.max(maxArgs, params.length);
    counts.push({ length: params.length, variadic });
    returnCounts.push(returnCount(signature, checker));
  }

  const declaredSlots: DeclaredSlot[] = [...slots.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, slot]) => {
      const absentSomewhere = counts.some((c) => !c.variadic && c.length < index);
      const kinds =
        slot.kinds === "any" ? "any" : [...slot.kinds].filter((k) => k !== "nil").sort();
      return {
        index,
        kinds,
        optional: slot.optional || absentSomewhere,
        fields: slot.fields ? [...slot.fields].sort() : null,
      };
    });
  return {
    name,
    minArgs: Number.isFinite(minArgs) ? minArgs : 0,
    maxArgs,
    slots: declaredSlots,
    returnCounts: [...new Set(returnCounts)],
  };
}

// Every function and constant declared directly in each named namespace, read
// through the checker so overlays, overloads and aliases are resolved.
export function readDeclaredSurface(
  program: ts.Program,
  namespaces: readonly string[],
): DeclaredSurface {
  const checker = program.getTypeChecker();
  const roots = globalNamespaces(program, checker);
  const functions = new Map<string, DeclaredFunction>();
  const constants = new Set<string>();
  const unmapped: string[] = [];
  for (const namespace of namespaces) {
    const symbol = namespaceSymbol(roots, checker, namespace);
    if (!symbol) continue;
    for (const exported of checker.getExportsOfModule(symbol)) {
      const fqn = `${namespace}.${exported.name}`;
      // A Lua name that is a TypeScript keyword ships as `export { _delete as delete }`.
      const member =
        exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      if (member.flags & ts.SymbolFlags.Function) {
        functions.set(fqn, readFunction(fqn, member, checker, unmapped));
      } else if (member.flags & ts.SymbolFlags.Variable) {
        constants.add(fqn);
      }
    }
  }
  return { functions, constants, unmapped };
}
