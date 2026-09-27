import { describe, expect, test } from "bun:test";
import { parseProbeLine } from "./outcome";

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
