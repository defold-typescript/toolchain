import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import apiTargets from "../api-targets.json" with { type: "json" };
import { STRING_CONSTANTS } from "./emit-dts";

const PKG = resolve(import.meta.dir, "..");

interface Target {
  readonly id: string;
  readonly fixturesDir: string;
}

// The targets whose engine bindings are vendored on disk.
const VENDORED = (apiTargets as { targets: readonly Target[] }).targets.filter((target) =>
  existsSync(join(PKG, target.fixturesDir, "engine-bindings")),
);

describe("STRING_CONSTANTS provenance", () => {
  test("the engine bindings are vendored for at least one target", () => {
    expect(VENDORED.length).toBeGreaterThan(0);
  });

  test("every vendored binding still registers each entry through a macro that pushes a literal", () => {
    const problems: string[] = [];
    for (const target of VENDORED) {
      for (const [fqn, source] of STRING_CONSTANTS) {
        const file = join(PKG, target.fixturesDir, "engine-bindings", source.binding);
        const text = existsSync(file) ? readFileSync(file, "utf8") : "";
        const definition = new RegExp(
          `#define ${source.macro}\\([^)]*\\)\\s*\\\\\\s*lua_pushliteral`,
        );
        if (!definition.test(text)) {
          problems.push(`${target.id} ${fqn}: ${source.macro} no longer pushes a literal`);
        }
        if (!text.includes(source.call)) {
          problems.push(`${target.id} ${fqn}: ${source.binding} no longer calls ${source.call}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
