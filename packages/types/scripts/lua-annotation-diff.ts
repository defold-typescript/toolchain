import {
  OPTIONAL_SLOT_CORRECTIONS,
  PARAM_TYPE_CORRECTIONS,
  type ParamTypeCorrection,
  REQUIRED_SLOT_CORRECTIONS,
  RETURN_TYPE_CORRECTIONS,
  type RequiredSlotCorrection,
  type ReturnTypeCorrection,
} from "../src/emit-dts";
import { matchBracket, splitTopLevel } from "../src/luals-type-expr";
import type { LuaKind } from "./engine-binding-extract";
import {
  ANNOTATION_VERDICTS_FILE,
  type AnnotationVerdict,
  readAnnotationVerdicts,
} from "./lua-annotation-verdicts";
import {
  type AnnotatedFunction,
  type AnnotatedGeneric,
  type AnnotatedReturn,
  type AnnotationModel,
  type AnnotationSurface,
  loadAnnotations,
} from "./lua-annotations";
import {
  type DeclaredFunction,
  type DeclaredKinds,
  editorSurfaceProgram,
  readDeclaredSurface,
  surfaceProgram,
} from "./lua-kind";
import { type ApiTarget, loadApiTargets } from "./regen";

export { ANNOTATION_VERDICTS_FILE, type AnnotationVerdict, readAnnotationVerdicts };

// Upstream's annotations name the engine's value types directly; each is the
// kind `declaredKinds` gives the matching core type, whatever class or alias
// `meta.lua` declares it as.
const BUILTIN_KINDS: ReadonlyMap<string, LuaKind> = new Map<string, LuaKind>([
  ["number", "number"],
  ["integer", "number"],
  ["string", "string"],
  ["boolean", "boolean"],
  ["nil", "nil"],
  ["table", "table"],
  ["function", "function"],
  ["userdata", "userdata"],
  ["hash", "hash"],
  ["url", "url"],
  ["vector", "vector"],
  ["vector3", "vector3"],
  ["vector4", "vector4"],
  ["quaternion", "quat"],
  ["matrix4", "matrix4"],
  ["buffer_data", "buffer"],
]);

export interface AnnotationKinds {
  // `"any"` when a member is `any` or an unconstrained generic: never compared.
  readonly kinds: LuaKind[] | "any";
  // Names neither upstream's annotations nor the builtins define.
  readonly unmapped: string[];
}

interface Resolution {
  readonly kinds: Set<LuaKind>;
  readonly unmapped: string[];
  any: boolean;
}

interface ResolveContext {
  readonly model: AnnotationModel;
  readonly surface: AnnotationSurface;
  readonly generics: readonly AnnotatedGeneric[];
  readonly seen: Set<string>;
}

function resolveType(text: string, ctx: ResolveContext, out: Resolution): void {
  const type = text.trim();
  if (type === "") return;
  const members = splitTopLevel(type, "|")
    .map((member) => member.trim())
    .filter((member) => member !== "");
  if (members.length > 1) {
    for (const member of members) resolveType(member, ctx, out);
    return;
  }
  if (type === "any") {
    out.any = true;
    return;
  }
  if (type.startsWith("(") && matchBracket(type, 0) === type.length - 1) {
    resolveType(type.slice(1, -1), ctx, out);
    return;
  }
  if (type.endsWith("[]") || type.startsWith("{") || /^table\s*</.test(type)) {
    out.kinds.add("table");
    return;
  }
  if (/^fun\s*\(/.test(type)) {
    out.kinds.add("function");
    return;
  }
  if (/^"[^"]*"$/.test(type) || /^'[^']*'$/.test(type)) {
    out.kinds.add("string");
    return;
  }
  if (/^-?\d/.test(type)) {
    out.kinds.add("number");
    return;
  }
  if (type === "true" || type === "false") {
    out.kinds.add("boolean");
    return;
  }
  const builtin = BUILTIN_KINDS.get(type);
  if (builtin) {
    out.kinds.add(builtin);
    return;
  }
  const generic = ctx.generics.find((candidate) => candidate.name === type);
  if (generic) {
    if (generic.constraint.length === 0) out.any = true;
    for (const member of generic.constraint) resolveType(member, ctx, out);
    return;
  }
  if (ctx.seen.has(type)) return;
  ctx.seen.add(type);
  // An enum alias lists its constants as `` `gui.PIVOT_CENTER` ``, each declared
  // as a `---@field` of its namespace's `defold_api.<ns>` class.
  const constant = /^`(.+)\.([A-Za-z_][A-Za-z0-9_]*)`$/.exec(type);
  if (constant) {
    const [, namespace, member] = constant;
    const field = ctx.model.classes
      .get(`${ctx.surface}:defold_api.${namespace}`)
      ?.fields.find((candidate) => candidate.name === member);
    if (field) for (const fieldType of field.types) resolveType(fieldType, ctx, out);
    else out.unmapped.push(type);
    return;
  }
  const key = `${ctx.surface}:${type}`;
  const alias = ctx.model.aliases.get(key);
  if (alias) {
    // A `---|` member may carry a `# description` after its value.
    for (const member of alias.members) resolveType(member.replace(/\s+#.*$/, ""), ctx, out);
    return;
  }
  const enumeration = ctx.model.enums.get(key);
  if (enumeration && enumeration.types.length > 0) {
    for (const member of enumeration.types) resolveType(member, ctx, out);
    return;
  }
  const cls = ctx.model.classes.get(key);
  if (cls) {
    if (cls.parents.length > 0) for (const parent of cls.parents) resolveType(parent, ctx, out);
    else out.kinds.add(cls.fields.length > 0 ? "table" : "userdata");
    return;
  }
  out.unmapped.push(type);
}

// The Lua kinds an annotated union accepts, resolved through upstream's own
// aliases, enums, classes and the enclosing function's generics.
export function annotationKinds(
  model: AnnotationModel,
  surface: AnnotationSurface,
  types: readonly string[],
  generics: readonly AnnotatedGeneric[] = [],
): AnnotationKinds {
  const out: Resolution = { kinds: new Set(), unmapped: [], any: false };
  for (const type of types) {
    resolveType(type, { model, surface, generics, seen: new Set() }, out);
  }
  return { kinds: out.any ? "any" : [...out.kinds].sort(), unmapped: out.unmapped };
}

export type AnnotationRule =
  | "too-loose"
  | "too-narrow"
  | "optional-as-required"
  | "required-as-optional"
  | "arity"
  | "return-count"
  | "missing-annotation"
  | "missing-declaration"
  | "unmapped";

export interface AnnotationMismatch {
  readonly surface: AnnotationSurface;
  readonly name: string;
  readonly rule: AnnotationRule;
  readonly slot?: string;
  // The annotated parameter name at `slot`, or the annotated return name at a
  // `return<n>` slot, which correction tables key by.
  readonly param?: string;
  readonly annotated: string;
  readonly declared: string;
}

export function annotationMismatchKey(mismatch: AnnotationMismatch): string {
  const slot = mismatch.slot === undefined ? "" : `:${mismatch.slot}`;
  return `${mismatch.surface}:${mismatch.name}:${mismatch.rule}${slot}`;
}

interface AnnotatedSlot {
  readonly index: number;
  readonly name: string;
  readonly types: string[];
  // Marked `name?`, a vararg, or absent from some signature.
  omissible: boolean;
  // A `nil` member in some signature's union.
  nilable: boolean;
}

interface AnnotatedReturnSlot {
  readonly index: number;
  readonly name?: string;
  readonly types: string[];
}

interface MergedSignatures {
  readonly minArgs: number;
  readonly maxArgs: number | "variadic";
  readonly slots: AnnotatedSlot[];
  readonly returnCounts: (number | "variadic")[];
  // Kinds unioned per position over the signatures carrying `@return`.
  readonly returnSlots: AnnotatedReturnSlot[];
}

function isVarargReturn(returned: AnnotatedReturn): boolean {
  return returned.name === "..." || returned.types.includes("...");
}

// Overloads merge per slot the way `readDeclaredSurface` merges declared ones:
// kinds union, arity is `[min, max]`, a slot absent from any signature is
// omissible.
function mergeSignatures(fn: AnnotatedFunction): MergedSignatures {
  const slots = new Map<number, AnnotatedSlot>();
  const lengths: { length: number; variadic: boolean }[] = [];
  let minArgs = Number.POSITIVE_INFINITY;
  let maxArgs: number | "variadic" = 0;
  const returnCounts = new Set<number | "variadic">();
  const returnSlots = new Map<number, AnnotatedReturnSlot>();
  for (const signature of [fn, ...fn.overloads]) {
    let required = 0;
    let variadic = false;
    signature.params.forEach((param, i) => {
      const index = i + 1;
      const nilable = param.types.includes("nil");
      const omissible = param.optional || param.vararg;
      if (!omissible && !nilable) required = index;
      if (param.vararg) variadic = true;
      const slot = slots.get(index) ?? {
        index,
        name: param.name,
        types: [],
        omissible: false,
        nilable: false,
      };
      for (const type of param.types) if (!slot.types.includes(type)) slot.types.push(type);
      slot.omissible ||= omissible;
      slot.nilable ||= nilable;
      slots.set(index, slot);
    });
    lengths.push({ length: signature.params.length, variadic });
    minArgs = Math.min(minArgs, required);
    if (variadic) maxArgs = "variadic";
    else if (maxArgs !== "variadic") maxArgs = Math.max(maxArgs, signature.params.length);
    if (signature.returns.length > 0) {
      const vararg = signature.returns.some(isVarargReturn);
      returnCounts.add(vararg ? "variadic" : signature.returns.length);
    }
    signature.returns.forEach((returned, i) => {
      if (isVarargReturn(returned)) return;
      const slot: AnnotatedReturnSlot = returnSlots.get(i + 1) ?? {
        index: i + 1,
        ...(returned.name === undefined ? {} : { name: returned.name }),
        types: [],
      };
      for (const type of returned.types) if (!slot.types.includes(type)) slot.types.push(type);
      returnSlots.set(i + 1, slot);
    });
  }
  for (const slot of slots.values()) {
    if (lengths.some((l) => !l.variadic && l.length < slot.index)) slot.omissible = true;
  }
  return {
    minArgs: Number.isFinite(minArgs) ? minArgs : 0,
    maxArgs,
    slots: [...slots.values()].sort((a, b) => a.index - b.index),
    returnCounts: [...returnCounts],
    returnSlots: [...returnSlots.values()].sort((a, b) => a.index - b.index),
  };
}

function arityText(min: number, max: number | "variadic"): string {
  return `${min}..${max === "variadic" ? "*" : max}`;
}

function kindsText(kinds: DeclaredKinds | readonly LuaKind[]): string {
  return kinds === "any" ? "any" : kinds.join("|");
}

type SlotBase = Pick<AnnotationMismatch, "surface" | "name" | "slot" | "param">;

// An unmapped annotation is reported and never compared; otherwise kinds are
// compared with nil removed from both sides, and never against `any`.
function kindMismatches(
  base: SlotBase,
  resolved: AnnotationKinds,
  target: DeclaredKinds,
): AnnotationMismatch[] {
  if (resolved.unmapped.length > 0) {
    return [
      {
        ...base,
        rule: "unmapped",
        annotated: resolved.unmapped.join("|"),
        declared: kindsText(target),
      },
    ];
  }
  if (resolved.kinds === "any" || target === "any") return [];
  const accepted: readonly LuaKind[] = resolved.kinds.filter((kind) => kind !== "nil");
  const declaredKinds: readonly LuaKind[] = target;
  if (accepted.length === 0 || declaredKinds.length === 0) return [];
  const evidence = { annotated: kindsText(accepted), declared: kindsText(declaredKinds) };
  const out: AnnotationMismatch[] = [];
  if (declaredKinds.some((kind) => !accepted.includes(kind))) {
    out.push({ ...base, rule: "too-loose", ...evidence });
  }
  if (accepted.some((kind) => !declaredKinds.includes(kind))) {
    out.push({ ...base, rule: "too-narrow", ...evidence });
  }
  return out;
}

export function diffAnnotated(
  annotated: AnnotatedFunction | undefined,
  declared: DeclaredFunction | undefined,
  model: AnnotationModel,
  surface: AnnotationSurface = annotated?.surface ?? "runtime",
): AnnotationMismatch[] {
  if (!annotated && !declared) return [];
  if (!annotated) {
    const name = (declared as DeclaredFunction).name;
    return [
      { surface, name, rule: "missing-annotation", annotated: "absent", declared: "declared" },
    ];
  }
  const name = annotated.name;
  if (!declared) {
    return [
      { surface, name, rule: "missing-declaration", annotated: "annotated", declared: "absent" },
    ];
  }
  const out: AnnotationMismatch[] = [];
  const merged = mergeSignatures(annotated);
  if (merged.minArgs !== declared.minArgs || merged.maxArgs !== declared.maxArgs) {
    out.push({
      surface,
      name,
      rule: "arity",
      annotated: arityText(merged.minArgs, merged.maxArgs),
      declared: arityText(declared.minArgs, declared.maxArgs),
    });
  }

  const declaredSlots = new Map(declared.slots.map((slot) => [slot.index, slot]));
  for (const slot of merged.slots) {
    const target = declaredSlots.get(slot.index);
    if (!target) continue;
    const base = { surface, name, slot: String(slot.index), param: slot.name };
    const resolved = annotationKinds(model, surface, slot.types, annotated.generics);
    const nilable = slot.nilable || (resolved.kinds !== "any" && resolved.kinds.includes("nil"));
    out.push(...kindMismatches(base, resolved, target.kinds));
    const optional = slot.omissible || nilable;
    if (optional && !target.optional) {
      out.push({
        ...base,
        rule: "optional-as-required",
        annotated: "optional",
        declared: "required",
      });
    } else if (!optional && target.optional) {
      out.push({
        ...base,
        rule: "required-as-optional",
        annotated: "required",
        declared: "optional",
      });
    }
  }

  if (!declared.returnCounts.includes("variadic") && !merged.returnCounts.includes("variadic")) {
    const outside = merged.returnCounts.filter((count) => !declared.returnCounts.includes(count));
    if (outside.length > 0) {
      out.push({
        surface,
        name,
        rule: "return-count",
        annotated: merged.returnCounts.join("|"),
        declared: declared.returnCounts.join("|"),
      });
    }
    for (const returned of merged.returnSlots) {
      const target = declared.returnSlots[returned.index - 1];
      if (target === undefined) continue;
      const base = {
        surface,
        name,
        slot: `return${returned.index}`,
        ...(returned.name === undefined ? {} : { param: returned.name }),
      };
      const resolved = annotationKinds(model, surface, returned.types, annotated.generics);
      out.push(...kindMismatches(base, resolved, target));
    }
  }
  return out.sort((a, b) => annotationMismatchKey(a).localeCompare(annotationMismatchKey(b)));
}

export function defaultTarget(): ApiTarget {
  const target = loadApiTargets().find((candidate) => candidate.default === true);
  if (!target) throw new Error("api-targets.json: no default target");
  return target;
}

function namespaceOf(fqn: string): string | undefined {
  const dot = fqn.lastIndexOf(".");
  return dot === -1 ? undefined : fqn.slice(0, dot);
}

export interface AnnotationDiff {
  // Keyed `<runtime|editor>:<fqn>:<rule>[:<slot>]`.
  readonly mismatches: Map<string, AnnotationMismatch>;
  // Declared slot types with no Lua kind.
  readonly unmapped: string[];
  readonly model: AnnotationModel;
}

// The default target only: older ref-doc zips ship no annotations. Runtime
// functions are compared within the target's modules; editor functions within
// the namespaces upstream annotates, read from the editor-script surface so the
// editor overlays count.
export function diffAllAnnotated(target: ApiTarget = defaultTarget()): AnnotationDiff {
  const model = loadAnnotations(target);
  const annotatedNamespaces = (surface: AnnotationSurface) =>
    [...model.functions.values()]
      .filter((fn) => fn.surface === surface)
      .map((fn) => namespaceOf(fn.name))
      .filter((namespace): namespace is string => namespace !== undefined);
  const surfaces: [AnnotationSurface, string[], () => ReturnType<typeof surfaceProgram>][] = [
    ["runtime", target.modules.map((module) => module.namespace), () => surfaceProgram(target)],
    ["editor", [...new Set(annotatedNamespaces("editor"))].sort(), editorSurfaceProgram],
  ];
  const mismatches: AnnotationMismatch[] = [];
  const unmapped: string[] = [];
  for (const [surface, namespaces, program] of surfaces) {
    const compared = new Set(namespaces);
    const declared = readDeclaredSurface(program(), namespaces);
    unmapped.push(...declared.unmapped.map((entry) => `${surface}: ${entry}`));
    const names = new Set(declared.functions.keys());
    for (const fn of model.functions.values()) {
      const namespace = namespaceOf(fn.name);
      if (fn.surface === surface && namespace !== undefined && compared.has(namespace)) {
        names.add(fn.name);
      }
    }
    for (const name of names) {
      mismatches.push(
        ...diffAnnotated(
          model.functions.get(`${surface}:${name}`),
          declared.functions.get(name),
          model,
          surface,
        ),
      );
    }
  }
  const entries = mismatches
    .map((m): [string, AnnotationMismatch] => [annotationMismatchKey(m), m])
    .sort(([a], [b]) => a.localeCompare(b));
  return { mismatches: new Map(entries), unmapped, model };
}

export type SlotCorrection =
  | {
      readonly table: "PARAM_TYPE_CORRECTIONS";
      readonly key: string;
      readonly entry: ParamTypeCorrection;
    }
  | {
      readonly table: "RETURN_TYPE_CORRECTIONS";
      readonly key: string;
      readonly entry: ReturnTypeCorrection;
    }
  | { readonly table: "OPTIONAL_SLOT_CORRECTIONS"; readonly key: string; readonly entry: string }
  | {
      readonly table: "REQUIRED_SLOT_CORRECTIONS";
      readonly key: string;
      readonly entry: RequiredSlotCorrection;
    };

export function allSlotCorrections(): SlotCorrection[] {
  return [
    ...[...PARAM_TYPE_CORRECTIONS].map(
      ([key, entry]): SlotCorrection => ({ table: "PARAM_TYPE_CORRECTIONS", key, entry }),
    ),
    ...[...RETURN_TYPE_CORRECTIONS].map(
      ([key, entry]): SlotCorrection => ({ table: "RETURN_TYPE_CORRECTIONS", key, entry }),
    ),
    ...[...OPTIONAL_SLOT_CORRECTIONS].map(
      ([key, entry]): SlotCorrection => ({ table: "OPTIONAL_SLOT_CORRECTIONS", key, entry }),
    ),
    ...[...REQUIRED_SLOT_CORRECTIONS].map(
      ([key, entry]): SlotCorrection => ({ table: "REQUIRED_SLOT_CORRECTIONS", key, entry }),
    ),
  ];
}

export function correctionFunction(correction: SlotCorrection): string {
  const param = correction.key.indexOf(":param:");
  return param === -1 ? correction.key : correction.key.slice(0, param);
}

const TS_KINDS: ReadonlyMap<string, LuaKind> = new Map<string, LuaKind>([
  ["string", "string"],
  ["number", "number"],
  ["boolean", "boolean"],
  ["undefined", "nil"],
  ["Hash", "hash"],
  ["Url", "url"],
  ["Vector", "vector"],
  ["Vector3", "vector3"],
  ["Vector4", "vector4"],
  ["Quaternion", "quat"],
  ["Matrix4", "matrix4"],
]);

// The kinds of a correction's TypeScript text, or `undefined` for any member
// this cannot read; a function type is never read, so no agreement is claimed.
function tsTypeKinds(text: string): LuaKind[] | undefined {
  if (text.includes("=>")) return undefined;
  const kinds = new Set<LuaKind>();
  for (const raw of splitTopLevel(text, "|")) {
    const member = raw.trim();
    const mapped = TS_KINDS.get(member);
    if (mapped) kinds.add(mapped);
    else if (member === 'Opaque<"buffer">') kinds.add("buffer");
    else if (/^Opaque<"[^"]+">$/.test(member)) kinds.add("userdata");
    else if (member.startsWith("{") || member.endsWith("[]")) kinds.add("table");
    else return undefined;
  }
  return [...kinds].sort();
}

function sameKinds(a: readonly LuaKind[], b: readonly LuaKind[]): boolean {
  return a.length === b.length && a.every((kind) => b.includes(kind));
}

function withoutNil(kinds: readonly LuaKind[]): LuaKind[] {
  return kinds.filter((kind) => kind !== "nil");
}

export type CorrectionAgreement = "repeats" | "agrees" | "differs" | "absent";

// Whether upstream's annotation still shows the defect a correction fixes
// (`repeats`), already types the slot the corrected way (`agrees`), or neither.
// A return correction is judged on the overload-merged slot `diffAnnotated`
// reports, so it holds only when it accounts for every signature's kinds.
export function correctionAgreement(
  correction: SlotCorrection,
  annotated: AnnotatedFunction,
  model: AnnotationModel,
): CorrectionAgreement {
  const surface = annotated.surface;
  const resolve = (types: readonly string[]) =>
    annotationKinds(model, surface, types, annotated.generics);
  const merged = mergeSignatures(annotated);

  if (correction.table === "RETURN_TYPE_CORRECTIONS") {
    const { entry } = correction;
    const returned = merged.returnSlots.find((slot) =>
      entry.slot === undefined ? slot.index === 1 : slot.name === entry.slot,
    );
    if (!returned) return "absent";
    const found = resolve(returned.types);
    if (found.kinds === "any" || found.unmapped.length > 0) return "differs";
    const kinds = found.kinds;
    const pins = [entry.upstream, ...(entry.retypedUpstream ?? [])].map((pin) => resolve(pin));
    if (pins.some((pin) => pin.kinds !== "any" && sameKinds(pin.kinds, kinds))) return "repeats";
    const corrected = tsTypeKinds(entry.ts);
    return corrected && sameKinds(corrected, kinds) ? "agrees" : "differs";
  }

  const name = correction.key.slice(correction.key.indexOf(":param:") + ":param:".length);
  const index = [annotated, ...annotated.overloads]
    .map((signature) => signature.params.findIndex((param) => param.name === name))
    .find((found) => found !== -1);
  const slot = index === undefined ? undefined : merged.slots[index];
  if (!slot) return "absent";
  const found = resolve(slot.types);
  const nilable = slot.nilable || (found.kinds !== "any" && found.kinds.includes("nil"));

  switch (correction.table) {
    case "OPTIONAL_SLOT_CORRECTIONS":
      return slot.omissible || nilable ? "agrees" : "repeats";
    case "REQUIRED_SLOT_CORRECTIONS":
      if (slot.omissible) return "repeats";
      return correction.entry.nil || !nilable ? "agrees" : "differs";
    case "PARAM_TYPE_CORRECTIONS": {
      if (found.kinds === "any" || found.unmapped.length > 0) return "differs";
      const kinds = withoutNil(found.kinds);
      const { entry } = correction;
      const pins = [entry.upstream, ...(entry.retypedUpstream ?? [])].map((pin) => resolve(pin));
      if (pins.some((pin) => pin.kinds !== "any" && sameKinds(withoutNil(pin.kinds), kinds))) {
        return "repeats";
      }
      const adds = entry.adds === undefined ? [] : tsTypeKinds(entry.adds);
      const removes = (entry.removes ?? []).map(tsTypeKinds);
      if (!adds || removes.some((removed) => removed === undefined)) return "differs";
      const addsKinds = withoutNil(adds);
      const removed = removes.flatMap((r) => r ?? []);
      return addsKinds.every((kind) => kinds.includes(kind)) &&
        !removed.some((kind) => kinds.includes(kind))
        ? "agrees"
        : "differs";
    }
  }
}

const RULE_CORRECTION_TABLES: Partial<Record<AnnotationRule, SlotCorrection["table"]>> = {
  "too-loose": "PARAM_TYPE_CORRECTIONS",
  "too-narrow": "PARAM_TYPE_CORRECTIONS",
  "required-as-optional": "OPTIONAL_SLOT_CORRECTIONS",
  "optional-as-required": "REQUIRED_SLOT_CORRECTIONS",
};

function paramCorrection(
  mismatch: AnnotationMismatch,
  corrections: readonly SlotCorrection[],
): SlotCorrection | undefined {
  const table = RULE_CORRECTION_TABLES[mismatch.rule];
  if (!table || mismatch.param === undefined) return undefined;
  const key = `${mismatch.name}:param:${mismatch.param}`;
  return corrections.find((c) => c.table === table && c.key === key);
}

// A return correction names its multi-return value by `slot`; without one it
// rewrites the single, first return.
function returnCorrection(
  mismatch: AnnotationMismatch,
  corrections: readonly SlotCorrection[],
): SlotCorrection | undefined {
  if (mismatch.rule !== "too-loose" && mismatch.rule !== "too-narrow") return undefined;
  const correction = corrections.find(
    (c) => c.table === "RETURN_TYPE_CORRECTIONS" && c.key === mismatch.name,
  );
  if (correction?.table !== "RETURN_TYPE_CORRECTIONS") return undefined;
  const slot = correction.entry.slot;
  const matches = slot === undefined ? mismatch.slot === "return1" : slot === mismatch.param;
  return matches ? correction : undefined;
}

// The correction that already fixes the slot a mismatch reports, when upstream's
// annotation repeats the defect it corrects.
function seedCorrection(
  mismatch: AnnotationMismatch,
  model: AnnotationModel,
  corrections: readonly SlotCorrection[],
): SlotCorrection | undefined {
  const annotated = model.functions.get(`${mismatch.surface}:${mismatch.name}`);
  if (!annotated) return undefined;
  const correction = mismatch.slot?.startsWith("return")
    ? returnCorrection(mismatch, corrections)
    : paramCorrection(mismatch, corrections);
  if (!correction) return undefined;
  return correctionAgreement(correction, annotated, model) === "repeats" ? correction : undefined;
}

export function correctionId(correction: SlotCorrection): string {
  return `${correction.table}:${correction.key}`;
}

function sameEvidence(verdict: AnnotationVerdict, mismatch: AnnotationMismatch): boolean {
  return verdict.annotated === mismatch.annotated && verdict.declared === mismatch.declared;
}

// Every verdict holds only while the mismatch it was triaged against reports the
// same evidence, and a corrected one only while its correction is the one seeding
// would pick: live, mapped to this rule and slot, and still repeated upstream.
export function annotationVerdictProblems(
  mismatches: ReadonlyMap<string, AnnotationMismatch>,
  verdicts: Readonly<Record<string, AnnotationVerdict>>,
  model: AnnotationModel,
): string[] {
  const corrections = allSlotCorrections();
  const live = new Set(corrections.map(correctionId));
  const problems: string[] = [];
  for (const [key, m] of mismatches) {
    if (!(key in verdicts)) {
      problems.push(
        `${key} (annotated ${m.annotated}, declared ${m.declared}): record a verdict in packages/types/scripts/lua-annotation-verdicts.json`,
      );
    }
  }
  for (const [key, v] of Object.entries(verdicts)) {
    const m = mismatches.get(key);
    if (!m) {
      problems.push(`${key}: the mismatch is gone; delete the verdict`);
      continue;
    }
    if (v.verdict === "accepted" && !(v.reason ?? "").trim()) {
      problems.push(`${key}: accepted with no reason; name one`);
    }
    if (!sameEvidence(v, m)) {
      problems.push(
        `${key}: recorded ${v.annotated} / ${v.declared}, now ${m.annotated} / ${m.declared}; re-triage`,
      );
    }
    if (v.verdict !== "corrected") continue;
    if (!live.has(v.correction ?? "")) {
      problems.push(`${key}: ${v.correction} names no live correction`);
      continue;
    }
    const seeded = seedCorrection(m, model, corrections);
    if (!seeded || correctionId(seeded) !== v.correction) {
      problems.push(
        `${key}: ${v.correction} no longer fixes this mismatch (seeding picks ${seeded ? correctionId(seeded) : "none"}); re-triage`,
      );
    }
  }
  return problems;
}

export interface SeededVerdicts {
  readonly verdicts: Record<string, AnnotationVerdict>;
  // Accepted or corrected verdicts reseeded because their evidence or correction
  // no longer holds.
  readonly retriage: string[];
}

// Keeps an accepted verdict while its evidence is unchanged and a corrected one
// while its correction is also still the one seeding picks; reseeds every other
// mismatch as corrected when a correction already fixes its slot and as open
// otherwise, and drops verdicts whose mismatch is gone.
export function seedAnnotationVerdicts(
  mismatches: ReadonlyMap<string, AnnotationMismatch>,
  prior: Readonly<Record<string, AnnotationVerdict>>,
  model: AnnotationModel,
  corrections: readonly SlotCorrection[] = allSlotCorrections(),
): SeededVerdicts {
  const verdicts: Record<string, AnnotationVerdict> = {};
  const retriage: string[] = [];
  for (const [key, m] of mismatches) {
    const kept = prior[key];
    const evidence = { annotated: m.annotated, declared: m.declared };
    const correction = seedCorrection(m, model, corrections);
    const seededId = correction ? correctionId(correction) : undefined;
    if (kept && kept.verdict !== "open") {
      const holds =
        sameEvidence(kept, m) && (kept.verdict === "accepted" || kept.correction === seededId);
      if (holds) {
        verdicts[key] = kept;
        continue;
      }
      retriage.push(key);
    }
    verdicts[key] = seededId
      ? { verdict: "corrected", correction: seededId, ...evidence }
      : { verdict: "open", ...evidence };
  }
  return { verdicts, retriage };
}

// Corrections whose slot upstream's annotation already types the corrected way:
// the ref-doc JSON the declarations derive from is the stale side.
export function agreeingCorrections(model: AnnotationModel): SlotCorrection[] {
  return allSlotCorrections().filter((correction) => {
    const fqn = correctionFunction(correction);
    const annotated = model.functions.get(`runtime:${fqn}`) ?? model.functions.get(`editor:${fqn}`);
    return (
      annotated !== undefined && correctionAgreement(correction, annotated, model) === "agrees"
    );
  });
}

if (import.meta.main) {
  const { mismatches, unmapped, model } = diffAllAnnotated();
  if (unmapped.length > 0) {
    console.error(`unmapped declared types:\n${unmapped.join("\n")}`);
    process.exit(1);
  }
  if (process.argv.includes("--corrections")) {
    for (const correction of agreeingCorrections(model)) {
      console.log(`${correction.table}:${correction.key}`);
    }
  } else if (process.argv.includes("--write")) {
    let prior: Record<string, AnnotationVerdict> = {};
    try {
      prior = readAnnotationVerdicts();
    } catch {
      prior = {};
    }
    const { verdicts: next, retriage } = seedAnnotationVerdicts(mismatches, prior, model);
    const formatted = Bun.spawnSync(
      ["bunx", "biome", "format", "--stdin-file-path=lua-annotation-verdicts.json"],
      { stdin: Buffer.from(JSON.stringify(next)) },
    );
    if (formatted.exitCode !== 0) throw new Error(formatted.stderr.toString());
    await Bun.write(ANNOTATION_VERDICTS_FILE, formatted.stdout.toString());
    console.log(`wrote ${Object.keys(next).length} verdicts to ${ANNOTATION_VERDICTS_FILE}`);
    if (retriage.length > 0) {
      console.error(`re-triage these reseeded verdicts:\n${retriage.join("\n")}`);
    }
  } else {
    for (const [key, m] of mismatches) console.log(`${key}\t${m.annotated}\t${m.declared}`);
  }
}
