import {
  type BindingPin,
  type EngineSourcePin,
  PARAM_TYPE_CORRECTIONS,
  type ParamTypeCorrection,
  PROPERTY_KEY_RANGES,
  type PropertyKeyRange,
  RETURN_TYPE_CORRECTIONS,
  type ReturnTypeCorrection,
  STRUCT_MEMBER_ADDITIONS,
  type StructMemberAddition,
  TABLE_FIELD_TYPE_OVERRIDES,
  type TableFieldTypeOverride,
} from "../src/emit-dts";
import {
  type BindingFunction,
  bindingDefinesFunction,
  bindingFunctionTokens,
  bindingVendorsFile,
  cTokenKeys,
  evidenceFileTokens,
  evidenceFunctionTokens,
  mergeBindings,
  readBindingsForTarget,
  registeredConstantFqns,
} from "./engine-binding-extract";
import type { ApiTarget, TargetBindingOptions } from "./regen";

function containsRun(body: readonly string[], run: readonly string[]): boolean {
  outer: for (let start = 0; start + run.length <= body.length; start++) {
    for (let i = 0; i < run.length; i++) {
      if (body[start + i] !== run[i]) continue outer;
    }
    return true;
  }
  return false;
}

function snippet(label: string, text: string): string[] {
  const tokens = cTokenKeys(text);
  if (tokens.length === 0) throw new Error(`${label}: snippet has no tokens`);
  return tokens;
}

// Whether the pinned function's body, in `targetId`'s vendored engine source,
// contains `contains` and lacks `lacks`, compared token by token after comment
// stripping. A file or function the target does not vendor throws.
export function bindingPinHolds(targetId: string, pin: BindingPin): boolean {
  if (pin.contains === undefined && pin.lacks === undefined) {
    throw new Error(`binding pin ${pin.file}:${pin.cFunction}: names neither contains nor lacks`);
  }
  const body = bindingFunctionTokens(targetId, pin.file, pin.cFunction);
  const label = `binding pin ${pin.file}:${pin.cFunction}`;
  return (
    (pin.contains === undefined || containsRun(body, snippet(label, pin.contains))) &&
    (pin.lacks === undefined || !containsRun(body, snippet(label, pin.lacks)))
  );
}

// Whether `targetId`'s vendored engine evidence contains the pin's snippet: in
// the named function's body, or anywhere in the file without one. A file or
// function the target does not vendor throws.
export function enginePinHolds(targetId: string, pin: EngineSourcePin): boolean {
  const where = pin.cFunction === undefined ? pin.file : `${pin.file}:${pin.cFunction}`;
  const tokens =
    pin.cFunction === undefined
      ? evidenceFileTokens(targetId, pin.file)
      : evidenceFunctionTokens(targetId, pin.file, pin.cFunction);
  return containsRun(tokens, snippet(`engine pin ${where}`, pin.contains));
}

// The binding-pinned correction keys whose pin holds in the target's vendored
// engine source; empty for a target with none (a ref-doc target). A struct
// member addition whose function the target does not define has no evidence
// there: a release older than the function has neither the struct nor the push.
// Likewise a correction whose file the target does not vendor: a release older
// than the module declares no slot for it to correct. A key range with an
// `engine` field is evidence where every one of its pins holds.
export function bindingEvidenceFor(
  target: ApiTarget,
  entries: Iterable<readonly [string, ReturnTypeCorrection]> = RETURN_TYPE_CORRECTIONS,
  additions: Iterable<readonly [string, StructMemberAddition]> = STRUCT_MEMBER_ADDITIONS,
  ranges: Iterable<readonly [string, PropertyKeyRange]> = PROPERTY_KEY_RANGES,
  parameters: Iterable<readonly [string, ParamTypeCorrection]> = PARAM_TYPE_CORRECTIONS,
  fields: Iterable<readonly [string, TableFieldTypeOverride]> = TABLE_FIELD_TYPE_OVERRIDES,
): ReadonlySet<string> {
  const evidence = new Set<string>();
  if ((target.source ?? null) !== null) return evidence;
  for (const [key, { binding }] of entries) {
    if (
      binding !== undefined &&
      bindingVendorsFile(target.id, binding.file) &&
      bindingPinHolds(target.id, binding)
    ) {
      evidence.add(key);
    }
  }
  for (const [key, { binding }] of parameters) {
    if (
      binding !== undefined &&
      bindingVendorsFile(target.id, binding.file) &&
      bindingPinHolds(target.id, binding)
    ) {
      evidence.add(key);
    }
  }
  for (const [key, { binding }] of fields) {
    if (
      binding !== undefined &&
      bindingVendorsFile(target.id, binding.file) &&
      bindingPinHolds(target.id, binding)
    ) {
      evidence.add(key);
    }
  }
  for (const [key, { binding }] of additions) {
    if (
      bindingDefinesFunction(target.id, binding.file, binding.cFunction) &&
      bindingPinHolds(target.id, binding)
    ) {
      evidence.add(key);
    }
  }
  for (const [key, { engine }] of ranges) {
    if (engine?.pins.every((pin) => enginePinHolds(target.id, pin))) {
      evidence.add(key);
    }
  }
  return evidence;
}

// The 1-based slots, keyed `<namespace>.<name>`, that a function may omit but
// raises on when passed an explicit nil. A name bound more than once is listed
// only where every binding raises, since one declaration serves them all.
export function nilRaisingSlotsOf(
  functions: readonly BindingFunction[],
): ReadonlyMap<string, readonly number[]> {
  const slots = new Map<string, readonly number[]>();
  for (const fn of mergeBindings(functions)) {
    const raising = fn.slots
      .filter((slot) => slot.nilRaises)
      .map((slot) => slot.index)
      .sort((a, b) => a - b);
    if (raising.length > 0) slots.set(`${fn.namespace}.${fn.name}`, raising);
  }
  return slots;
}

const nilRaisingSlotCache = new Map<string, ReadonlyMap<string, readonly number[]>>();

function targetNilRaisingSlots(targetId: string): ReadonlyMap<string, readonly number[]> {
  let slots = nilRaisingSlotCache.get(targetId);
  if (!slots) {
    slots = nilRaisingSlotsOf(readBindingsForTarget(targetId).functions);
    nilRaisingSlotCache.set(targetId, slots);
  }
  return slots;
}

// What a target's own engine source decides for its emit: the constants it
// registers, the binding-pinned corrections whose pin holds there, and the
// slots its bindings raise on when passed nil.
// Every in-repo emit compared against a committed surface takes these, so a
// fresh emit and `regen` can never disagree on any of them.
export function targetBindingOptions(
  target: ApiTarget,
  corrections?: Iterable<readonly [string, ReturnTypeCorrection]>,
  additions?: Iterable<readonly [string, StructMemberAddition]>,
  ranges?: Iterable<readonly [string, PropertyKeyRange]>,
  parameters?: Iterable<readonly [string, ParamTypeCorrection]>,
  fields?: Iterable<readonly [string, TableFieldTypeOverride]>,
): TargetBindingOptions {
  const registeredConstants = registeredConstantFqns(target);
  const vendored = (target.source ?? null) === null;
  return {
    ...(registeredConstants ? { registeredConstants } : {}),
    bindingEvidence: bindingEvidenceFor(target, corrections, additions, ranges, parameters, fields),
    ...(vendored ? { nilRaisingSlots: targetNilRaisingSlots(target.id) } : {}),
  };
}
