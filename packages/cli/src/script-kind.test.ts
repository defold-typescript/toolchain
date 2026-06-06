import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  DEFAULT_TYPES_ENTRYPOINT,
  detectScriptKinds,
  excludedModulesForKind,
  groupScriptKindsByDirectory,
  isComponentPath,
  isSkipped,
  type ScriptKind,
  selectDirectoryWalls,
  selectScriptKind,
  selectScriptKindEntrypoint,
} from "./script-kind";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-script-kind-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function touch(rel: string, contents = ""): void {
  const full = path.join(cwd, rel);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, contents);
}

describe("detectScriptKinds", () => {
  test("a dir with main/main.script returns {script}", () => {
    touch("main/main.script");
    expect(detectScriptKinds(cwd)).toEqual(new Set(["script"]));
  });

  test("a dir with ui/hud.gui_script returns {gui-script}", () => {
    touch("ui/hud.gui_script");
    expect(detectScriptKinds(cwd)).toEqual(new Set(["gui-script"]));
  });

  test("a dir with render/default.render_script returns {render-script}", () => {
    touch("render/default.render_script");
    expect(detectScriptKinds(cwd)).toEqual(new Set(["render-script"]));
  });

  test("extension disambiguation: a .gui_script does not count as a .script", () => {
    touch("ui/hud.gui_script");
    const kinds = detectScriptKinds(cwd);
    expect(kinds.has("script")).toBe(false);
    expect(kinds.has("gui-script")).toBe(true);
  });

  test("unions kinds across nested directories", () => {
    touch("main/main.script");
    touch("a/b/c/hud.gui_script");
    expect(detectScriptKinds(cwd)).toEqual(new Set(["script", "gui-script"]));
  });

  test("a dir with no script components returns an empty set", () => {
    touch("readme.txt");
    touch("art/sprite.png");
    touch("world.collection");
    expect(detectScriptKinds(cwd)).toEqual(new Set());
  });

  test("skips node_modules/, .defold-types/, and build/", () => {
    touch("node_modules/dep/example.script");
    touch(".defold-types/defold-1.12.4/something.script");
    touch("build/default/copy.script");
    expect(detectScriptKinds(cwd)).toEqual(new Set());
  });

  test("ignores generated <name>.ts.script output alongside a real component", () => {
    touch("src/main.ts.script");
    touch("ui/hud.gui_script");
    expect(detectScriptKinds(cwd)).toEqual(new Set(["gui-script"]));
  });
});

describe("groupScriptKindsByDirectory", () => {
  test("buckets each component file's kind by its immediate directory", () => {
    touch("ui/hud.gui_script");
    touch("render/cam.render_script");
    expect(groupScriptKindsByDirectory(cwd)).toEqual(
      new Map<string, Set<ScriptKind>>([
        ["ui", new Set(["gui-script"])],
        ["render", new Set(["render-script"])],
      ]),
    );
  });

  test("a root-level component is bucketed under the key '.'", () => {
    touch("main.script");
    expect(groupScriptKindsByDirectory(cwd)).toEqual(new Map([[".", new Set(["script"])]]));
  });

  test("a directory holding two kinds maps to a set containing both", () => {
    touch("a/x.script");
    touch("a/y.gui_script");
    expect(groupScriptKindsByDirectory(cwd)).toEqual(
      new Map([["a", new Set(["script", "gui-script"])]]),
    );
  });

  test("excludes generated artifacts and node_modules/.defold-types/build segments", () => {
    touch("src/main.ts.script");
    touch("node_modules/dep/example.script");
    touch(".defold-types/defold-1.12.4/something.script");
    touch("build/default/copy.script");
    touch("ui/hud.gui_script");
    expect(groupScriptKindsByDirectory(cwd)).toEqual(new Map([["ui", new Set(["gui-script"])]]));
  });
});

describe("selectDirectoryWalls", () => {
  test("keeps only single-kind directories, each mapped to its lone kind", () => {
    touch("ui/hud.gui_script");
    touch("render/cam.render_script");
    touch("mixed/x.script");
    touch("mixed/y.gui_script");
    expect(selectDirectoryWalls(cwd)).toEqual(
      new Map<string, ScriptKind>([
        ["ui", "gui-script"],
        ["render", "render-script"],
      ]),
    );
  });

  test("an empty tree yields no walls", () => {
    touch("readme.txt");
    expect(selectDirectoryWalls(cwd)).toEqual(new Map());
  });
});

describe("isComponentPath", () => {
  test("real Defold component extensions are components", () => {
    expect(isComponentPath("main/main.script")).toBe(true);
    expect(isComponentPath("ui/hud.gui_script")).toBe(true);
    expect(isComponentPath("render/default.render_script")).toBe(true);
  });

  test("generated <name>.ts.script output is not a component", () => {
    expect(isComponentPath("src/main.ts.script")).toBe(false);
    expect(isComponentPath("build/main.ts.script")).toBe(false);
  });

  test("non-component files are not components", () => {
    expect(isComponentPath("src/main.ts")).toBe(false);
    expect(isComponentPath("world.collection")).toBe(false);
  });
});

describe("isSkipped", () => {
  test("backslash skip segments are detected on any OS", () => {
    expect(isSkipped("node_modules\\dep\\x.script")).toBe(true);
    expect(isSkipped("build\\default\\copy.script")).toBe(true);
    expect(isSkipped(".defold-types\\defold-1.12.4\\index.d.ts")).toBe(true);
  });

  test("a backslash real component path is not skipped", () => {
    expect(isSkipped("src\\game\\hero.script")).toBe(false);
  });

  test("mixed separators still detect the skip segment", () => {
    expect(isSkipped("a\\node_modules/b.script")).toBe(true);
  });

  test("existing posix behavior is unchanged", () => {
    expect(isSkipped("node_modules/dep/x.script")).toBe(true);
    expect(isSkipped("src/main.script")).toBe(false);
  });
});

describe("selectScriptKindEntrypoint", () => {
  test("single gui-script -> @defold-typescript/types/gui-script", () => {
    expect(selectScriptKindEntrypoint(new Set(["gui-script"]))).toBe(
      "@defold-typescript/types/gui-script",
    );
  });

  test("single script -> @defold-typescript/types/script", () => {
    expect(selectScriptKindEntrypoint(new Set(["script"]))).toBe("@defold-typescript/types/script");
  });

  test("single render-script -> @defold-typescript/types/render-script", () => {
    expect(selectScriptKindEntrypoint(new Set(["render-script"]))).toBe(
      "@defold-typescript/types/render-script",
    );
  });

  test("zero kinds -> the full-surface default", () => {
    expect(selectScriptKindEntrypoint(new Set())).toBe(DEFAULT_TYPES_ENTRYPOINT);
  });

  test("multiple kinds -> the full-surface default", () => {
    expect(selectScriptKindEntrypoint(new Set(["script", "gui-script"]))).toBe(
      DEFAULT_TYPES_ENTRYPOINT,
    );
  });
});

describe("selectScriptKind", () => {
  test("a single kind -> that kind", () => {
    expect(selectScriptKind(new Set(["render-script"]))).toBe("render-script");
  });

  test("zero kinds -> null", () => {
    expect(selectScriptKind(new Set())).toBeNull();
  });

  test("multiple kinds -> null", () => {
    expect(selectScriptKind(new Set(["script", "gui-script"]))).toBeNull();
  });
});

describe("excludedModulesForKind", () => {
  test("script forbids both restricted namespaces", () => {
    expect(excludedModulesForKind("script")).toEqual(new Set(["gui", "render"]));
  });

  test("gui-script keeps gui, forbids render", () => {
    expect(excludedModulesForKind("gui-script")).toEqual(new Set(["render"]));
  });

  test("render-script keeps render, forbids gui", () => {
    expect(excludedModulesForKind("render-script")).toEqual(new Set(["gui"]));
  });

  test("null (mixed/zero) forbids nothing", () => {
    expect(excludedModulesForKind(null)).toEqual(new Set());
  });
});
