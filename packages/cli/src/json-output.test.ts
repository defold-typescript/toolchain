import { describe, expect, test } from "bun:test";
import { renderResult, renderWatchEvent } from "./json-output";

describe("renderResult", () => {
  test("serializes a successful init result with written files", () => {
    const out = renderResult({ command: "init", written: ["a", "b"] });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed).toEqual({ command: "init", ok: true, written: ["a", "b"] });
  });

  test("serializes a failing build result with an error and no written key", () => {
    const out = renderResult({ command: "build", error: "boom" });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed).toEqual({ command: "build", ok: false, error: "boom" });
    expect("written" in parsed).toBe(false);
  });

  test("emits a single line terminated by a newline", () => {
    const out = renderResult({ command: "init", written: [] });
    expect(out.endsWith("\n")).toBe(true);
    expect(out.trimEnd()).not.toContain("\n");
  });

  test("includes a string apiSurface when present", () => {
    const out = renderResult({ command: "build", written: [], apiSurface: "defold-1.12.4" });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.apiSurface).toBe("defold-1.12.4");
  });

  test("emits an explicit null apiSurface when present", () => {
    const out = renderResult({ command: "build", written: [], apiSurface: null });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect("apiSurface" in parsed).toBe(true);
    expect(parsed.apiSurface).toBeNull();
  });

  test("omits apiSurface when undefined", () => {
    const out = renderResult({ command: "build", written: [] });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect("apiSurface" in parsed).toBe(false);
  });

  test("never emits a scriptKind key", () => {
    const out = renderResult({ command: "init", written: [] });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect("scriptKind" in parsed).toBe(false);
  });
});

describe("renderWatchEvent", () => {
  test("serializes a build event with written files and no rebuild-only keys", () => {
    const out = renderWatchEvent({ event: "build", written: ["a", "b"] });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed).toEqual({ command: "watch", event: "build", ok: true, written: ["a", "b"] });
    expect("changed" in parsed).toBe(false);
    expect("removed" in parsed).toBe(false);
    expect("error" in parsed).toBe(false);
  });

  test("serializes a rebuild event with changed and removed arrays", () => {
    const out = renderWatchEvent({
      event: "rebuild",
      written: ["a"],
      changed: ["src/a.ts"],
      removed: [],
    });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed.ok).toBe(true);
    expect(parsed.changed).toEqual(["src/a.ts"]);
    expect(parsed.removed).toEqual([]);
  });

  test("serializes a failing rebuild event with an error and no written key", () => {
    const out = renderWatchEvent({ event: "rebuild", error: "boom" });
    const parsed = JSON.parse(out) as Record<string, unknown>;
    expect(parsed).toEqual({ command: "watch", event: "rebuild", ok: false, error: "boom" });
    expect("written" in parsed).toBe(false);
  });

  test("emits a single line terminated by exactly one newline", () => {
    const out = renderWatchEvent({ event: "build", written: [] });
    expect(out.endsWith("\n")).toBe(true);
    expect(out.trimEnd()).not.toContain("\n");
  });
});
