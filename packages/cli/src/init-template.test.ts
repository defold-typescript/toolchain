import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runInit } from "./init";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-init-template-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function read(rel: string): string {
  return readFileSync(path.join(cwd, rel), "utf8");
}

describe("init --template (new-project synthesis)", () => {
  test("no template reproduces today's opinionated layout", () => {
    const { written } = runInit({ cwd });

    expect(written).toContain("game.project");
    expect(written).toContain("main/main.collection");
    expect(written).toContain("src/main.ts");
    expect(read("src/main.ts")).toContain("vmath.vector3");
  });

  test("template 'default' is identical to omitting the flag", () => {
    const baseline = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-init-baseline-"));
    try {
      const omitted = runInit({ cwd: baseline });
      const explicit = runInit({ cwd });

      expect(explicit.written.sort()).toEqual(omitted.written.sort());
      expect(read("src/main.ts")).toBe(readFileSync(path.join(baseline, "src", "main.ts"), "utf8"));
    } finally {
      rmSync(baseline, { recursive: true, force: true });
    }
  });

  test("template 'minimal' writes an empty-state main.ts with no vmath example", () => {
    const { written } = runInit({ cwd, template: "minimal" });

    expect(written).toContain("game.project");
    expect(written).toContain("main/main.collection");
    expect(written).toContain("src/main.ts");
    expect(written).toContain("tsconfig.json");

    const main = read("src/main.ts");
    expect(main).not.toContain("vmath");
    expect(main).toContain("defineScript");
  });

  test("an unknown template name throws, naming the valid templates", () => {
    expect(() => runInit({ cwd, template: "nope" })).toThrow(/default.*minimal|minimal.*default/);
  });

  test("a non-default template on an existing Defold project throws and writes nothing", () => {
    writeFileSync(path.join(cwd, "game.project"), "[project]\n");

    expect(() => runInit({ cwd, template: "minimal" })).toThrow(/new project/i);
    expect(existsSync(path.join(cwd, "tsconfig.json"))).toBe(false);
  });
});
