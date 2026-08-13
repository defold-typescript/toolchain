import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { CheckboxPrompt } from "./wall-interactive";
import { buildWallChoices, runWallInteractive } from "./wall-interactive";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-wall-menu-"));
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

function readRefs(): { path: string }[] {
  return JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")).references ?? [];
}

describe("buildWallChoices", () => {
  test("single-kind dirs are selectable, checked iff currently walled; mixed dirs disabled", () => {
    writeRootTsconfig({ include: ["src/**/*.ts"], references: [{ path: "src/ui" }] });
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    touch("src/render/cam.ts", "export default defineRenderScript({});");
    touch("src/mix/a.ts", "export default defineScript({});");
    touch("src/mix/b.ts", "export default defineGuiScript({});");

    expect(buildWallChoices(cwd)).toEqual([
      { value: "src", name: "src", disabled: "mixed: gui-script, render-script, script" },
      { value: "src/mix", name: "src/mix", disabled: "mixed: gui-script, script" },
      { value: "src/render", name: "src/render (render-script)", checked: false },
      { value: "src/ui", name: "src/ui (gui-script)", checked: true },
    ]);
  });

  test("a component-free tree yields no choices", () => {
    writeRootTsconfig({ include: ["src/**/*.ts"] });
    touch("src/.gitkeep");
    expect(buildWallChoices(cwd)).toEqual([]);
  });

  test("an ancestor directory holding no direct sources is offered", () => {
    writeRootTsconfig({ include: ["src/**/*.ts"] });
    touch("src/gui/hud/a.ts", "export default defineGuiScript({});");
    touch("src/gui/menu/b.ts", "export default defineGuiScript({});");

    expect(buildWallChoices(cwd)).toEqual([
      { value: "src", name: "src (gui-script)", checked: false },
      { value: "src/gui", name: "src/gui (gui-script)", checked: false },
      { value: "src/gui/hud", name: "src/gui/hud (gui-script)", checked: false },
      { value: "src/gui/menu", name: "src/gui/menu (gui-script)", checked: false },
    ]);
  });

  test("a directory governed by an ancestor's wall is annotated, not pre-checked", () => {
    writeRootTsconfig({ include: ["src/**/*.ts"], references: [{ path: "src/gui" }] });
    touch("src/gui/hud/a.ts", "export default defineGuiScript({});");

    expect(buildWallChoices(cwd)).toEqual([
      { value: "src", name: "src (gui-script)", checked: false },
      { value: "src/gui", name: "src/gui (gui-script)", checked: true },
      {
        value: "src/gui/hud",
        name: "src/gui/hud (gui-script) [inherited from src/gui]",
        checked: false,
      },
    ]);
  });

  test("an editor-script directory is offered with its kind, like every other wallable kind", () => {
    writeRootTsconfig({ include: ["src/**/*.ts"] });
    touch("src/editor/menu.ts", "export default defineEditorScript({});");

    expect(buildWallChoices(cwd)).toEqual([
      { value: "src", name: "src (editor-script)", checked: false },
      { value: "src/editor", name: "src/editor (editor-script)", checked: false },
    ]);
  });
});

describe("runWallInteractive", () => {
  function scaffold(): void {
    writeRootTsconfig({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] });
    touch("src/ui/hud.ts", "export default defineGuiScript({});");
    touch("src/render/cam.ts", "export default defineRenderScript({});");
  }

  test("reconciles disk to the checkbox selection via applyWallSelection", async () => {
    scaffold();
    const checkbox: CheckboxPrompt = async () => ["src/ui"];

    const applied = await runWallInteractive(cwd, { checkbox });

    expect(applied.map((w) => w.dir)).toEqual(["src/ui"]);
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(true);
    expect(readRefs()).toEqual([{ path: "src/ui" }]);
  });

  test("an empty selection removes every existing wall", async () => {
    scaffold();
    await runWallInteractive(cwd, { checkbox: async () => ["src/ui", "src/render"] });

    const applied = await runWallInteractive(cwd, { checkbox: async () => [] });

    expect(applied).toEqual([]);
    expect(existsSync(path.join(cwd, "src/ui/tsconfig.json"))).toBe(false);
    expect(existsSync(path.join(cwd, "src/render/tsconfig.json"))).toBe(false);
    expect(readRefs()).toEqual([]);
  });

  test("passes the eligible choices to the injected checkbox", async () => {
    scaffold();
    let seen: { value: string }[] = [];
    const checkbox: CheckboxPrompt = async (opts) => {
      seen = opts.choices;
      return [];
    };

    await runWallInteractive(cwd, { checkbox });

    expect(seen.map((c) => c.value)).toEqual(["src", "src/render", "src/ui"]);
  });
});
