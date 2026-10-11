import { describe, expect, test } from "bun:test";
import { createLiveRegistry, parseInspectLine } from "./hsm-view-live";

const ENGINE_START = "INFO:ENGINE: Defold Engine 1.13.2 (abc1234)";

describe("parseInspectLine", () => {
  test("reads the label, every active leaf and the move from a console line", () => {
    expect(
      parseInspectLine(
        "DEBUG:SCRIPT: hsm enemy#2 frame 12: /patrol/walk -> /chase (SEEN) [/chase, /alert/on]",
      ),
    ).toEqual({
      label: "enemy#2",
      leaves: ["/chase", "/alert/on"],
      move: { from: "/patrol/walk", to: "/chase", reason: "SEEN" },
    });
  });

  test("reads the inspecting line as leaves with no move", () => {
    expect(parseInspectLine("DEBUG:SCRIPT: hsm door frame 0: inspecting [/closed]")).toEqual({
      label: "door",
      leaves: ["/closed"],
    });
  });

  test("reads a stopped line as no leaves and no destination", () => {
    expect(
      parseInspectLine("DEBUG:SCRIPT: hsm door frame 9: /open -> (stopped) (stop) []"),
    ).toEqual({
      label: "door",
      leaves: [],
      move: { from: "/open", to: undefined, reason: "stop" },
    });
  });

  test("keeps a label with spaces whole", () => {
    expect(
      parseInspectLine("DEBUG:SCRIPT: hsm big boss frame 3: /idle -> /rage (HIT) [/rage]"),
    ).toEqual({
      label: "big boss",
      leaves: ["/rage"],
      move: { from: "/idle", to: "/rage", reason: "HIT" },
    });
  });

  test("reads escaped delimiters inside a field as part of it", () => {
    expect(parseInspectLine("DEBUG:SCRIPT: hsm door frame 0: inspecting [/a\\]b\\, c]")).toEqual({
      label: "door",
      leaves: ["/a]b, c"],
    });
  });

  test("rejects a dangling backslash or an unescaped bracket inside the list", () => {
    expect(
      parseInspectLine("DEBUG:SCRIPT: hsm door frame 0: inspecting [/closed\\]"),
    ).toBeUndefined();
    expect(parseInspectLine("DEBUG:SCRIPT: hsm door frame 0: inspecting [/a]b]")).toBeUndefined();
    expect(parseInspectLine("DEBUG:SCRIPT: hsm door frame 0: inspecting [/a\\qb]")).toBeUndefined();
  });

  test("rejects an unhandled line that is not the shape inspect prints", () => {
    expect(parseInspectLine("hsm door frame 3: unhandled (CLOSE [/closed]")).toBeUndefined();
    expect(parseInspectLine("hsm door frame 3: unhandled CLOSE) [/closed]")).toBeUndefined();
    expect(parseInspectLine("hsm door frame 3: unhandled [/closed]")).toBeUndefined();
    expect(parseInspectLine("hsm door frame 3: unhandled (A) (B) [/closed]")).toBeUndefined();
  });

  test("ignores lines that are not inspect output", () => {
    expect(parseInspectLine("DEBUG:SCRIPT: hello")).toBeUndefined();
    expect(parseInspectLine("ERROR:SCRIPT: main/door.lua:3: attempt to index nil")).toBeUndefined();
    expect(
      parseInspectLine("DEBUG:SCRIPT: hsm door frame 1: /closed -> /open (OPEN)"),
    ).toBeUndefined();
  });

  test("reads the rule a move line names", () => {
    const line = (reason: string) => `hsm door frame 3: /closed -> /open (${reason}) [/open]`;
    const moveOf = (reason: string) => parseInspectLine(line(reason))?.move;

    expect(moveOf("OPEN: /closed, 0")).toEqual({
      from: "/closed",
      to: "/open",
      reason: "OPEN",
      rule: { source: "/closed", key: 0 },
    });

    const timed = moveOf("after: /open, 0.5");
    expect(timed?.reason).toBe("after");
    expect(timed?.rule).toEqual({ source: "/open", key: 0.5 });

    expect(moveOf("update: /open")?.rule).toStrictEqual({ source: "/open" });
    expect(moveOf("RESET: , 0")?.rule).toEqual({ source: "", key: 0 });

    const escaped = moveOf("a\\: b: /p\\, q, 2");
    expect(escaped?.reason).toBe("a: b");
    expect(escaped?.rule).toEqual({ source: "/p, q", key: 2 });

    const bare = moveOf("OPEN");
    expect(bare?.reason).toBe("OPEN");
    expect(bare !== undefined && "rule" in bare).toBe(false);

    expect(parseInspectLine(line("OPEN: /closed, x"))).toBeUndefined();
    expect(parseInspectLine(line("OPEN: /closed, "))).toBeUndefined();

    const message = createLiveRegistry().feed(line("OPEN: /closed, 0"));
    expect(message?.move?.rule).toEqual({ source: "/closed", key: 0 });
  });
});

describe("createLiveRegistry", () => {
  test("keeps the latest leaves per label in first-seen order and reports each change", () => {
    const registry = createLiveRegistry();
    expect(registry.current()).toEqual({ instances: [] });

    expect(registry.feed("DEBUG:SCRIPT: hsm door frame 0: inspecting [/closed]")).toEqual({
      instances: [{ label: "door", leaves: ["/closed"], stopped: false }],
    });
    registry.feed("DEBUG:SCRIPT: hsm lamp frame 0: inspecting [/off]");
    expect(
      registry.feed("DEBUG:SCRIPT: hsm door frame 4: /closed -> /open (OPEN) [/open]"),
    ).toEqual({
      instances: [
        { label: "door", leaves: ["/open"], stopped: false },
        { label: "lamp", leaves: ["/off"], stopped: false },
      ],
      move: { label: "door", from: "/closed", to: "/open", reason: "OPEN" },
    });
    expect(registry.feed("DEBUG:SCRIPT: hsm lamp frame 5: /off -> (stopped) (stop) []")).toEqual({
      instances: [
        { label: "door", leaves: ["/open"], stopped: false },
        { label: "lamp", leaves: [], stopped: true },
      ],
      move: { label: "lamp", from: "/off", to: undefined, reason: "stop" },
    });
  });

  test("an unchanged or unrelated line reports nothing", () => {
    const registry = createLiveRegistry();
    registry.feed("DEBUG:SCRIPT: hsm door frame 0: inspecting [/closed]");
    expect(registry.feed("DEBUG:SCRIPT: hsm door frame 0: inspecting [/closed]")).toBeUndefined();
    expect(registry.feed("INFO:DLIB: SSDP started")).toBeUndefined();
    expect(registry.current()).toEqual({
      instances: [{ label: "door", leaves: ["/closed"], stopped: false }],
    });
  });

  test("an engine start empties the list", () => {
    const registry = createLiveRegistry();
    registry.feed("DEBUG:SCRIPT: hsm door frame 0: inspecting [/closed]");
    expect(registry.feed(ENGINE_START)).toEqual({ instances: [] });
    expect(registry.feed(ENGINE_START)).toBeUndefined();
    expect(registry.feed("DEBUG:SCRIPT: hsm lamp frame 0: inspecting [/on]")).toEqual({
      instances: [{ label: "lamp", leaves: ["/on"], stopped: false }],
    });
  });
});
