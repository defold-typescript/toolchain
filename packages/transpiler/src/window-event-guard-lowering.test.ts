import { describe, expect, test } from "bun:test";
import { transpile } from "./transpile";

describe("window event guard lowering", () => {
  test("lowers isWindowEvent(event, data, id) to event == id", () => {
    const source = [
      'import { defineScript } from "@defold-typescript/types";',
      "",
      "defineScript({",
      "  init() {",
      "    window.set_listener((self, event, data) => {",
      "      if (isWindowEvent(event, data, window.WINDOW_EVENT_RESIZED)) {",
      "        handle(1);",
      "      }",
      "    });",
      "  },",
      "});",
      "",
      "declare function handle(n: number): void;",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("if event == window.WINDOW_EVENT_RESIZED then");
    expect(result.lua).not.toContain("isWindowEvent");
    expect(result.lua).not.toContain("require(");
  });

  test("leaves a same-named local function untouched (not from the types module)", () => {
    const source = [
      "function isWindowEvent(e: unknown, d: unknown, x: number): boolean {",
      "  return x > 0;",
      "}",
      "",
      "export function check(e: unknown, d: unknown): void {",
      "  if (isWindowEvent(e, d, 1)) {",
      "    return;",
      "  }",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
    expect(result.lua).toContain("isWindowEvent");
  });
});
