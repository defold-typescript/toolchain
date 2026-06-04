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
  test("imports the engine types from ./core-types", () => {
    expect(source).toContain('from "./core-types"');
  });

  test("declares every ENGINE_TYPES name inside a single declare global block", () => {
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
  });
});
