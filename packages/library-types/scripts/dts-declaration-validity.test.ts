import { expect, test } from "bun:test";
import { resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// Type-check the committed `generated/druid.d.ts` with `skipLibCheck: false` so a
// base/subinterface variance regression surfaces as a real `TS2430`
// ("incorrectly extends") diagnostic instead of hiding behind the repo-wide
// `skipLibCheck: true`. Only `TS2430` diagnostics under `generated/` are asserted
// away: dependency-graph duplicate-identifier noise (and the known `druid_logger`
// duplicate members) are `TS2300`/`TS2687`, not `TS2430`, so they do not gate this
// proof.
test("generated/druid.d.ts carries no incorrectly-extends (TS2430) diagnostics under skipLibCheck: false", () => {
  const proc = Bun.spawnSync(
    ["bunx", "tsc", "-p", "tsconfig.dts-check.json", "--noEmit", "--pretty", "false"],
    { cwd: PACKAGE_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const output =
    `${new TextDecoder().decode(proc.stdout)}${new TextDecoder().decode(proc.stderr)}`.replace(
      /\\/g,
      "/",
    );
  const offenders = output.split("\n").filter((line) => /generated\/.*error TS2430/.test(line));
  expect(offenders).toEqual([]);
});
