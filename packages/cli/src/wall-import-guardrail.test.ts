import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runBuild } from "./build";
import { applyWallSelection } from "./wall";
import { findWallImportViolations } from "./wall-import-guardrail";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-wall-guard-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function write(rel: string, contents: string): void {
  const abs = path.join(cwd, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

function tsconfig(): void {
  write(
    "tsconfig.json",
    `${JSON.stringify(
      {
        compilerOptions: { target: "ES2022", module: "ESNext", strict: true },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );
}

const offEntryGui = [
  'import { defineGuiScript } from "@defold-typescript/types";',
  "defineGuiScript({ init() {} });",
].join("\n");

const subpathGui = [
  'import { defineGuiScript } from "@defold-typescript/types/gui-script";',
  "defineGuiScript({ init() {} });",
].join("\n");

describe("findWallImportViolations", () => {
  test("flags a walled source importing a factory off the main entry", () => {
    tsconfig();
    write("src/ui/hud.ts", offEntryGui);
    applyWallSelection(cwd, ["src/ui"]);

    const violations = findWallImportViolations(cwd);

    expect(violations).toEqual([
      {
        file: "src/ui/hud.ts",
        kind: "gui-script",
        factory: "defineGuiScript",
        expected: "@defold-typescript/types/gui-script",
      },
    ]);
  });

  test("does not flag the sanctioned kind-subpath import in a walled dir", () => {
    tsconfig();
    write("src/ui/hud.ts", subpathGui);
    applyWallSelection(cwd, ["src/ui"]);

    expect(findWallImportViolations(cwd)).toEqual([]);
  });

  test("does not flag an off-entry import in a non-walled dir", () => {
    tsconfig();
    write("src/ui/hud.ts", offEntryGui);

    expect(findWallImportViolations(cwd)).toEqual([]);
  });
});

describe("runBuild wall-import guardrail", () => {
  test("throws on a walled off-entry factory import, naming file and expected subpath", () => {
    tsconfig();
    write("src/ui/hud.ts", offEntryGui);
    applyWallSelection(cwd, ["src/ui"]);

    expect(() => runBuild({ cwd })).toThrow(/src\/ui\/hud\.ts/);
    expect(() => runBuild({ cwd })).toThrow(/@defold-typescript\/types\/gui-script/);
  });

  test("builds a clean walled project without throwing", () => {
    tsconfig();
    write("src/ui/hud.ts", subpathGui);
    applyWallSelection(cwd, ["src/ui"]);

    expect(() => runBuild({ cwd })).not.toThrow();
  });
});
