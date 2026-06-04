import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { runBuild } from "./build";
import { createBuildSession } from "./build-session";

let cwd: string;
let other: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-session-"));
  other = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-session-ref-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(other, { recursive: true, force: true });
});

const DEFAULT_TSCONFIG = JSON.stringify(
  {
    compilerOptions: { target: "ES2022", module: "ESNext", strict: true },
    include: ["src/**/*.ts"],
  },
  null,
  2,
);

function writeIn(root: string, rel: string, contents: string): void {
  const abs = path.join(root, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, contents);
}

const UTIL =
  "export function clamp(v: number, lo: number, hi: number): number {\n  return v < lo ? lo : v > hi ? hi : v;\n}\n";
const MAIN = "import { clamp } from './util';\nexport const limit = clamp(42, 0, 100);\n";

describe("createBuildSession", () => {
  test("buildAll writes the same Lua and maps as runBuild", () => {
    for (const root of [cwd, other]) {
      writeIn(root, "tsconfig.json", DEFAULT_TSCONFIG);
      writeIn(root, "src/util.ts", UTIL);
      writeIn(root, "src/main.ts", MAIN);
    }

    const reference = runBuild({ cwd: other });
    const session = createBuildSession({ cwd });
    const result = session.buildAll();

    expect(result.written.sort()).toEqual(reference.written.sort());
    for (const rel of result.written) {
      expect(readFileSync(path.join(cwd, rel), "utf8")).toBe(
        readFileSync(path.join(other, rel), "utf8"),
      );
      const map = path.join(cwd, `${rel}.map`);
      const refMap = path.join(other, `${rel}.map`);
      expect(existsSync(map)).toBe(existsSync(refMap));
      if (existsSync(map)) {
        expect(readFileSync(map, "utf8")).toBe(readFileSync(refMap, "utf8"));
      }
    }
  });

  test("applyEvents re-reads and rewrites only the changed file", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/util.ts", UTIL);
    writeIn(cwd, "src/main.ts", MAIN);

    const session = createBuildSession({ cwd });
    session.buildAll();

    const utilLuaBefore = readFileSync(path.join(cwd, "src/util.ts.script"), "utf8");
    const mainLuaBefore = readFileSync(path.join(cwd, "src/main.ts.script"), "utf8");

    // Delete the sibling source: applyEvents must not re-read it.
    rmSync(path.join(cwd, "src/util.ts"));
    writeIn(cwd, "src/main.ts", `${MAIN}export const extra = clamp(1, 0, 2);\n`);

    const result = session.applyEvents(["src/main.ts"], []);

    expect(result.written).toEqual(["src/main.ts.script"]);
    expect(readFileSync(path.join(cwd, "src/util.ts.script"), "utf8")).toBe(utilLuaBefore);
    expect(readFileSync(path.join(cwd, "src/main.ts.script"), "utf8")).not.toBe(mainLuaBefore);
  });

  test("applyEvents leaves an untouched sibling's output byte-identical", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/a.ts", "export const a = 1;\n");
    writeIn(cwd, "src/b.ts", "export const b = 2;\n");

    const session = createBuildSession({ cwd });
    session.buildAll();

    const bLuaBefore = readFileSync(path.join(cwd, "src/b.ts.script"), "utf8");
    const bMtimeBefore = statSync(path.join(cwd, "src/b.ts.script")).mtimeMs;

    writeIn(cwd, "src/a.ts", "export const a = 99;\n");
    session.applyEvents(["src/a.ts"], []);

    expect(readFileSync(path.join(cwd, "src/b.ts.script"), "utf8")).toBe(bLuaBefore);
    expect(statSync(path.join(cwd, "src/b.ts.script")).mtimeMs).toBe(bMtimeBefore);
  });

  test("applyEvents removes a deleted file's outputs and drops it from later builds", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/a.ts", "export const a = 1;\n");
    writeIn(cwd, "src/b.ts", "export const b = 2;\n");

    const session = createBuildSession({ cwd });
    session.buildAll();
    expect(existsSync(path.join(cwd, "src/b.ts.script"))).toBe(true);

    rmSync(path.join(cwd, "src/b.ts"));
    session.applyEvents([], ["src/b.ts"]);

    expect(existsSync(path.join(cwd, "src/b.ts.script"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/b.ts.script.map"))).toBe(false);

    // A subsequent unrelated edit does not resurrect b.ts.script.
    writeIn(cwd, "src/a.ts", "export const a = 3;\n");
    session.applyEvents(["src/a.ts"], []);
    expect(existsSync(path.join(cwd, "src/b.ts.script"))).toBe(false);
  });

  test("applyEvents ignores a non-source changed key without writing or throwing", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/main.ts", "export const a = 1;\n");

    const session = createBuildSession({ cwd });
    session.buildAll();

    const result = session.applyEvents(["src/main.ts.script"], []);
    expect(result.written).toEqual([]);
  });

  test("applyEvents emits the changed source while dropping a non-source removed key", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/main.ts", "export const a = 1;\n");

    const session = createBuildSession({ cwd });
    session.buildAll();

    writeIn(cwd, "src/main.ts", "export const a = 2;\n");
    const result = session.applyEvents(["src/main.ts"], ["src/old.ts.script"]);

    expect(result.written).toEqual(["src/main.ts.script"]);
    expect(readFileSync(path.join(cwd, "src/main.ts.script"), "utf8")).toContain("2");
  });

  test("a type error in a changed file throws the build-shaped error and the session stays usable", () => {
    writeIn(cwd, "tsconfig.json", DEFAULT_TSCONFIG);
    writeIn(cwd, "src/main.ts", "export const a = 1;\n");

    const session = createBuildSession({ cwd });
    session.buildAll();

    writeIn(cwd, "src/main.ts", 'const x: number = "oops";\n');
    expect(() => session.applyEvents(["src/main.ts"], [])).toThrow(/defold-typescript build/);

    writeIn(cwd, "src/main.ts", "export const a = 3;\n");
    const result = session.applyEvents(["src/main.ts"], []);
    expect(result.written).toEqual(["src/main.ts.script"]);
  });
});
