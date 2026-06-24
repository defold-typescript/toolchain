import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { GENERATED_BANNER } from "./build-output";
import { scanOrphanOutputs } from "./orphan-scan";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-orphan-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function writeFile(rel: string, contents: string): void {
  const abs = path.join(cwd, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

const ALONGSIDE = { outDir: undefined, include: ["src/**/*.ts"] };

describe("scanOrphanOutputs", () => {
  test("flags a banner-carrying orphan .lua but not a hand-authored one", () => {
    writeFile("src/old.lua", `return 1\n${GENERATED_BANNER}\n`);
    writeFile("src/hand.lua", "return { hand = true }\n");

    const warnings = scanOrphanOutputs(cwd, [], ALONGSIDE);

    expect(warnings.some((w) => w.includes("src/old.lua"))).toBe(true);
    expect(warnings.some((w) => w.includes("src/hand.lua"))).toBe(false);
  });

  test("flags a sourceless .ts.render_script component and its map via the .ts. infix", () => {
    writeFile("src/old.ts.render_script", "-- gen\n");
    writeFile("src/old.ts.render_script.map", "{}");

    const warnings = scanOrphanOutputs(cwd, [], ALONGSIDE);

    expect(warnings.some((w) => w.includes("src/old.ts.render_script"))).toBe(true);
    expect(warnings.some((w) => w.includes("src/old.ts.render_script.map"))).toBe(true);
  });

  test("does not flag outputs that belong to a live source", () => {
    writeFile("src/main.lua", `return 1\n${GENERATED_BANNER}\n`);
    writeFile("src/main.lua.map", "{}");

    const warnings = scanOrphanOutputs(cwd, ["src/main.ts"], ALONGSIDE);

    expect(warnings).toEqual([]);
  });

  test("excludes the lualib bundle and timers runtime even when they carry the banner (outDir mode)", () => {
    const config = { outDir: "build", include: ["src/**/*.ts"] };
    writeFile("build/lualib_bundle.lua", `-- bundle\n${GENERATED_BANNER}\n`);
    writeFile("build/defold_typescript_timers.lua", `-- timers\n${GENERATED_BANNER}\n`);
    writeFile("build/old.lua", `return 1\n${GENERATED_BANNER}\n`);

    const warnings = scanOrphanOutputs(cwd, [], config);

    expect(warnings.some((w) => w.includes("build/old.lua"))).toBe(true);
    expect(warnings.some((w) => w.includes("lualib_bundle.lua"))).toBe(false);
    expect(warnings.some((w) => w.includes("defold_typescript_timers.lua"))).toBe(false);
  });

  test("warning names the stale output and the source to restore, and the list is sorted", () => {
    writeFile("src/b.lua", `return 1\n${GENERATED_BANNER}\n`);
    writeFile("src/a.lua", `return 1\n${GENERATED_BANNER}\n`);

    const warnings = scanOrphanOutputs(cwd, [], ALONGSIDE);

    expect(warnings[0]).toContain("src/a.lua");
    expect(warnings[0]).toContain("src/a.ts");
    expect(warnings[1]).toContain("src/b.lua");
  });
});
