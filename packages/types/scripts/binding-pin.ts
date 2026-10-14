import {
  type BindingPin,
  RETURN_TYPE_CORRECTIONS,
  type ReturnTypeCorrection,
  STRUCT_MEMBER_ADDITIONS,
  type StructMemberAddition,
} from "../src/emit-dts";
import {
  bindingDefinesFunction,
  bindingFunctionTokens,
  cTokenKeys,
  registeredConstantFqns,
} from "./engine-binding-extract";
import type { ApiTarget, GenerateOptions } from "./regen";

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
export function bindingEvidenceFor(
  target: ApiTarget,
  entries: Iterable<readonly [string, ReturnTypeCorrection]> = RETURN_TYPE_CORRECTIONS,
  additions: Iterable<readonly [string, StructMemberAddition]> = STRUCT_MEMBER_ADDITIONS,
): ReadonlySet<string> {
  const evidence = new Set<string>();
  if ((target.source ?? null) !== null) return evidence;
  for (const [key, correction] of entries) {
    if (correction.binding !== undefined && bindingPinHolds(target.id, correction.binding)) {
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

// What a target's own engine source decides for its emit: the constants it
// registers and the binding-pinned corrections whose pin holds there.
// Every in-repo emit compared against a committed surface takes these, so a
// fresh emit and `regen` can never disagree on either input.
export function targetBindingOptions(
  target: ApiTarget,
  corrections?: Iterable<readonly [string, ReturnTypeCorrection]>,
  additions?: Iterable<readonly [string, StructMemberAddition]>,
): Pick<GenerateOptions, "registeredConstants" | "bindingEvidence"> {
  const registeredConstants = registeredConstantFqns(target);
  return {
    ...(registeredConstants ? { registeredConstants } : {}),
    bindingEvidence: bindingEvidenceFor(target, corrections, additions),
  };
}
