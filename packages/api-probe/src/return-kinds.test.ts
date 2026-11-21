import { describe, expect, test } from "bun:test";
import { type Exemption, evaluateProbe } from "./exemptions";
import { returnMismatches } from "./return-kinds";
import { type DeclaredReturns, generateProbes, type ProbeCall } from "./witness";

const v2 = generateProbes(undefined, "v2");

function optionForm(name: string, variant: string): ProbeCall {
  const call = v2.calls.find((c) => c.name === name && c.variant === variant);
  if (call === undefined) throw new Error(`no ${variant} call to ${name}`);
  return call;
}

function evaluateReturns(
  call: ProbeCall,
  returns: readonly string[],
  exemptions: Record<string, Exemption> = {},
) {
  return evaluateProbe(
    [
      {
        backend: "v2",
        calls: [call],
        outcomes: [{ name: call.name, variant: call.variant, outcome: "ok", message: "", returns }],
      },
    ],
    exemptions,
  );
}

function declared(name: string): DeclaredReturns {
  const call = v2.calls.find((c) => c.name === name && c.witness === undefined);
  if (call?.returns === undefined) throw new Error(`no positive call to ${name}`);
  return call.returns;
}

describe("returnMismatches", () => {
  test("a value of the declared kind passes and any other kind is named", () => {
    expect(returnMismatches(declared("vmath.vector3"), ["vector3"])).toEqual([]);
    expect(returnMismatches(declared("go.get_id"), ["number"])).toEqual([
      "value 1 is number, declared hash",
    ]);
  });

  test("nil passes only where the declaration is nullable", () => {
    expect(returnMismatches(declared("go.get_parent"), ["nil"])).toEqual([]);
    expect(returnMismatches(declared("go.get_position"), ["nil"])).toEqual([
      "value 1 is nil, declared vector3",
    ]);
  });

  test("the count must match the declared multi-return width", () => {
    expect(returnMismatches(declared("buffer.get_metadata"), ["table", "number"])).toEqual([]);
    expect(returnMismatches(declared("msg.post"), ["number"])).toEqual([
      "value 1 is number, beyond the 0 declared",
    ]);
  });

  test("a non-variadic return matches its declared width exactly", () => {
    expect(returnMismatches(declared("vmath.vector3"), ["vector3", "nil"])).toEqual([
      "value 2 is nil, beyond the 1 declared",
    ]);
    const parent = declared("go.get_parent");
    expect(returnMismatches(parent, [])).toEqual([
      `value 1 is absent, declared ${(parent.kinds[0] as string[]).join("|")}`,
    ]);
    expect(returnMismatches(declared("go.get_position"), [])).toEqual([
      "value 1 is absent, declared vector3",
    ]);
    expect(returnMismatches(declared("buffer.get_metadata"), ["table"])).toEqual([
      "value 2 is absent, declared nil|number",
    ]);
  });

  test("a variadic return takes values past its fixed positions, never fewer", () => {
    const variadic: DeclaredReturns = { kinds: [["number"], ["hash", "nil"]], variadic: true };
    expect(returnMismatches(variadic, ["number", "nil", "string", "nil"])).toEqual([]);
    expect(returnMismatches(variadic, ["number"])).toEqual([
      "value 2 is absent, declared hash|nil",
    ]);
  });
});

describe("option-form returns under the probe gate", () => {
  const empty = optionForm("physics.raycast", "options-empty");
  const key = "physics.raycast:options-empty";
  const accepted: Exemption = { outcome: "ok", verdict: "accepted", reason: "test" };

  test("an option form returning a kind its resolved overload does not declare fails", () => {
    expect(evaluateReturns(empty, ["table"]).returnKinds).toEqual([]);
    expect(evaluateReturns(empty, ["nil"]).returnKinds).toEqual([]);
    expect(evaluateReturns(empty, ["number"]).returnKinds).toEqual([
      `${key}: value 1 is number, declared nil|table`,
    ]);
  });

  test("a mismatch an accepted verdict records is not reported, and an open one is", () => {
    const cleared = evaluateReturns(empty, ["number"], { [key]: accepted });
    expect(cleared.returnKinds).toEqual([]);
    expect(cleared.stale).toEqual([]);
    const open = evaluateReturns(empty, ["number"], { [key]: { ...accepted, verdict: "open" } });
    expect(open.openFindings).toEqual([`${key}: test`]);
    expect(open.returnKinds).toEqual([`${key}: value 1 is number, declared nil|table`]);
  });

  test("a verdict whose mismatch is gone is stale", () => {
    expect(evaluateReturns(empty, ["table"], { [key]: accepted }).stale).toEqual([
      `${key}: now ends ok; delete the exemption`,
    ]);
  });
});
