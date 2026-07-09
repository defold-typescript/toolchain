import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import { AMBIENT_FILES, transpile } from "./transpile";

const TYPES_PKG_ROOT = path.dirname(
  createRequire(import.meta.url).resolve("@defold-typescript/types/package.json"),
);

// Simple, real expressions that only type-check when the hand-authored vmath
// overloads (`src/vmath-overloads.d.ts`) are part of the transpiler's virtual
// program. `quat_from_to` comes from the generated namespace and anchors the
// regression: it kept resolving while the overload-provided siblings vanished.
describe("ambient surface smoke", () => {
  test("vmath overload functions type-check through the transpiler", () => {
    const source = [
      "export function go() {",
      "  const a = vmath.vector3(1, 2, 3);",
      "  const b = vmath.vector3(4, 5, 6);",
      "  const lerped = vmath.lerp(0.5, a, b);",
      "  const normalized = vmath.normalize(a);",
      "  const slerped = vmath.slerp(0.5, a, b);",
      "  const clamped = vmath.clamp(a, 0, 1);",
      "  const scaled = vmath.mul_per_elem(a, b);",
      "  const rot = vmath.quat_from_to(a, b);",
      "  return [lerped, normalized, slerped, clamped, scaled, rot];",
      "}",
      "",
    ].join("\n");
    const result = transpile(source);
    expect(result.diagnostics).toEqual([]);
  });

  // Structural guard against seed drift: index.d.ts pulls in every `src/*.d.ts`
  // augmentation, so the transpiler's ambient surface must too. Without this a
  // newly-added augmentation type-checks in the editor yet silently drops out of
  // the transpiler — exactly how vmath's overloads regressed.
  test("every generated and src augmentation is seeded", () => {
    const expected = ["generated", "src"].flatMap((dir) =>
      readdirSync(path.join(TYPES_PKG_ROOT, dir))
        .filter((entry) => entry.endsWith(".d.ts"))
        .map((entry) => `node_modules/@defold-typescript/types/${dir}/${entry}`),
    );
    const seeded = new Set(Object.keys(AMBIENT_FILES));
    const missing = expected.filter((key) => !seeded.has(key));
    expect(missing).toEqual([]);
  });
});
