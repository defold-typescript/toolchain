import {
  PROPERTY_KEY_RANGES,
  type PropertyKeyRange,
  STRUCT_MEMBER_ADDITIONS,
  type StructMemberAddition,
} from "../src/emit-dts";
import {
  type BindingPin,
  type CorrectionPins,
  type EngineSourcePin,
  pinEvidenceKey,
} from "../src/engine-pin";
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
import { ENGINE_PINNED_TABLES, type EnginePinnedTable } from "./engine-pinned-tables";
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

function definedPinHolds(targetId: string, pin: BindingPin): boolean {
  return (
    bindingVendorsFile(targetId, pin.file) &&
    bindingDefinesFunction(targetId, pin.file, pin.cFunction) &&
    bindingPinHolds(targetId, pin)
  );
}

// Whether an entry's engine pins hold on the target: its `binding` pin, and
// every one of its `engine` pins. An entry with neither has no engine evidence.
function enginePinsHold(targetId: string, { binding, engine }: CorrectionPins): boolean {
  if (binding === undefined && engine === undefined) return false;
  return (
    (binding === undefined || definedPinHolds(targetId, binding)) &&
    (engine === undefined || engine.every((pin) => enginePinHolds(targetId, pin)))
  );
}

// The ledger lines (`pinEvidenceKey`) of the engine-pinned corrections whose
// pins hold in the target's vendored engine source; empty for a target with
// none (a ref-doc target). Each line names its table, so a key two tables share
// is evidence only for the table whose pin holds. A correction whose `binding`
// file the target does not vendor, or whose function it does not define, has no
// evidence there: a release older than the module or the function declares no
// slot for it to correct. A struct member addition whose function the target
// does not define has none either: a release older than the function has
// neither the struct nor the push. A key range with an `engine` field is
// evidence where every one of its pins holds.
export function bindingEvidenceFor(
  target: ApiTarget,
  tables: readonly EnginePinnedTable[] = ENGINE_PINNED_TABLES,
  additions: Iterable<readonly [string, StructMemberAddition]> = STRUCT_MEMBER_ADDITIONS,
  ranges: Iterable<readonly [string, PropertyKeyRange]> = PROPERTY_KEY_RANGES,
): ReadonlySet<string> {
  const evidence = new Set<string>();
  if ((target.source ?? null) !== null) return evidence;
  for (const { name, entries } of tables) {
    for (const [key, entry] of entries) {
      if (enginePinsHold(target.id, entry)) evidence.add(pinEvidenceKey(name, key));
    }
  }
  for (const [key, { binding }] of additions) {
    if (
      bindingDefinesFunction(target.id, binding.file, binding.cFunction) &&
      bindingPinHolds(target.id, binding)
    ) {
      evidence.add(pinEvidenceKey("STRUCT_MEMBER_ADDITIONS", key));
    }
  }
  for (const [key, { engine }] of ranges) {
    if (engine?.pins.every((pin) => enginePinHolds(target.id, pin))) {
      evidence.add(pinEvidenceKey("PROPERTY_KEY_RANGES", key));
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
  tables?: readonly EnginePinnedTable[],
  additions?: Iterable<readonly [string, StructMemberAddition]>,
  ranges?: Iterable<readonly [string, PropertyKeyRange]>,
): TargetBindingOptions {
  const registeredConstants = registeredConstantFqns(target);
  const vendored = (target.source ?? null) === null;
  return {
    ...(registeredConstants ? { registeredConstants } : {}),
    bindingEvidence: bindingEvidenceFor(target, tables, additions, ranges),
    ...(vendored ? { nilRaisingSlots: targetNilRaisingSlots(target.id) } : {}),
  };
}
