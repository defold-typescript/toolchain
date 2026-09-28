import { resolve } from "node:path";
import ts from "typescript";
import { comparedNamespaces, mergeBindings } from "../../types/scripts/engine-binding-diff";
import {
  type BindingFunction,
  type LuaKind,
  readBindingsForTarget,
} from "../../types/scripts/engine-binding-extract";
import {
  type DeclaredKinds,
  declaredKinds,
  declaredMembers,
  surfaceProgram,
  UnmappedLuaKindError,
} from "../../types/scripts/lua-kind";
import { type ApiTarget, loadApiTargets } from "../../types/scripts/regen";
import { INDEX_SLOT_CLASSIFICATIONS } from "../../types/src/index-slot-classifications";
import { constantProbes } from "./constant-probes";
import {
  ACCEPTED_ALONE,
  type Box2DBackend,
  box2dBackends,
  contextFor,
  FINAL_CALLS,
  HANDLE_WITNESSES,
  PRELUDES,
  PROBE_URLS,
  type ProbeContext,
  runsOn,
  SCRIPT_KINDS,
  type ScriptKind,
  WITNESS_OVERRIDES,
} from "./contexts";
import {
  indexBase,
  indexProbeCalls,
  PROBED_INDEX_CLASSES,
  type SignatureArgs,
  type Unverified,
} from "./index-probes";
import { messageProbes } from "./message-probes";
import { acceptedWitnesses, narrowingVerdict, negativeWitness } from "./negative-witness";
import { PROBE_DENYLIST } from "./probe-denylist";
import { propertyProbes } from "./property-probes";

const CORE_TYPES_FILE = resolve(import.meta.dir, "../../types/src/core-types.ts");

// The values a signature declares it returns: one entry per position, and
// whether a rest element allows more.
export interface DeclaredReturns {
  readonly kinds: readonly DeclaredKinds[];
  readonly variadic: boolean;
}

// A call whose one slot holds a kind chosen from the binding: one it refuses,
// which must raise, or one it reads, which must end ok.
export interface WitnessTarget {
  readonly slot: number;
  readonly kind: LuaKind;
  // The binding file, relative to the vendored engine sources.
  readonly binding: string;
  readonly expect: "ok" | "raise";
  // Whether the declaration accepts the kind.
  readonly declared: boolean;
  // The accepted too-narrow verdict recording why the declaration rejects a
  // kind the binding reads.
  readonly verdict?: string;
}

// A built-in message the go script posts, or checks when the engine sends it.
// An incoming message the probe project does not trigger may never arrive.
export interface MessageCall {
  readonly id: string;
  readonly direction: "outgoing" | "incoming";
  readonly triggered?: boolean;
}

export interface ProbeCall {
  readonly name: string;
  readonly variant: string;
  readonly kind: ScriptKind;
  readonly call: string;
  readonly returns?: DeclaredReturns;
  readonly witness?: WitnessTarget;
  // The `INDEX_SLOT_CLASSIFICATIONS` key an index probe checks.
  readonly index?: string;
  // A write to a property the declaration marks readonly, which must raise.
  readonly readonlySet?: true;
  readonly message?: MessageCall;
}

// One step of the go script's message queue: a post, or a pause until the
// engine has sent `wait` once more.
export type QueueStep =
  | { readonly id: string; readonly name: string; readonly variant: string; readonly post: string }
  | { readonly wait: string };

// What the go script posts one per frame after its calls, the payload kinds it
// checks each received message against, and the messages it waits for.
export interface MessageScript {
  readonly queue: readonly QueueStep[];
  readonly shapes: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly triggered: readonly string[];
}

export interface SkippedSlot {
  readonly name: string;
  readonly slot: number;
  readonly reason: string;
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
  // Slots that get no negative call, and kinds that get no accepted call.
  readonly skipped: readonly SkippedSlot[];
  // Lowered and passed-through index slots this pass does not probe.
  readonly indexUnverified: readonly Unverified[];
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

export class NoWitness extends Error {}

interface Scope {
  readonly fqn: string;
  readonly slot: number;
  readonly context: ProbeContext;
  readonly checker: ts.TypeChecker;
  readonly constants: ReadonlySet<string>;
  readonly urls: Set<string>;
  // How many times each handle has been witnessed in the current call.
  readonly handles: Map<string, number>;
  // The classified index fields below the current slot, each witnessed as the
  // first position in its native base.
  readonly indexFields?: ReadonlyMap<string, string>;
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
      const value =
        scope.indexFields?.get(property.name) ?? witness(propertyType, scope, depth + 1);
      return `${propertyKey(property.name)}: ${value}`;
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

// A value of `type` built in `context`'s script, for a slot outside any
// function signature. Throws `NoWitness` when none can be built.
export function typeWitness(
  type: ts.Type,
  fqn: string,
  context: ProbeContext,
  checker: ts.TypeChecker,
  constants: ReadonlySet<string>,
  urls: Set<string>,
): string {
  return witness(type, { fqn, slot: 0, context, checker, constants, urls, handles: new Map() });
}

// The `PROBE_URLS` names an expression refers to.
export function urlsIn(expression: string): string[] {
  return Object.keys(PROBE_URLS).filter((id) => new RegExp(`\\b${id}\\b`).test(expression));
}

interface Param {
  readonly name: string;
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
    return { name: param.name, type, optional, rest };
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
  const key = `${scope.fqn}:param:${param.name}`;
  const indexClass = probedIndexClass(key);
  if (indexClass !== undefined) return String(indexBase(indexClass));
  const indexFields = new Map<string, string>();
  for (const candidate of INDEX_SLOT_CLASSIFICATIONS.keys()) {
    const fieldClass = candidate.startsWith(`${key}:`) ? probedIndexClass(candidate) : undefined;
    if (fieldClass === undefined) continue;
    indexFields.set(candidate.slice(candidate.lastIndexOf(":") + 1), String(indexBase(fieldClass)));
  }
  const type = param.optional ? scope.checker.getNonNullableType(param.type) : param.type;
  return witness(type, indexFields.size === 0 ? full : { ...full, indexFields });
}

// An engine index position is witnessed as the first element in its native
// base, which every collection the probe passes has.
function probedIndexClass(key: string): string | undefined {
  const classification = INDEX_SLOT_CLASSIFICATIONS.get(key)?.class;
  return classification !== undefined && PROBED_INDEX_CLASSES.has(classification)
    ? classification
    : undefined;
}

function kindsOf(type: ts.Type, checker: ts.TypeChecker): DeclaredKinds {
  try {
    return declaredKinds(type, checker);
  } catch (error) {
    if (error instanceof UnmappedLuaKindError) return "any";
    throw error;
  }
}

// `LuaMultiReturn<[A, B?]>` declares one value per tuple element, `void` none,
// and any other type one.
export function declaredReturns(signature: ts.Signature, checker: ts.TypeChecker): DeclaredReturns {
  const returned = signature.getReturnType();
  if (returned.flags & ts.TypeFlags.Void) return { kinds: [], variadic: false };
  const tuple =
    returned.aliasSymbol?.name === "LuaMultiReturn" ? returned.aliasTypeArguments?.[0] : undefined;
  if (tuple === undefined) return { kinds: [kindsOf(returned, checker)], variadic: false };
  if (!checker.isTupleType(tuple)) return { kinds: [], variadic: true };
  const target = (tuple as ts.TypeReference).target as ts.TupleType;
  const elements = checker.getTypeArguments(tuple as ts.TypeReference);
  const kinds: DeclaredKinds[] = [];
  let variadic = false;
  elements.forEach((element, i) => {
    const flags = target.elementFlags[i] ?? ts.ElementFlags.Required;
    if (flags & ts.ElementFlags.Variable) {
      variadic = true;
      return;
    }
    const elementKinds = kindsOf(element, checker);
    kinds.push(
      flags & ts.ElementFlags.Optional && elementKinds !== "any"
        ? [...new Set<LuaKind>([...elementKinds, "nil"])].sort()
        : elementKinds,
    );
  });
  return { kinds, variadic };
}

// The positive argument when it already is of `kind`, else restated as `kind`
// naming the same thing: a probe url as its address string or its object's
// path hash, a hashed id as its string and a string id (a fresh name
// included) as its hash.
function pairedWitness(positive: string, kind: LuaKind): string | undefined {
  const address = PROBE_URLS[positive];
  const own =
    address !== undefined
      ? "url"
      : /^hash\(/.test(positive)
        ? "hash"
        : /^"[^"]*"$/.test(positive) || /^fresh\(/.test(positive)
          ? "string"
          : /^-?\d/.test(positive)
            ? "number"
            : /^(true|false)$/.test(positive)
              ? "boolean"
              : undefined;
  if (own === kind) return positive;
  if (address !== undefined) {
    if (kind === "string") return JSON.stringify(address);
    const path = /^[^:]*:(\/[^#]*)/.exec(address)?.[1];
    return kind === "hash" && path !== undefined ? `hash(${JSON.stringify(path)})` : undefined;
  }
  const hashed = /^hash\(("[^"]*")\)$/.exec(positive)?.[1];
  if (hashed !== undefined && kind === "string") return hashed;
  if (own === "string" && kind === "hash") return `hash(${positive})`;
  return undefined;
}

function tryWitness(type: ts.Type, scope: Scope): string | undefined {
  try {
    return witness(type, scope);
  } catch (error) {
    if (!(error instanceof NoWitness)) throw error;
    return undefined;
  }
}

// A value of the first member of `type` that declares `kind`, or undefined
// when no such member has a witness.
function memberWitness(type: ts.Type, kind: LuaKind, scope: Scope): string | undefined {
  const members = type.isUnion() ? type.types.filter((member) => !isNilType(member)) : [type];
  for (const member of members) {
    const kinds = kindsOf(member, scope.checker);
    if (kinds === "any" || !kinds.includes(kind)) continue;
    const value = tryWitness(member, scope);
    if (value !== undefined) return value;
  }
  return undefined;
}

interface FunctionCalls {
  calls: ProbeCall[];
  unwitnessed: Unwitnessed[];
  skipped: SkippedSlot[];
  signature?: SignatureArgs;
}

function callsFor(
  target: ApiTarget,
  fqn: string,
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  constants: ReadonlySet<string>,
  urls: Set<string>,
  binding: BindingFunction | undefined,
): FunctionCalls {
  const namespace = fqn.slice(0, fqn.lastIndexOf("."));
  const context = contextFor(namespace);
  const signatures = checker
    .getTypeOfSymbol(symbol)
    .getCallSignatures()
    .filter((signature) => !isTypeApplication(signature));
  const out: FunctionCalls = { calls: [], unwitnessed: [], skipped: [] };
  const seen = new Set<string>();
  const negated = new Set<number>();
  // Each `<slot>:<kind>` a binding reads, with its accepted call or why it has none.
  const pending = new Map<string, { readonly call: ProbeCall } | { readonly reason: string }>();
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
    const returns = declaredReturns(signature, checker);
    const witnessAll = (count: number, handles = new Map<string, number>()) =>
      params.slice(0, count).map((param, i) => slotWitness(param, i + 1, { ...scope, handles }));
    try {
      for (const [variant, count] of variants) {
        const call = `${fqn}(${witnessAll(count).join(", ")})`;
        if (seen.has(call)) continue;
        seen.add(call);
        const label = overload === undefined ? variant : `${overload}-${variant}`;
        out.calls.push({ name: fqn, variant: label, kind: context.kind, call, returns });
      }
      const positive = witnessAll(present);
      out.signature ??= {
        names: signature.getParameters().map((param) => param.name),
        args: positive,
      };
      params.slice(0, present).forEach((param, i) => {
        const slot = i + 1;
        const type = param.optional ? checker.getNonNullableType(param.type) : param.type;
        const kinds = kindsOf(type, checker);
        const extracted = binding?.slots.find((candidate) => candidate.index === slot);
        const file = binding?.file ?? "";
        // A negative call stops at its slot, which raises first; an accepted
        // call passes every declared argument, so the call as a whole is valid.
        const withSlot = (expression: string, count = Math.max(required, slot)) => {
          const args = positive.slice(0, count);
          args[i] = expression;
          return `${fqn}(${args.join(", ")})`;
        };
        // Each slot gets its negative call from the first probed signature that
        // declares it: a kind every signature refuses is a kind that one refuses.
        if (!negated.has(slot)) {
          negated.add(slot);
          const chosen = negativeWitness(kinds, extracted);
          if ("skipped" in chosen) {
            out.skipped.push({ name: fqn, slot, reason: chosen.skipped });
          } else {
            out.calls.push({
              name: fqn,
              variant: `negative-${slot}`,
              kind: context.kind,
              call: withSlot(chosen.expression),
              witness: { slot, kind: chosen.kind, binding: file, expect: "raise", declared: false },
            });
          }
        }
        // Each kind gets its accepted call from the first signature that
        // declares it at this slot, else from the first that declares the slot:
        // only a kind every signature leaves out is one the declaration rejects.
        // A slot the negative call skips gets none, and that reason is listed once.
        const accepted = acceptedWitnesses(kinds, extracted, fqn, (kind, declared) => {
          const paired = pairedWitness(positive[i] as string, kind);
          if (paired !== undefined || !declared) return paired;
          // Count the handles the earlier slots took, so a second handle of one
          // kind names a different object, as in the positive call. The member
          // the positive witness picks keeps the positive argument, which an
          // override may have made name a real, distinct object.
          const member = { ...scope, slot, handles: new Map<string, number>() };
          witnessAll(i, member.handles);
          const plain = { ...member, handles: new Map(member.handles) };
          const value = memberWitness(type, kind, member);
          return value !== undefined && value === tryWitness(type, plain) ? positive[i] : value;
        });
        if ("skipped" in accepted) return;
        for (const { kind, reason } of accepted.missing) {
          if (!pending.has(`${slot}:${kind}`)) pending.set(`${slot}:${kind}`, { reason });
        }
        for (const { kind, expression, declared } of accepted.witnesses) {
          const key = `${slot}:${kind}`;
          const prior = pending.get(key);
          if (
            prior !== undefined &&
            "call" in prior &&
            (prior.call.witness?.declared || !declared)
          ) {
            continue;
          }
          const verdict = declared ? undefined : narrowingVerdict(target, fqn, slot);
          pending.set(key, {
            call: {
              name: fqn,
              variant: `accepted-${slot}-${kind}`,
              kind: context.kind,
              call: withSlot(
                expression,
                ACCEPTED_ALONE.has(`${fqn}:${slot}:${kind}`) ? slot : present,
              ),
              witness: {
                slot,
                kind,
                binding: file,
                expect: "ok",
                declared,
                ...(verdict === undefined ? {} : { verdict }),
              },
            },
          });
        }
      });
    } catch (error) {
      if (!(error instanceof NoWitness)) throw error;
      out.unwitnessed.push({ name, reason: error.message });
    }
  });
  // After every positive call, so none is repeated as an accepted call.
  for (const [key, entry] of pending) {
    if ("reason" in entry) {
      out.skipped.push({ name: fqn, slot: Number(key.split(":")[0]), reason: entry.reason });
      continue;
    }
    if (seen.has(entry.call.call)) continue;
    seen.add(entry.call.call);
    for (const id of urlsIn(entry.call.call)) urls.add(id);
    out.calls.push(entry.call);
  }
  return out;
}

// A negative call, a write to a readonly property and an accepted call whose
// kind a verdict records the declaration rejecting are calls the declaration
// must refuse, so each carries `@ts-expect-error`.
function renderProbe(call: ProbeCall): string {
  const name = JSON.stringify(call.name);
  const variant = JSON.stringify(call.variant);
  const refused =
    call.readonlySet === true ||
    call.witness?.expect === "raise" ||
    call.witness?.verdict !== undefined;
  if (!refused) {
    return `    probe(${name}, ${variant}, () => ${call.call});`;
  }
  return [
    `    probe(${name}, ${variant}, () =>`,
    "      // @ts-expect-error",
    `      ${call.call},`,
    "    );",
  ].join("\n");
}

function renderStep(step: QueueStep): string {
  if ("wait" in step) return `      { wait: ${JSON.stringify(step.wait)} },`;
  const name = JSON.stringify(step.name);
  const variant = JSON.stringify(step.variant);
  return `      { name: ${name}, variant: ${variant}, post: () => ${step.post} },`;
}

function renderShapes(shapes: MessageScript["shapes"]): string {
  const entries = Object.entries(shapes).map(([id, fields]) => {
    const inner = Object.entries(fields).map(
      ([field, kinds]) => `${propertyKey(field)}: ${JSON.stringify(kinds)}`,
    );
    return `${propertyKey(id)}: { ${inner.join(", ")} }`.replace("{  }", "{}");
  });
  return `{ ${entries.join(", ")} }`;
}

export function renderFile(
  kind: ScriptKind,
  calls: readonly ProbeCall[],
  used: ReadonlySet<string>,
  messages?: MessageScript,
): string {
  const urls = new Set(used);
  for (const statement of PRELUDES[kind]) {
    for (const id of urlsIn(statement)) urls.add(id);
  }
  for (const step of kind === "go" ? (messages?.queue ?? []) : []) {
    if ("post" in step) for (const id of urlsIn(step.post)) urls.add(id);
  }
  const factory = { go: "defineScript", gui: "defineGuiScript", render: "defineRenderScript" }[
    kind
  ];
  const declarations = [...urls]
    .sort()
    .map((id) => `    const ${id} = msg.url(${JSON.stringify(PROBE_URLS[id])});`);
  // A negative call the engine wrongly accepts, or an accepted call, can change
  // what later calls see, so every witness call runs after every positive one.
  // With messages to post, the go script reports once its queue drained.
  const queued = messages !== undefined && kind === "go";
  const final = (call: ProbeCall) => queued && FINAL_CALLS.has(`${call.name}:${call.variant}`);
  const direct = calls.filter((call) => call.message === undefined && !final(call));
  const last = calls.filter(final).map((call) => ({ ...call, post: call.call, id: call.name }));
  const probes = [
    ...direct.filter((call) => call.witness === undefined),
    ...direct.filter((call) => call.witness !== undefined),
  ].map(renderProbe);
  // A material left enabled at the end of the frame crashes the engine's
  // command parse, so the render script resets it once its probes ran. A
  // physics event listener takes the collision events the go script waits for
  // as messages, and a probed gravity pulls the faller off the floor it rests
  // on, so the go script removes the one and restores the other.
  const cleanup =
    kind === "render"
      ? ["    render.disable_material();"]
      : queued
        ? [
            "    physics.set_event_listener();",
            "    physics.set_gravity(vmath.vector3(0, -10, 0));",
          ]
        : [];
  const prelude = PRELUDES[kind].map((statement) => `    ${statement}`);
  const ending = queued
    ? [
        "    queue([",
        ...(messages as MessageScript).queue.map(renderStep),
        "    ], [",
        ...last.map(renderStep),
        "    ]);",
        `    listen(${renderShapes((messages as MessageScript).shapes)}, ${JSON.stringify((messages as MessageScript).triggered)});`,
      ]
    : [`    finish(${JSON.stringify(kind)});`];
  const body = [...declarations, ...prelude, ...probes, ...cleanup, ...ending];
  // The render script runs its probes on the first frame, once the main
  // collection (and the go script it reports to) exists.
  const hook =
    kind === "render"
      ? ["  update() {", "    if (!first()) return;", ...body, "  },"]
      : ["  init() {", ...body, "  },", ...(queued ? ["  update() {", "    pump();", "  },"] : [])];
  const onMessage =
    kind === "go"
      ? [
          "  on_message(_self, message_id, message) {",
          '    if (message_id === hash("probe_done")) record((message as unknown as { kind: string }).kind);',
          ...(queued ? ["    receive(message_id, message);"] : []),
          "  },",
        ]
      : [];
  const imports = [
    ...(queued ? ["listen", "pump", "queue", "receive"] : ["finish"]),
    "fresh",
    "probe",
    ...(kind === "go" ? ["record"] : []),
    ...(kind === "render" ? ["first"] : []),
    ...(direct.some((call) => call.variant === "constant") ? ["defined"] : []),
    ...(direct.some((call) => call.variant === "distinct") ? ["distinct"] : []),
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
  const bindings = new Map(
    mergeBindings(
      readBindingsForTarget(target.id).functions.filter(
        (binding) =>
          runsOn(`${binding.namespace}.${binding.name}`, backend, tags) &&
          (backend === "v2" ? !binding.file.includes("/v3/") : !binding.file.includes("/v2/")),
      ),
    ).map((binding) => [`${binding.namespace}.${binding.name}`, binding]),
  );
  const program = surfaceProgram(target);
  const checker = program.getTypeChecker();
  const members = declaredMembers(program, comparedNamespaces(target));
  const constants = new Set(members.constants.keys());
  const calls: ProbeCall[] = [];
  const unwitnessed: Unwitnessed[] = [];
  const skipped: SkippedSlot[] = [];
  const signatures = new Map<string, SignatureArgs>();
  const urlsByKind = new Map<ScriptKind, Set<string>>(
    SCRIPT_KINDS.map((kind) => [kind, new Set<string>()]),
  );
  const functions = [...members.functions.keys()].filter((fqn) => runsOn(fqn, backend, tags));
  for (const fqn of functions) {
    const symbol = members.functions.get(fqn) as ts.Symbol;
    if (denied(fqn)) continue;
    const kind = contextFor(fqn.slice(0, fqn.lastIndexOf("."))).kind;
    const urls = new Set<string>();
    const generated = callsFor(target, fqn, symbol, checker, constants, urls, bindings.get(fqn));
    calls.push(...generated.calls);
    unwitnessed.push(...generated.unwitnessed);
    skipped.push(...generated.skipped);
    if (generated.signature !== undefined) signatures.set(fqn, generated.signature);
    if (generated.calls.length > 0) {
      for (const id of urls) urlsByKind.get(kind)?.add(id);
    }
  }
  const index = indexProbeCalls(signatures);
  const added = [...index.calls];
  // Properties, messages and every constant outside `b2d` do not depend on the
  // Box2D backend, so only the stock-engine pass checks them.
  added.push(...constantProbes(target, program, backend).calls);
  let messages: MessageScript | undefined;
  if (backend === "v2") {
    const posted = messageProbes(target, program);
    added.push(...propertyProbes(target, program).calls, ...posted.calls);
    messages = posted;
  }
  calls.push(...added);
  for (const call of added) {
    for (const id of urlsIn(call.call)) urlsByKind.get(call.kind)?.add(id);
  }
  const files: Record<string, string> = {};
  for (const kind of SCRIPT_KINDS) {
    files[PROBE_FILES[kind]] = renderFile(
      kind,
      calls.filter((call) => call.kind === kind),
      urlsByKind.get(kind) ?? new Set(),
      messages,
    );
  }
  return {
    target,
    backend,
    functions,
    calls,
    unwitnessed,
    skipped,
    indexUnverified: index.unverified,
    files,
  };
}
