import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { hsmModules } from "@defold-typescript/transpiler";
import { emitHsmDeclarations, HSM_DECLARATIONS_DIR } from "./emit-declarations";

const REGENERATE = "bun run --cwd packages/hsm declarations";

describe("hsm declarations in @defold-typescript/types", () => {
  const emitted = emitHsmDeclarations();

  test("every module's committed declaration equals a fresh emit", () => {
    for (const { name } of hsmModules()) {
      const file = path.join(HSM_DECLARATIONS_DIR, `${name}.d.ts`);
      const committed = existsSync(file) ? readFileSync(file, "utf8") : undefined;
      expect(committed, `packages/types/hsm/${name}.d.ts is stale; run ${REGENERATE}`).toBe(
        emitted[name],
      );
    }
  });

  test("the folder holds no declaration for a module hsm does not ship", () => {
    const expected = hsmModules().map(({ name }) => `${name}.d.ts`);
    const present = existsSync(HSM_DECLARATIONS_DIR)
      ? readdirSync(HSM_DECLARATIONS_DIR).filter((entry) => entry.endsWith(".d.ts"))
      : [];
    expect(present.sort(), `packages/types/hsm/ drifted; run ${REGENERATE}`).toEqual(
      [...expected].sort(),
    );
  });
});
