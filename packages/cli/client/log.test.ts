import { describe, expect, test } from "bun:test";
import type { SnapshotEntry } from "../src/hsm-view-session";
import { appendEntries, emptyLog, LOG_LIMIT, type LogKind, visibleLines } from "./log";

const engine = (t: number, api = "sprite.play_flipbook"): SnapshotEntry => ({
  kind: "engine",
  t,
  api,
  args: ["#sprite", "run"],
});

const transition = (t: number, event: unknown): SnapshotEntry => ({
  kind: "transition",
  t,
  from: "/idle",
  to: "/run",
  cause: "event",
  event,
});

function summary(entries: readonly SnapshotEntry[]) {
  return appendEntries(emptyLog, entries).lines.map((line) => [line.entry.kind, line.count]);
}

describe("appendEntries", () => {
  test("merges identical consecutive entries into one counted line at the latest time", () => {
    const log = appendEntries(emptyLog, [engine(0), engine(0.5)]);
    expect(log.lines).toHaveLength(1);
    expect(log.lines[0]).toMatchObject({ count: 2, entry: { t: 0.5 } });
  });

  test("merges across appends, since the new entry follows the last line", () => {
    const log = appendEntries(appendEntries(emptyLog, [engine(0)]), [engine(1)]);
    expect(log.lines.map((line) => line.count)).toEqual([2]);
  });

  test("treats transitions with the same from, to and cause as identical whatever the event", () => {
    expect(summary([transition(0, { type: "GO" }), transition(1, { type: "GO", n: 2 })])).toEqual([
      ["transition", 2],
    ]);
  });

  test("starts a new line for a different entry, or one in between", () => {
    expect(summary([engine(0), engine(0, "sprite.set_hflip"), engine(0)])).toEqual([
      ["engine", 1],
      ["engine", 1],
      ["engine", 1],
    ]);
    expect(summary([engine(0), { kind: "print", t: 0, text: "hi" }, engine(0), engine(0)])).toEqual(
      [
        ["engine", 1],
        ["print", 1],
        ["engine", 2],
      ],
    );
  });

  test("keeps the newest lines up to the limit", () => {
    const entries: SnapshotEntry[] = Array.from({ length: LOG_LIMIT + 20 }, (_, n) => ({
      kind: "print",
      t: n,
      text: `line ${n}`,
    }));
    const log = appendEntries(emptyLog, entries);
    expect(log.lines).toHaveLength(LOG_LIMIT);
    expect(log.lines[0]?.entry).toMatchObject({ text: "line 20" });
    expect(log.lines.at(-1)?.entry).toMatchObject({ text: `line ${LOG_LIMIT + 19}` });
  });

  test("gives every line its own id, kept when the line merges", () => {
    const first = appendEntries(emptyLog, [engine(0), { kind: "print", t: 0, text: "a" }]);
    const second = appendEntries(first, [{ kind: "print", t: 1, text: "a" }]);
    expect(second.lines.map((line) => line.id)).toEqual(first.lines.map((line) => line.id));
    expect(new Set(first.lines.map((line) => line.id)).size).toBe(2);
  });
});

describe("visibleLines", () => {
  const log = appendEntries(emptyLog, [
    transition(0, { type: "GO" }),
    { kind: "event", t: 0, event: { type: "GO" } },
    { kind: "unhandled", t: 0, event: { type: "STOP" } },
    engine(0),
    { kind: "print", t: 0, text: "hi" },
    { kind: "edit", t: 0, path: ["n"], value: 2 },
    { kind: "reload", t: 0, reason: "unkeyed machine restarted" },
    { kind: "error", t: 0, message: "boom" },
  ]);
  const kinds = (hidden: readonly LogKind[]) =>
    visibleLines(log, new Set(hidden)).map((line) => line.entry.kind);

  test("drops the hidden kind only", () => {
    expect(kinds(["engine"])).toEqual([
      "transition",
      "event",
      "unhandled",
      "print",
      "edit",
      "reload",
      "error",
    ]);
    expect(kinds(["event"])).toEqual(["transition", "engine", "print", "edit", "reload", "error"]);
  });

  test("never hides errors, reloads or edits", () => {
    expect(kinds(["transition", "event", "engine", "print"])).toEqual(["edit", "reload", "error"]);
  });
});
