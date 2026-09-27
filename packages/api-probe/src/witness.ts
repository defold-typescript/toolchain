import { resolve } from "node:path";
import ts from "typescript";
import { comparedNamespaces } from "../../types/scripts/engine-binding-diff";
import { declaredMembers, surfaceProgram } from "../../types/scripts/lua-kind";
import { type ApiTarget, loadApiTargets } from "../../types/scripts/regen";
import {
  type Box2DBackend,
  box2dBackends,
  contextFor,
  HANDLE_WITNESSES,
  PRELUDES,
  PROBE_URLS,
  type ProbeContext,
  runsOn,
  SCRIPT_KINDS,
  type ScriptKind,
  WITNESS_OVERRIDES,
} from "./contexts";
import { PROBE_DENYLIST } from "./probe-denylist";

const CORE_TYPES_FILE = resolve(import.meta.dir, "../../types/src/core-types.ts");

export interface ProbeCall {
  readonly name: string;
  readonly variant: string;
  readonly kind: ScriptKind;
  readonly call: string;
}

export interface Unwitnessed {
  readonly name: string;
  readonly reason: string;
}

export interface ProbeGeneration {
  readonly target: ApiTarget;
  readonly backend: Box2DBackend;
  readonly functions: readonly string[];
  readonly calls: readonly ProbeCall[];
  readonly unwitnessed: readonly Unwitnessed[];
  // `probe_go.ts`, `probe_gui.ts` and `probe_render.ts`, relative to `main/`.
  readonly files: Readonly<Record<string, string>>;
}

export const PROBE_FILES: Readonly<Record<ScriptKind, string>> = {
  go: "probe_go.ts",
  gui: "probe_gui.ts",
  render: "probe_render.ts",
};

export function probeTarget(id = process.env.PROBE_TARGET): ApiTarget {
  const targets = loadApiTargets();
  const target =
    id === undefined ? targets.find((t) => t.default === true) : targets.find((t) => t.id === id);
  if (!target) throw new Error(`no committed API target ${id ?? "(default)"}`);
  return target;
}

class NoWitness extends Error {}

interface Scope {
  readonly fqn: string;
  readonly slot: number;
  readonly context: ProbeContext;
  readonly checker: ts.TypeChecker;
  readonly constants: ReadonlySet<string>;
  readonly urls: Set<string>;
  // How many times each handle has been witnessed in the current call.
  readonly handles: Map<string, number>;
}

function opaqueName(type: ts.Type, checker: ts.TypeChecker): string | undefined {
  const symbol = type.getSymbol() ?? type.aliasSymbol;
  const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
  if (symbol?.name !== "Opaque" || file === undefined || resolve(file) !== CORE_TYPES_FILE) {
    return undefined;
  }
  const [name] = checker.getTypeArguments(type as ts.TypeReference);
  return name?.isStringLiteral() ? name.value : undefined;
}

function coreName(type: ts.Type): string | undefined {
  const symbol = type.getSymbol();
  const file = symbol?.declarations?.[0]?.getSourceFile().fileName;
  if (!symbol || file === undefined || resolve(file) !== CORE_TYPES_FILE) return undefined;
  return symbol.name;
}

function url(scope: Scope, name: string): string {
  if (PROBE_URLS[name] === undefined) throw new Error(`unknown probe url ${name}`);
  scope.urls.add(name);
  return name;
}

const CORE_WITNESSES: Readonly<Record<string, string>> = {
  Hash: 'hash("probe")',
  Vector: "vmath.vector([1, 2, 3])",
  Vector3: "vmath.vector3(1, 1, 1)",
  Vector4: "vmath.vector4(1, 1, 1, 1)",
  Quaternion: "vmath.quat()",
  Matrix4: "vmath.matrix4()",
};

// Lower ranks are tried first, so a slot that takes a url, a handle or a hash
// gets one rather than a name that would have to resolve to it.
function unionRank(type: ts.Type, checker: ts.TypeChecker): number {
  const core = coreName(type);
  if (core === "Url") return 0;
  if (opaqueName(type, checker) !== undefined) return 1;
  if (core !== undefined) return 2;
  if (type.flags & ts.TypeFlags.NumberLike) return 3;
  if (type.flags & ts.TypeFlags.BooleanLike) return 4;
  if (type.flags & ts.TypeFlags.StringLike) return 5;
  if (type.getCallSignatures().length > 0) return 7;
  return 6;
}

function isNilType(type: ts.Type): boolean {
  return (type.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Null)) !== 0;
}

function propertyKey(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function brandWitness(type: ts.Type, scope: Scope): string | undefined {
  const brand = scope.checker.getPropertyOfType(type, "__brand");
  if (!brand) return undefined;
  const brandType = scope.checker.getTypeOfSymbol(brand);
  if (!brandType.isStringLiteral()) return undefined;
  if (!scope.constants.has(brandType.value)) {
    throw new NoWitness(`no declared constant for brand ${brandType.value}`);
  }
  return brandType.value;
}

function handleWitness(name: string, scope: Scope): string {
  const expressions = HANDLE_WITNESSES[name]?.[scope.context.kind];
  if (expressions === undefined || expressions.length === 0) {
    throw new NoWitness(`no ${scope.context.kind} witness for Opaque<"${name}">`);
  }
  const used = scope.handles.get(name) ?? 0;
  scope.handles.set(name, used + 1);
  const expression = expressions[Math.min(used, expressions.length - 1)] as string;
  for (const id of Object.keys(PROBE_URLS)) {
    if (new RegExp(`\\b${id}\\b`).test(expression)) url(scope, id);
  }
  return expression;
}

function functionWitness(type: ts.Type, scope: Scope, depth: number): string {
  const [signature] = type.getCallSignatures();
  const returned = signature?.getReturnType();
  if (
    !returned ||
    returned.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined | ts.TypeFlags.Any) ||
    returned.flags & ts.TypeFlags.Unknown
  ) {
    return "() => {}";
  }
  return `() => (${witness(returned, scope, depth + 1)})`;
}

function objectWitness(type: ts.Type, scope: Scope, depth: number): string {
  const { checker } = scope;
  const symbolName = type.getSymbol()?.name;
  if (symbolName === "LuaMap" || symbolName === "LuaTable") return `new ${symbolName}()`;
  if (symbolName === "LuaSet") return "new LuaSet()";
  if (checker.isTupleType(type)) {
    const elements = checker.getTypeArguments(type as ts.TypeReference);
    const fixed = ((type as ts.TypeReference).target as ts.TupleType).fixedLength;
    return `[${elements
      .slice(0, fixed)
      .map((element) => witness(element, scope, depth + 1))
      .join(", ")}]`;
  }
  if (checker.isArrayType(type)) {
    const [element] = checker.getTypeArguments(type as ts.TypeReference);
    return element ? `[${witness(element, scope, depth + 1)}]` : "[]";
  }
  const fields = checker
    .getPropertiesOfType(type)
    .filter((property) => (property.flags & ts.SymbolFlags.Optional) === 0)
    .map((property) => {
      const propertyType = checker.getTypeOfSymbol(property);
      return `${propertyKey(property.name)}: ${witness(propertyType, scope, depth + 1)}`;
    });
  return fields.length === 0 ? "{}" : `{ ${fields.join(", ")} }`;
}

function witness(type: ts.Type, scope: Scope, depth = 0): string {
  const { checker } = scope;
  if (depth > 6) throw new NoWitness(`witness nests too deep at ${checker.typeToString(type)}`);
  const flags = type.flags;
  if (flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return "1";
  if (type.isStringLiteral()) return JSON.stringify(type.value);
  if (type.isNumberLiteral()) return String(type.value);
  if (flags & ts.TypeFlags.BooleanLiteral) {
    return (type as unknown as { intrinsicName: string }).intrinsicName;
  }
  if (flags & ts.TypeFlags.Boolean) return "true";
  if (flags & ts.TypeFlags.Number) return "1";
  if (flags & ts.TypeFlags.String) return '"probe"';
  if (isNilType(type)) return "undefined";
  if (type.isUnion()) {
    const members = type.types
      .filter((member) => !isNilType(member))
      .map((member, index) => ({ member, index, rank: unionRank(member, checker) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index);
    let failure: unknown;
    for (const { member } of members) {
      try {
        return witness(member, scope, depth + 1);
      } catch (error) {
        if (!(error instanceof NoWitness)) throw error;
        failure ??= error;
      }
    }
    throw failure ?? new NoWitness(`no member of ${checker.typeToString(type)} has a witness`);
  }
  if (type.isIntersection()) {
    const branded = brandWitness(type, scope);
    if (branded !== undefined) return branded;
    for (const member of type.types) {
      const opaque = opaqueName(member, checker);
      if (opaque !== undefined) return handleWitness(opaque, scope);
    }
    const primitive = type.types.find(
      (member) => member.flags & (ts.TypeFlags.NumberLike | ts.TypeFlags.StringLike),
    );
    if (primitive) return witness(primitive, scope, depth + 1);
    return objectWitness(type, scope, depth);
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
    if (!constraint || constraint === type) return "1";
    return witness(constraint, scope, depth + 1);
  }
  if (flags & ts.TypeFlags.Object) {
    const opaque = opaqueName(type, checker);
    if (opaque !== undefined) return handleWitness(opaque, scope);
    const core = coreName(type);
    if (core === "Url") return url(scope, scope.context.url);
    if (core !== undefined && CORE_WITNESSES[core] !== undefined) return CORE_WITNESSES[core];
    if (type.getCallSignatures().length > 0) return functionWitness(type, scope, depth);
    return objectWitness(type, scope, depth);
  }
  throw new NoWitness(`no witness for ${checker.typeToString(type)}`);
}

interface Param {
  readonly type: ts.Type;
  readonly optional: boolean;
  readonly rest: boolean;
}

function signatureParams(signature: ts.Signature, checker: ts.TypeChecker): Param[] {
  return signature.getParameters().map((param) => {
    const declaration = param.valueDeclaration;
    const rest =
      declaration !== undefined && ts.isParameter(declaration)
        ? declaration.dotDotDotToken !== undefined
        : false;
    const optional =
      rest ||
      (declaration !== undefined &&
        ts.isParameter(declaration) &&
        checker.isOptionalParameter(declaration));
    let type = checker.getTypeOfSymbol(param);
    if (rest && checker.isArrayType(type)) {
      type = checker.getTypeArguments(type as ts.TypeReference)[0] ?? type;
    }
    return { type, optional, rest };
  });
}

// `go.get<P>()(url, key)`: the empty call only applies a type argument, so the
// inner signature is the one Lua sees.
function isTypeApplication(signature: ts.Signature): boolean {
  return (
    signature.getParameters().length === 0 &&
    (signature.getTypeParameters()?.length ?? 0) > 0 &&
    signature.getReturnType().getCallSignatures().length > 0
  );
}

function slotWitness(param: Param, slot: number, scope: Omit<Scope, "slot">): string {
  const namespace = scope.fqn.slice(0, scope.fqn.lastIndexOf("."));
  const override =
    WITNESS_OVERRIDES[`${scope.fqn}:${slot}`] ?? WITNESS_OVERRIDES[`${namespace}.*:${slot}`];
  const full: Scope = { ...scope, slot };
  if (override !== undefined) {
    for (const id of Object.keys(PROBE_URLS)) {
      if (new RegExp(`\\b${id}\\b`).test(override)) url(full, id);
    }
    return override;
  }
  const type = param.optional ? scope.checker.getNonNullableType(param.type) : param.type;
  return witness(type, full);
}

function callsFor(
  fqn: string,
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  constants: ReadonlySet<string>,
  urls: Set<string>,
): { calls: ProbeCall[]; unwitnessed: Unwitnessed[] } {
  const namespace = fqn.slice(0, fqn.lastIndexOf("."));
  const context = contextFor(namespace);
  const signatures = checker
    .getTypeOfSymbol(symbol)
    .getCallSignatures()
    .filter((signature) => !isTypeApplication(signature));
  const calls: ProbeCall[] = [];
  const unwitnessed: Unwitnessed[] = [];
  const seen = new Set<string>();
  signatures.forEach((signature, index) => {
    const overload = signatures.length > 1 ? `overload${index + 1}` : undefined;
    const name = overload === undefined ? fqn : `${fqn}:${overload}`;
    if (overload !== undefined && PROBE_DENYLIST[name] !== undefined) return;
    const params = signatureParams(signature, checker);
    const scope = { fqn, context, checker, constants, urls };
    const required = params.filter((param) => !param.optional).length;
    const variants: [string, number][] = [["required", required]];
    const present = params.filter((param) => !param.rest).length;
    if (present > required) variants.push(["optional", present]);
    try {
      for (const [variant, count] of variants) {
        const handles = new Map<string, number>();
        const args = params
          .slice(0, count)
          .map((param, i) => slotWitness(param, i + 1, { ...scope, handles }));
        const call = `${fqn}(${args.join(", ")})`;
        if (seen.has(call)) continue;
        seen.add(call);
        const label = overload === undefined ? variant : `${overload}-${variant}`;
        calls.push({ name: fqn, variant: label, kind: context.kind, call });
      }
    } catch (error) {
      if (!(error instanceof NoWitness)) throw error;
      unwitnessed.push({ name, reason: error.message });
    }
  });
  return { calls, unwitnessed };
}

function renderFile(kind: ScriptKind, calls: readonly ProbeCall[], used: ReadonlySet<string>) {
  const urls = new Set(used);
  for (const statement of PRELUDES[kind]) {
    for (const id of Object.keys(PROBE_URLS)) {
      if (new RegExp(`\\b${id}\\b`).test(statement)) urls.add(id);
    }
  }
  const factory = { go: "defineScript", gui: "defineGuiScript", render: "defineRenderScript" }[
    kind
  ];
  const declarations = [...urls]
    .sort()
    .map((id) => `    const ${id} = msg.url(${JSON.stringify(PROBE_URLS[id])});`);
  const probes = calls.map(
    (call) =>
      `    probe(${JSON.stringify(call.name)}, ${JSON.stringify(call.variant)}, () => ${call.call});`,
  );
  // A material left enabled at the end of the frame crashes the engine's
  // command parse, so the render script resets it once its probes ran.
  const cleanup = kind === "render" ? ["    render.disable_material();"] : [];
  const prelude = PRELUDES[kind].map((statement) => `    ${statement}`);
  const body = [
    ...declarations,
    ...prelude,
    ...probes,
    ...cleanup,
    `    finish(${JSON.stringify(kind)});`,
  ];
  // The render script runs its probes on the first frame, once the main
  // collection (and the go script it reports to) exists.
  const hook =
    kind === "render"
      ? ["  update() {", "    if (!first()) return;", ...body, "  },"]
      : ["  init() {", ...body, "  },"];
  const onMessage =
    kind === "go"
      ? [
          "  on_message(_self, message_id, message) {",
          '    if (message_id === hash("probe_done")) record((message as unknown as { kind: string }).kind);',
          "  },",
        ]
      : [];
  const imports = [
    "finish",
    "fresh",
    "probe",
    ...(kind === "go" ? ["record"] : []),
    ...(kind === "render" ? ["first"] : []),
  ]
    .sort()
    .join(", ");
  return [
    "// Generated by packages/api-probe/src/witness.ts.",
    `import { ${factory} } from "@defold-typescript/types";`,
    `import { ${imports} } from "../probe/runtime";`,
    "",
    `export default ${factory}({`,
    ...hook,
    ...onMessage,
    "});",
    "",
  ].join("\n");
}

function denied(fqn: string): boolean {
  if (PROBE_DENYLIST[fqn] !== undefined) return true;
  const namespace = fqn.slice(0, fqn.lastIndexOf("."));
  return PROBE_DENYLIST[`${namespace}.*`] !== undefined;
}

export function generateProbes(
  target: ApiTarget = probeTarget(),
  backend: Box2DBackend = "v2",
): ProbeGeneration {
  const tags = box2dBackends(target.id);
  const program = surfaceProgram(target);
  const checker = program.getTypeChecker();
  const members = declaredMembers(program, comparedNamespaces(target));
  const constants = new Set(members.constants.keys());
  const calls: ProbeCall[] = [];
  const unwitnessed: Unwitnessed[] = [];
  const urlsByKind = new Map<ScriptKind, Set<string>>(
    SCRIPT_KINDS.map((kind) => [kind, new Set<string>()]),
  );
  const functions = [...members.functions.keys()].filter((fqn) => runsOn(fqn, backend, tags));
  for (const fqn of functions) {
    const symbol = members.functions.get(fqn) as ts.Symbol;
    if (denied(fqn)) continue;
    const kind = contextFor(fqn.slice(0, fqn.lastIndexOf("."))).kind;
    const urls = new Set<string>();
    const generated = callsFor(fqn, symbol, checker, constants, urls);
    calls.push(...generated.calls);
    unwitnessed.push(...generated.unwitnessed);
    if (generated.calls.length > 0) {
      for (const id of urls) urlsByKind.get(kind)?.add(id);
    }
  }
  const files: Record<string, string> = {};
  for (const kind of SCRIPT_KINDS) {
    files[PROBE_FILES[kind]] = renderFile(
      kind,
      calls.filter((call) => call.kind === kind),
      urlsByKind.get(kind) ?? new Set(),
    );
  }
  return { target, backend, functions, calls, unwitnessed, files };
}
