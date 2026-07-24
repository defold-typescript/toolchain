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
import { applyWallSelection, currentWalledDirs, eligibleWalls } from "./wall";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-wall-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function touch(rel: string, contents = ""): void {
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

function writeRootTsconfig(value: unknown): void {
  writeFileSync(path.join(cwd, "tsconfig.json"), `${JSON.stringify(value, null, 2)}\n`);
}

function readRootTsconfig(): {
  exclude?: string[];
  files?: string[];
  references?: { path: string }[];
} {
  return JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"));
}

describe("currentWalledDirs", () => {
  test("returns the sorted managed references of the root tsconfig", () => {
    writeRootTsconfig({ references: [{ path: "src/ui" }, { path: "src/render" }] });
    expect(currentWalledDirs(cwd)).toEqual(["src/render", "src/ui"]);
  });

  test("returns [] when there are no references", () => {
    writeRootTsconfig({ include: ["src/**/*.ts"] });
    expect(currentWalledDirs(cwd)).toEqual([]);
  });

  test("returns [] when there is no root tsconfig", () => {
    expect(currentWalledDirs(cwd)).toEqual([]);
  });
});

describe("eligibleWalls", () => {
  test("returns each single-kind source directory with its detected kind", () => {
    writeRootTsconfig({ include: ["src/**/*.ts"] });
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    touch("src/render/cam.ts", "export default defineRenderScript({});");
    expect(eligibleWalls(cwd)).toEqual([
      {
        dir: "src/render",
        kind: "render-script",
        typesEntrypoint: "@defold-typescript/types/render-script",
      },
      { dir: "src/ui", kind: "gui-script", typesEntrypoint: "@defold-typescript/types/gui-script" },
    ]);
  });

  test("excludes a mixed-kind directory", () => {
    writeRootTsconfig({ include: ["**/*.ts"] });
    touch("a/x.ts", "export default defineScript({});");
    touch("a/y.ts", "export default defineGuiScript({});");
    expect(eligibleWalls(cwd)).toEqual([]);
  });

  test("omits an editor-script-only directory (no per-kind entrypoint to narrow to)", () => {
    writeRootTsconfig({ include: ["src/**/*.ts"] });
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    touch("src/render/cam.ts", "export default defineRenderScript({});");
    touch("src/editor/menu.ts", "export default defineEditorScript({});");
    expect(eligibleWalls(cwd).map((w) => w.dir)).toEqual(["src/render", "src/ui"]);
  });
});

describe("applyWallSelection", () => {
  function scaffold(): void {
    writeRootTsconfig({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] });
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    touch("src/render/cam.ts", "export default defineRenderScript({});");
  }

  test("walling a new dir writes its composite tsconfig and wires the root", () => {
    scaffold();

    const applied = applyWallSelection(cwd, ["src/ui"]);

    expect(applied.map((w) => w.dir)).toEqual(["src/ui"]);
    expect(JSON.parse(readFileSync(path.join(cwd, "src/ui/tsconfig.json"), "utf8"))).toEqual({
      extends: "../../tsconfig.json",
      compilerOptions: {
        composite: true,
        typeRoots: null,
        types: ["@defold-typescript/types/gui-script"],
      },
      include: ["**/*.ts"],
      exclude: [],
    });
    expect(readRootTsconfig().references).toEqual([{ path: "src/ui" }]);
    expect(readRootTsconfig().exclude).toEqual(["src/ui"]);
  });

  test("dropping a dir deletes its child tsconfig and prunes the root wiring", () => {
    scaffold();
    applyWallSelection(cwd, ["src/ui", "src/render"]);
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(true);

    const applied = applyWallSelection(cwd, ["src/render"]);

    expect(applied.map((w) => w.dir)).toEqual(["src/render"]);
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
    expect(readRootTsconfig().references).toEqual([{ path: "src/render" }]);
    expect(readRootTsconfig().exclude).toEqual(["src/render"]);
  });

  test("dropping every wall removes the managed root graph keys", () => {
    scaffold();
    applyWallSelection(cwd, ["src/ui", "src/render"]);

    const applied = applyWallSelection(cwd, []);

    expect(applied).toEqual([]);
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/render/tsconfig.json"))).toBe(false);
    const root = readRootTsconfig();
    expect("references" in root).toBe(false);
    expect("exclude" in root).toBe(false);
  });

  test("re-running with the same set is a no-op (no file churn)", () => {
    scaffold();
    applyWallSelection(cwd, ["src/ui"]);
    const rootBefore = statSync(path.join(cwd, "tsconfig.json")).mtimeMs;
    const childBefore = statSync(path.join(cwd, "src/ui/tsconfig.json")).mtimeMs;

    applyWallSelection(cwd, ["src/ui"]);

    expect(statSync(path.join(cwd, "tsconfig.json")).mtimeMs).toBe(rootBefore);
    expect(statSync(path.join(cwd, "src/ui/tsconfig.json")).mtimeMs).toBe(childBefore);
  });

  test("a duplicate desired dir is walled once", () => {
    scaffold();
    const applied = applyWallSelection(cwd, ["src/ui", "src/ui"]);
    expect(applied.map((w) => w.dir)).toEqual(["src/ui"]);
    expect(readRootTsconfig().references).toEqual([{ path: "src/ui" }]);
  });

  test("selecting a mixed-kind directory is rejected and writes nothing", () => {
    writeRootTsconfig({ include: ["**/*.ts"] });
    touch("src/mix/x.ts", "export default defineScript({});");
    touch("src/mix/y.ts", "export default defineGuiScript({});");

    expect(() => applyWallSelection(cwd, ["src/mix"])).toThrow(/single-kind source directory/);
    expect(existsSync(path.join(cwd, "src/mix/tsconfig.json"))).toBe(false);
    expect("references" in readRootTsconfig()).toBe(false);
  });

  test("selecting an unknown directory is rejected and writes nothing", () => {
    scaffold();
    expect(() => applyWallSelection(cwd, ["src/nope"])).toThrow(/single-kind source directory/);
    expect("references" in readRootTsconfig()).toBe(false);
  });

  test("selecting an editor-script-only directory is rejected and writes nothing", () => {
    writeRootTsconfig({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] });
    touch("src/editor/menu.ts", "export default defineEditorScript({});");

    expect(() => applyWallSelection(cwd, ["src/editor"])).toThrow(/single-kind source directory/);
    expect(existsSync(path.join(cwd, "src/editor/tsconfig.json"))).toBe(false);
    expect("references" in readRootTsconfig()).toBe(false);
  });
});
