import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { assertSrcAugmentationScoping, SRC_AUGMENTATION_MODULES } from "../scripts/regen";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// Matches the contract line `regen.ts` prints once the guard has run; see the
// comment beside that `console.log`.
const SCOPING_CHECKED_PREFIX = "src augmentation scoping checked:";

// A surface root the production loader accepts: every name it will look for
// exists, and only the one under test re-opens anything.
function syntheticRoot(overrides: Record<string, string>): string {
  const root = mkdtempSync(resolve(tmpdir(), "regen-entrypoint-"));
  mkdirSync(resolve(root, "src"), { recursive: true });
  for (const name of SRC_AUGMENTATION_MODULES) {
    writeFileSync(resolve(root, "src", `${name}.d.ts`), overrides[name] ?? "export {};\n");
  }
  return root;
}

describe("assertSrcAugmentationScoping", () => {
  test("the real package root passes the guard, and reports what it checked", async () => {
    const checked = await assertSrcAugmentationScoping(PACKAGE_ROOT);
    expect(checked).toBe(SRC_AUGMENTATION_MODULES.length);
  });

  test("an unmarked augmentation re-opening a restricted namespace rejects", async () => {
    const root = syntheticRoot({
      "go-overloads": ["export {};", "declare global {", "  namespace gui {}", "}"].join("\n"),
    });
    try {
      const error = await assertSrcAugmentationScoping(root).then(
        () => undefined,
        (reason: unknown) => reason,
      );
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain("go-overloads");
      expect((error as Error).message).toContain("gui");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("the regeneration entry point", () => {
  test("runs the scoping guard before it writes anything, and exits clean", () => {
    const proc = Bun.spawnSync(["bun", "scripts/regen.ts"], {
      cwd: PACKAGE_ROOT,
      stdout: "pipe",
      stderr: "pipe",
      timeout: 120_000,
    });
    const output = proc.stdout.toString();
    if (proc.exitCode !== 0) {
      throw new Error(`bun scripts/regen.ts failed:\n${output}${proc.stderr.toString()}`);
    }

    const lines = output.split("\n");
    const checked = lines.findIndex((line) => line.startsWith(SCOPING_CHECKED_PREFIX));
    const firstWrite = lines.findIndex((line) => line.startsWith("wrote "));
    expect(checked).toBeGreaterThanOrEqual(0);
    expect(firstWrite).toBeGreaterThanOrEqual(0);
    expect(checked).toBeLessThan(firstWrite);

    const count = (lines[checked] ?? "").slice(SCOPING_CHECKED_PREFIX.length).match(/\d+/)?.[0];
    expect(count).toBe(String(SRC_AUGMENTATION_MODULES.length));
  });
});
