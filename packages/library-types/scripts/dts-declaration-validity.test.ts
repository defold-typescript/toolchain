import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { readLualsTargets } from "./sync-luals-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// Every committed luals namespace's golden, read from luals-targets.json so a new
// entry is gated automatically (not just druid).
const LUALS_NAMESPACES = readLualsTargets(PACKAGE_ROOT).map((t) => t.namespace);

// Type-check the committed luals goldens with `skipLibCheck: false` so any invalid
// declaration in a whole golden — a base/subinterface variance regression (`TS2430`)
// or a merged duplicate-member class (`TS2300`/`TS2717`) — surfaces as a real
// diagnostic instead of hiding behind the repo-wide `skipLibCheck: true`. The
// offender filter is anchored on each `generated/<namespace>.d.ts` so the
// out-of-scope `../types/generated/physics.d.ts` `diameter` duplicate (a separate
// `packages/types` defect) and node_modules type conflicts do not gate this proof.
test("every committed luals golden carries no diagnostics under skipLibCheck: false", () => {
  const proc = Bun.spawnSync(
    ["bunx", "tsc", "-p", "tsconfig.dts-check.json", "--noEmit", "--pretty", "false"],
    { cwd: PACKAGE_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const output =
    `${new TextDecoder().decode(proc.stdout)}${new TextDecoder().decode(proc.stderr)}`.replace(
      /\\/g,
      "/",
    );
  const namespaceAlternation = LUALS_NAMESPACES.map((n) =>
    n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|");
  const offenderRe = new RegExp(`generated/(${namespaceAlternation})\\.d\\.ts.*error TS`);
  const offenders = output.split("\n").filter((line) => offenderRe.test(line));
  expect(offenders).toEqual([]);
});
