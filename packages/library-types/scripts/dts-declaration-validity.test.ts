import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readLualsTargets } from "./sync-luals-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// The namespaces whose `generated/<ns>.d.ts` is absent from a
// `tsconfig.dts-check.json` `include`. Separators are normalized to `/` before
// comparing, mirroring the diagnostic-output normalization below.
function missingDtsCheckIncludes(namespaces: string[], include: string[]): string[] {
  const present = new Set(include.map((entry) => entry.replace(/\\/g, "/")));
  return namespaces.filter((ns) => !present.has(`generated/${ns}.d.ts`));
}

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

// Guard the seam between `luals-targets.json` (the namespace source the offender
// filter is built from) and `tsconfig.dts-check.json`'s `include` (what `tsc`
// actually compiles): a namespace listed in the former but forgotten from the
// latter is never type-checked, so the skipLibCheck proof above silently passes
// for it. Assert every configured namespace's golden is a compile input.
test("every configured luals namespace is a tsconfig.dts-check.json include", () => {
  const include = (
    JSON.parse(readFileSync(resolve(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8")) as {
      include: string[];
    }
  ).include;
  expect(missingDtsCheckIncludes(LUALS_NAMESPACES, include)).toEqual([]);
});

test("missingDtsCheckIncludes reports a namespace absent from the include", () => {
  const include = ["generated/druid.d.ts", "generated/decore.d.ts", "test-d/dts-check-ambient.ts"];
  expect(missingDtsCheckIncludes(["druid", "decore", "gooey"], include)).toEqual(["gooey"]);
});
