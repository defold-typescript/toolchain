import { describe, expect, test } from "bun:test";
import { classifyError, parseProbeLine, parseProbeLog } from "./outcome";

describe("parseProbeLine", () => {
  test("files luaL_argerror's message as a bad argument at its slot", () => {
    expect(
      parseProbeLine(
        "DEBUG:SCRIPT: PROBE\tsprite.play_flipbook\trequired\terr\tbad argument #2 to 'play_flipbook' (hash expected, got table)",
      ),
    ).toEqual({
      name: "sprite.play_flipbook",
      variant: "required",
      outcome: "bad-argument",
      slot: 2,
      message: "bad argument #2 to 'play_flipbook' (hash expected, got table)",
    });
  });

  test("files Defold's table-field type error as a bad argument", () => {
    expect(
      parseProbeLine(
        "PROBE\tresource.set_texture\trequired\terr\tWrong type for table attribute 'type'. Expected integer, got nil",
      )?.outcome,
    ).toBe("bad-argument");
  });

  test("files any other raised error as an engine error", () => {
    expect(
      parseProbeLine(
        "DEBUG:SCRIPT: PROBE\tgo.get_position\trequired\terr\tCould not find any instance with id '/x'.",
      ),
    ).toEqual({
      name: "go.get_position",
      variant: "required",
      outcome: "engine-error",
      message: "Could not find any instance with id '/x'.",
    });
  });

  test("keeps a tab inside the message", () => {
    const parsed = parseProbeLine("PROBE\tjson.decode\trequired\terr\tunexpected\ttoken at 1");
    expect(parsed?.message).toBe("unexpected\ttoken at 1");
    expect(parsed?.outcome).toBe("engine-error");
  });

  test("reads an ok line and ignores lines that are not probe output", () => {
    expect(parseProbeLine("DEBUG:SCRIPT: PROBE\tvmath.vector3\trequired\tok\t")).toEqual({
      name: "vmath.vector3",
      variant: "required",
      outcome: "ok",
      message: "",
    });
    expect(parseProbeLine("INFO:ENGINE: Defold Engine 1.13.1 (574678c)")).toBeUndefined();
    expect(parseProbeLine("PROBE_DONE")).toBeUndefined();
  });
});

describe("parseProbeLog", () => {
  test("attaches each ok call's RET lines, in order, to its outcome", () => {
    const outcomes = parseProbeLog([
      "DEBUG:SCRIPT: RET\tgo.get_position\trequired\t1\tvector3",
      "DEBUG:SCRIPT: PROBE\tgo.get_position\trequired\tok\t",
      "DEBUG:SCRIPT: PROBE\tmsg.post\trequired\tok\t",
      "DEBUG:SCRIPT: RET\tbuffer.get_metadata\trequired\t2\tnil",
      "DEBUG:SCRIPT: RET\tbuffer.get_metadata\trequired\t1\ttable",
      "DEBUG:SCRIPT: PROBE\tbuffer.get_metadata\trequired\tok\t",
    ]);
    expect(outcomes.map((o) => [o.name, o.returns])).toEqual([
      ["go.get_position", ["vector3"]],
      ["msg.post", []],
      ["buffer.get_metadata", ["table", "nil"]],
    ]);
  });

  test("a raised call carries no returns", () => {
    const [outcome] = parseProbeLog(["PROBE\tgo.get\trequired\terr\tbad argument #1"]);
    expect(outcome?.returns).toBeUndefined();
  });
});

describe("classifyError", () => {
  test.each([
    ["Expected user type b2body", undefined],
    ["Argument 2 must be a boolean", 2],
    ["Argument #2 is expected to be completion function.", 2],
    ["expected table at argument #4 to collectionfactory.create", 4],
    ["go.delete expected boolean as argument #2", 2],
    ["Invalid argument #2 type. Should be table or nil", 2],
    ["buffer.create: Second argument must be a table", 2],
    ["Expected boolean as first argument", 1],
    ["Invalid parameter, expected a boolean but got a table", undefined],
    ["Expected booleans but got table, boolean, boolean, no value.", undefined],
    ["easing must be either a easing constant or a vmath.vector", undefined],
  ])("files Defold's type error %p as a bad argument", (message, slot) => {
    expect(classifyError(message)).toEqual({
      outcome: "bad-argument",
      ...(slot === undefined ? {} : { slot }),
    });
  });

  test.each([
    "Cannot set prototype while factory is loading",
    "Invalid render target.",
    "main/probe_go.ts.script:12: attempt to index global 'compute' (a nil value)",
    "the bone '(null)' could not be found",
  ])("files %p as an engine error", (message) => {
    expect(classifyError(message)).toEqual({ outcome: "engine-error" });
  });
});
