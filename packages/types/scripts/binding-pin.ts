import {
  type BindingPin,
  RETURN_TYPE_CORRECTIONS,
  type ReturnTypeCorrection,
  STRUCT_MEMBER_ADDITIONS,
  type StructMemberAddition,
} from "../src/emit-dts";
import {
  type BindingFunction,
  bindingDefinesFunction,
  bindingFunctionTokens,
  bindingVendorsFile,
  cTokenKeys,
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

function snippet(pin: BindingPin, text: string): string[] {
  const tokens = cTokenKeys(text);
  if (tokens.length === 0) {
    throw new Error(`binding pin ${pin.file}:${pin.cFunction}: snippet has no tokens`);
  }
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
  return (
    (pin.contains === undefined || containsRun(body, snippet(pin, pin.contains))) &&
    (pin.lacks === undefined || !containsRun(body, snippet(pin, pin.lacks)))
  );
}

// The binding-pinned correction keys whose pin holds in the target's vendored
// engine source; empty for a target with none (a ref-doc target). A struct
// member addition whose function the target does not define has no evidence
// there: a release older than the function has neither the struct nor the push.
// Likewise a return correction whose file the target does not vendor: a release
// older than the module declares no function for it to correct.
export function bindingEvidenceFor(
  target: ApiTarget,
  entries: Iterable<readonly [string, ReturnTypeCorrection]> = RETURN_TYPE_CORRECTIONS,
  additions: Iterable<readonly [string, StructMemberAddition]> = STRUCT_MEMBER_ADDITIONS,
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
  for (const [key, { binding }] of additions) {
    if (
      bindingDefinesFunction(target.id, binding.file, binding.cFunction) &&
      bindingPinHolds(target.id, binding)
    ) {
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
): TargetBindingOptions {
  const registeredConstants = registeredConstantFqns(target);
  const vendored = (target.source ?? null) === null;
  return {
    ...(registeredConstants ? { registeredConstants } : {}),
    bindingEvidence: bindingEvidenceFor(target, corrections, additions),
    ...(vendored ? { nilRaisingSlots: targetNilRaisingSlots(target.id) } : {}),
  };
}
