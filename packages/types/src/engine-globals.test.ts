import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const ENGINE_TYPES = [
  "Hash",
  "Matrix4",
  "Opaque",
  "Quaternion",
  "Url",
  "Vector",
  "Vector3",
  "Vector4",
] as const;

const source = readFileSync(path.join(import.meta.dir, "engine-globals.d.ts"), "utf8");

describe("engine-globals.d.ts", () => {
  test("keeps the no-self ambient banner", () => {
    expect(source.startsWith("/** @noSelfInFile */\n")).toBe(true);
  });

  test("imports the engine types from ./core-types", () => {
    expect(source).toContain('from "./core-types"');
  });

  test("declares every engine global inside a single declare global block", () => {
    const open = source.indexOf("declare global");
    expect(open).toBeGreaterThanOrEqual(0);
    expect(source.indexOf("declare global", open + 1)).toBe(-1);
    const block = source.slice(open);
    for (const name of ENGINE_TYPES) {
      const decl =
        name === "Opaque"
          ? "type Opaque<Name extends string> = Core.Opaque<Name>"
          : `type ${name} =`;
      expect(block).toContain(decl);
    }
    expect(block).toContain("function hash(s: string): Core.Hash");
  });
});
