import { describe, expect, test } from "bun:test";
import { matchTrace, traceFences } from "./guide-traces";

const FENCE = "```";

describe("traceFences", () => {
  test("reads a trace fence with its heading, page line, shown lines and steps", () => {
    const page = [
      "# Tutorial",
      "",
      "## 3. A lesson",
      "",
      `${FENCE}text trace run="frames 2; press clap; touch firefly 3; move firefly 1"`,
      "ecs garden frame 0: inspecting []",
      "...",
      "firefly 3: you can catch it",
      FENCE,
    ].join("\n");
    expect(traceFences(page)).toEqual([
      {
        heading: "3. A lesson",
        line: 5,
        shown: ["ecs garden frame 0: inspecting []", "...", "firefly 3: you can catch it"],
        steps: [
          { kind: "frames", count: 2 },
          { kind: "press", action: "clap" },
          { kind: "touch", name: "firefly 3" },
          { kind: "move", name: "firefly 1" },
        ],
      },
    ]);
  });

  test("a trace fence with no run has no steps", () => {
    const page = ["## 3. A lesson", `${FENCE}text trace`, "500 100", FENCE].join("\n");
    expect(traceFences(page)).toEqual([
      { heading: "3. A lesson", line: 2, shown: ["500 100"], steps: [] },
    ]);
  });

  test("reads a trace fence inside a callout with the prefix stripped", () => {
    const page = [
      "## 4. Another",
      "> [!MORE] The console",
      ">",
      `> ${FENCE}text trace run="frames 1"`,
      "> first line",
      ">",
      "> last line",
      `> ${FENCE}`,
    ].join("\n");
    expect(traceFences(page)).toEqual([
      {
        heading: "4. Another",
        line: 4,
        shown: ["first line", "", "last line"],
        steps: [{ kind: "frames", count: 1 }],
      },
    ]);
  });

  test("a plain text fence is not a trace", () => {
    const page = ["## 3. A lesson", `${FENCE}text`, "asleep", FENCE].join("\n");
    expect(traceFences(page)).toEqual([]);
  });

  test("an unknown step throws an error naming its page line and the step", () => {
    const page = [
      "## 3. A lesson",
      "",
      `${FENCE}text trace run="frames 1; jump 3"`,
      "x",
      FENCE,
    ].join("\n");
    expect(() => traceFences(page)).toThrow(/line 3.*`jump 3`/);
  });

  test("a bad frame count throws an error naming its page line and the step", () => {
    const page = ["## 3. A lesson", `${FENCE}text trace run="frames x"`, "x", FENCE].join("\n");
    expect(() => traceFences(page)).toThrow(/line 2.*`frames x`/);
  });
});

describe("matchTrace", () => {
  test("accepts shown lines equal to the printed ones", () => {
    expect(matchTrace(["a", "b"], ["a", "b"])).toBeUndefined();
  });

  test("a `...` line skips zero or more printed lines", () => {
    expect(matchTrace(["a", "...", "d"], ["a", "b", "c", "d"])).toBeUndefined();
    expect(matchTrace(["a", "...", "b"], ["a", "b"])).toBeUndefined();
  });

  test("shown lines with no `...` between them must be adjacent printed lines", () => {
    expect(matchTrace(["...", "a", "c", "..."], ["a", "b", "c"])).toBeDefined();
    expect(matchTrace(["...", "b", "c", "..."], ["a", "b", "c", "d"])).toBeUndefined();
  });

  test("with no leading `...` the first shown line must be the first printed line", () => {
    expect(matchTrace(["b", "..."], ["a", "b", "c"])).toBeDefined();
    expect(matchTrace(["...", "b", "..."], ["a", "b", "c"])).toBeUndefined();
  });

  test("with no trailing `...` the last shown line must be the last printed line", () => {
    expect(matchTrace(["...", "b"], ["a", "b", "c"])).toBeDefined();
    expect(matchTrace(["a", "b"], ["a", "b", "c"])).toBeDefined();
    expect(matchTrace(["...", "c"], ["a", "b", "c"])).toBeUndefined();
  });

  test("a mismatch names the first shown line with no place and the printed line it was held against", () => {
    const message = matchTrace(["...", "500 101"], ["500 100"]);
    expect(message).toContain("500 101");
    expect(message).toContain("500 100");

    const middle = matchTrace(["a", "...", "x", "y", "..."], ["a", "b", "x", "z", "w"]);
    expect(middle).toContain("`y`");
    expect(middle).toContain("`z`");
  });
});
