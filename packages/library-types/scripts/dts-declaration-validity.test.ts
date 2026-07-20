import { expect, test } from "bun:test";
import { resolve } from "node:path";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// Type-check the committed `generated/druid.d.ts` with `skipLibCheck: false` so any
// invalid declaration in the whole druid golden — a base/subinterface variance
// regression (`TS2430`) or the merged `druid_logger` duplicate members
// (`TS2300`/`TS2717`) — surfaces as a real diagnostic instead of hiding behind the
// repo-wide `skipLibCheck: true`. The offender filter is anchored on
// `generated/druid.d.ts` so the out-of-scope `../types/generated/physics.d.ts`
// `diameter` duplicate (a separate `packages/types` defect) does not gate this proof.
test("generated/druid.d.ts carries no diagnostics under skipLibCheck: false", () => {
  const proc = Bun.spawnSync(
    ["bunx", "tsc", "-p", "tsconfig.dts-check.json", "--noEmit", "--pretty", "false"],
    { cwd: PACKAGE_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const output =
    `${new TextDecoder().decode(proc.stdout)}${new TextDecoder().decode(proc.stderr)}`.replace(
      /\\/g,
      "/",
    );
  const offenders = output
    .split("\n")
    .filter((line) => /generated\/druid\.d\.ts.*error TS/.test(line));
  expect(offenders).toEqual([]);
});
