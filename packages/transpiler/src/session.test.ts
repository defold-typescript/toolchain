import { describe, expect, test } from "bun:test";
import { createTranspileSession } from "./session";
import { transpileProject } from "./transpile";

describe("createTranspileSession", () => {
  test("first update is output-equivalent to transpileProject for a single file", () => {
    const files = { "main.ts": "export const x = 1;" };
    const session = createTranspileSession();

    const sessionResult = session.update(files);
    const projectResult = transpileProject({ files });

    expect(sessionResult.lua).toEqual(projectResult.lua);
    expect(sessionResult.sourceMaps).toEqual(projectResult.sourceMaps);
    expect(sessionResult.diagnostics).toEqual(projectResult.diagnostics);
  });

  test("output-equivalent for a two-file import project", () => {
    const files = {
      "util.ts":
        "export function clamp(v: number, lo: number, hi: number): number {\n  if (v < lo) return lo;\n  if (v > hi) return hi;\n  return v;\n}\n",
      "main.ts": "import { clamp } from './util';\nexport const limit = clamp(42, 0, 100);\n",
    };
    const session = createTranspileSession();

    const sessionResult = session.update(files);
    const projectResult = transpileProject({ files });

    expect(Object.keys(sessionResult.lua).sort()).toEqual(Object.keys(projectResult.lua).sort());
    expect(sessionResult.lua).toEqual(projectResult.lua);
    expect(sessionResult.sourceMaps).toEqual(projectResult.sourceMaps);
  });

  test("reuses the cached program: unchanged source file is the same reference", () => {
    const session = createTranspileSession();
    session.update({
      "util.ts": "export const helper = 1;\n",
      "main.ts": "import { helper } from './util';\nexport const x = helper;\n",
    });

    const before = session.getProgram()?.getSourceFile("util.ts");
    expect(before).toBeDefined();

    session.update({
      "main.ts": "import { helper } from './util';\nexport const x = helper + 1;\n",
    });

    const after = session.getProgram()?.getSourceFile("util.ts");
    expect(after).toBe(before);
  });

  test("incremental correctness: changed file updates, unchanged file byte-identical", () => {
    const session = createTranspileSession();
    const first = session.update({
      "util.ts": "export const helper = 1;\n",
      "main.ts": "import { helper } from './util';\nexport const x = helper;\n",
    });

    const second = session.update({
      "main.ts": "import { helper } from './util';\nexport const x = helper + 1;\n",
    });

    expect(second.lua["util.ts"]).toBe(first.lua["util.ts"]);
    expect(second.lua["main.ts"]).not.toBe(first.lua["main.ts"]);
    expect((second.lua["main.ts"] ?? "").length).toBeGreaterThan(0);
  });

  test("add and remove files across updates", () => {
    const session = createTranspileSession();
    session.update({
      "util.ts": "export const helper = 1;\n",
      "main.ts": "export const x = 1;\n",
    });

    const added = session.update({ "newmod.ts": "export const y = 2;\n" });
    expect(added.lua["newmod.ts"]?.length ?? 0).toBeGreaterThan(0);
    expect(added.lua["util.ts"]?.length ?? 0).toBeGreaterThan(0);

    const removed = session.update({ "util.ts": null });
    expect(removed.lua["util.ts"]).toBeUndefined();
    expect(removed.sourceMaps["util.ts"]).toBeUndefined();
    expect(removed.lua["main.ts"]?.length ?? 0).toBeGreaterThan(0);
    expect(removed.lua["newmod.ts"]?.length ?? 0).toBeGreaterThan(0);
    expect(session.getProgram()?.getSourceFile("util.ts")).toBeUndefined();
  });

  test("surfaces the lualib bundle on the incremental update path", () => {
    const files = { "main.ts": "export const ks = Object.keys({ a: 1, b: 2 });\n" };
    const session = createTranspileSession();

    const sessionResult = session.update(files);
    const projectResult = transpileProject({ files });

    expect(sessionResult.lua["main.ts"]).toContain('require("lualib_bundle")');
    expect(sessionResult.lualib).toBe(projectResult.lualib);
    expect(sessionResult.lualib ?? "").toContain("__TS__ObjectKeys");
  });
});
