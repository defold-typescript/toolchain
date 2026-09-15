import { describe, expect, test } from "bun:test";
import { colorEnabled, severityLine } from "./terminal-style";

const tty = { isTTY: true };

describe("colorEnabled", () => {
  test("is on for a TTY stream with no off-switch", () => {
    expect(colorEnabled({ stream: tty, env: {}, noColor: false, json: false })).toBe(true);
  });

  test("NO_COLOR with a value turns color off", () => {
    expect(colorEnabled({ stream: tty, env: { NO_COLOR: "1" }, noColor: false, json: false })).toBe(
      false,
    );
  });

  test("an empty NO_COLOR leaves color on", () => {
    expect(colorEnabled({ stream: tty, env: { NO_COLOR: "" }, noColor: false, json: false })).toBe(
      true,
    );
  });

  test("TERM=dumb turns color off", () => {
    expect(colorEnabled({ stream: tty, env: { TERM: "dumb" }, noColor: false, json: false })).toBe(
      false,
    );
  });

  test("--no-color turns color off", () => {
    expect(colorEnabled({ stream: tty, env: {}, noColor: true, json: false })).toBe(false);
  });

  test("--json turns color off", () => {
    expect(colorEnabled({ stream: tty, env: {}, noColor: false, json: true })).toBe(false);
  });

  test("a stream that is not a TTY gets no color", () => {
    expect(colorEnabled({ stream: {}, env: {}, noColor: false, json: false })).toBe(false);
    expect(colorEnabled({ stream: { isTTY: false }, env: {}, noColor: false, json: false })).toBe(
      false,
    );
  });

  test("FORCE_COLOR does not turn color on for a piped stream", () => {
    expect(
      colorEnabled({ stream: {}, env: { FORCE_COLOR: "3" }, noColor: false, json: false }),
    ).toBe(false);
  });
});

describe("severityLine", () => {
  test("inserts the word after the command prefix on the first line only", () => {
    expect(
      severityLine("defold-typescript build: 2 file(s) failed:\n  a.ts:1:1: x", "error", false),
    ).toBe("defold-typescript build: error: 2 file(s) failed:\n  a.ts:1:1: x");
  });

  test("a multi-word command prefix takes the word after its colon", () => {
    expect(severityLine("defold-typescript bob run: exited 2", "error", false)).toBe(
      "defold-typescript bob run: error: exited 2",
    );
  });

  test("the bare prefix takes the word after its colon", () => {
    expect(severityLine("defold-typescript: unknown command", "error", false)).toBe(
      "defold-typescript: error: unknown command",
    );
  });

  test("a message with no prefix leads with the word", () => {
    expect(severityLine("something broke", "error", false)).toBe("error: something broke");
  });

  test("color wraps the word alone", () => {
    expect(severityLine("defold-typescript: boom", "error", true)).toBe(
      "defold-typescript: \x1b[1;31merror\x1b[0m: boom",
    );
    expect(severityLine("defold-typescript: careful", "warning", true)).toBe(
      "defold-typescript: \x1b[1;33mwarning\x1b[0m: careful",
    );
  });

  test("a message already carrying the word is not given a second one", () => {
    expect(severityLine("defold-typescript reload: error: editor refused", "error", false)).toBe(
      "defold-typescript reload: error: editor refused",
    );
    expect(severityLine("error: already worded", "error", false)).toBe("error: already worded");
  });
});
