import { describe, expect, test } from "bun:test";
import { readVerdicts } from "../scripts/engine-binding-verdicts";
import { NIL_CONSTANTS } from "./emit-dts";

const MISSING_BINDING = /^[^:]+:(.+):constant-missing-binding$/;

// `engine-binding-diff.test.ts` reds a `constant-missing-binding` verdict the
// engine no longer produces, so the accepted set tracks the constants the
// vendored bindings never register.
function acceptedMissingBindings(): string[] {
  const fqns = new Set<string>();
  for (const [key, verdict] of Object.entries(readVerdicts())) {
    const fqn = MISSING_BINDING.exec(key)?.[1];
    if (fqn !== undefined && verdict.verdict === "accepted") fqns.add(fqn);
  }
  return [...fqns].sort();
}

describe("NIL_CONSTANTS provenance", () => {
  test("every accepted unregistered constant is declared nil, and nothing else is", () => {
    expect([...NIL_CONSTANTS.keys()].sort()).toEqual(acceptedMissingBindings());
  });
});
