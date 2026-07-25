import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readLualsTargets } from "./sync-luals-types";
import { readScriptApiTargets } from "./sync-script-api-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// The golden paths absent from a `tsconfig.dts-check.json` `include`. Separators
// are normalized to `/` before comparing, mirroring the diagnostic-output
// normalization below.
function missingDtsCheckIncludes(goldens: string[], include: string[]): string[] {
  const present = new Set(include.map((entry) => entry.replace(/\\/g, "/")));
  return goldens.filter((path) => !present.has(path));
}

// Every committed luals namespace's golden, read from luals-targets.json so a new
// entry is gated automatically (not just druid). Luals goldens are keyed by
// namespace at `generated/<namespace>.d.ts`.
const LUALS_GOLDENS = readLualsTargets(PACKAGE_ROOT).map((t) => `generated/${t.namespace}.d.ts`);
// Every committed script_api golden, read from script-api-targets.json. These are
// importable `declare module '<moduleId>'` surfaces keyed by moduleId (dotted),
// so the golden path is read straight from the target rather than reconstructed.
const SCRIPT_API_GOLDENS = readScriptApiTargets(PACKAGE_ROOT).map((t) => t.generated);

// Type-check the committed goldens with `skipLibCheck: false` so any invalid
// declaration in a whole golden — a base/subinterface variance regression (`TS2430`)
// or a merged duplicate-member class (`TS2300`/`TS2717`) — surfaces as a real
// diagnostic instead of hiding behind the repo-wide `skipLibCheck: true`. The
// offender filter is anchored on every dts-check compile input (goldens plus the
// `test-d/` import proofs and the ambient loader) so a `TS` error attributed to a
// compiled proof also gates; the out-of-scope `../types/generated/physics.d.ts`
// `diameter` duplicate (a separate `packages/types` defect) and node_modules type
// conflicts stay dodged because their paths are not `include` entries.
test("every dts-check compile input carries no diagnostics under skipLibCheck: false", () => {
  const proc = Bun.spawnSync(
    ["bunx", "tsc", "-p", "tsconfig.dts-check.json", "--noEmit", "--pretty", "false"],
    { cwd: PACKAGE_ROOT, stdout: "pipe", stderr: "pipe" },
  );
  const output =
    `${new TextDecoder().decode(proc.stdout)}${new TextDecoder().decode(proc.stderr)}`.replace(
      /\\/g,
      "/",
    );
  const alternation = readDtsCheckInclude()
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  const offenderRe = new RegExp(`(${alternation}).*error TS`);
  const offenders = output.split("\n").filter((line) => offenderRe.test(line));
  expect(offenders).toEqual([]);
});

// Guard the seam between `luals-targets.json` (the namespace source the offender
// filter is built from) and `tsconfig.dts-check.json`'s `include` (what `tsc`
// actually compiles): a namespace listed in the former but forgotten from the
// latter is never type-checked, so the skipLibCheck proof above silently passes
// for it. Assert every configured namespace's golden is a compile input.
test("every configured luals namespace is a tsconfig.dts-check.json include", () => {
  const include = readDtsCheckInclude();
  expect(missingDtsCheckIncludes(LUALS_GOLDENS, include)).toEqual([]);
});

// The same seam guard for script_api goldens: a `script-api-targets.json` entry
// whose golden is missing from the include is never compiled, so its importable
// `declare module` form is unverified.
test("every configured script_api golden is a tsconfig.dts-check.json include", () => {
  const include = readDtsCheckInclude();
  expect(missingDtsCheckIncludes(SCRIPT_API_GOLDENS, include)).toEqual([]);
});

test("missingDtsCheckIncludes reports a golden absent from the include", () => {
  const include = ["generated/druid.d.ts", "generated/decore.d.ts", "test-d/dts-check-ambient.ts"];
  expect(
    missingDtsCheckIncludes(
      ["generated/druid.d.ts", "generated/decore.d.ts", "generated/gooey.d.ts"],
      include,
    ),
  ).toEqual(["generated/gooey.d.ts"]);
});

// `tsconfig.dts-check.json` must declare its own `exclude`; a child `exclude`
// fully replaces the parent's, so without one the config inherits whatever the
// parent excludes and a future parent-exclude change could silently drop a
// `test-d/*.test-d.ts` import proof from compilation, ungating it. Assert the
// own exclude exists and lists no `test-d` proof.
test("tsconfig.dts-check.json declares its own exclude that keeps the test-d proofs compiled", () => {
  const exclude = readDtsCheckExclude();
  expect(Array.isArray(exclude)).toBe(true);
  expect(exclude.length).toBeGreaterThan(0);
  expect(exclude.some((entry) => /test-d\/.*\.test-d\.ts$/.test(entry.replace(/\\/g, "/")))).toBe(
    false,
  );
});

function readDtsCheckConfig(): { include: string[]; exclude?: string[] } {
  return JSON.parse(readFileSync(resolve(PACKAGE_ROOT, "tsconfig.dts-check.json"), "utf8")) as {
    include: string[];
    exclude?: string[];
  };
}

function readDtsCheckInclude(): string[] {
  return readDtsCheckConfig().include;
}

function readDtsCheckExclude(): string[] {
  return readDtsCheckConfig().exclude ?? [];
}
