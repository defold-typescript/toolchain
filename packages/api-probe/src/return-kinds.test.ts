import { describe, expect, test } from "bun:test";
import { returnMismatches } from "./return-kinds";
import { type DeclaredReturns, generateProbes } from "./witness";

const v2 = generateProbes(undefined, "v2");

function declared(name: string): DeclaredReturns {
  const call = v2.calls.find((c) => c.name === name && c.negative === undefined);
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
    expect(returnMismatches(declared("go.get_parent"), [])).toEqual([]);
    expect(returnMismatches(declared("go.get_position"), [])).toEqual([
      "value 1 is nil, declared vector3",
    ]);
  });

  test("the count must match the declared multi-return width", () => {
    expect(returnMismatches(declared("buffer.get_metadata"), ["table", "number"])).toEqual([]);
    expect(returnMismatches(declared("msg.post"), ["number"])).toEqual([
      "value 1 is number, beyond the 0 declared",
    ]);
    expect(returnMismatches(declared("vmath.vector3"), ["vector3", "nil"])).toEqual([]);
  });

  test("a Defold buffer reports as userdata", () => {
    expect(returnMismatches(declared("buffer.create"), ["userdata"])).toEqual([]);
  });

  test("an opaque handle is userdata or the number the engine hands out, never a hash", () => {
    expect(returnMismatches(declared("render.render_target"), ["number"])).toEqual([]);
    expect(returnMismatches(declared("render.render_target"), ["hash"])).toEqual([
      "value 1 is hash, declared userdata",
    ]);
  });
});
