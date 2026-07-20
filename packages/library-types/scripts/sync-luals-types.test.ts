import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { emitLibraryDeclarations } from "./emit-library-dts";
import {
  buildTargetModel,
  type FetchText,
  fetchLualsFixtures,
  type ListLualsTree,
  type LualsTarget,
  lualsCorpusTargets,
  type ReadFixtureDir,
  readLualsTargets,
  selectLualsSources,
} from "./sync-luals-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// A per-entry druid target as it appears in a validated config — the LuaLS
// front-end pins `repo`/`ref` on each target instead of one shared `source`.
const DRUID: LualsTarget = {
  repo: "https://github.com/Insality/druid",
  ref: "1.2.5",
  sourceGlobs: ["druid/**/*.lua"],
  moduleId: "druid.druid",
  namespace: "druid",
  typeRenames: {},
  ignore: ["**/test/**", "**/example/**", "**/example_*/**"],
};

function writeConfig(config: unknown): string {
  const root = mkdtempSync(join(tmpdir(), "luals-types-config-"));
  writeFileSync(join(root, "luals-targets.json"), JSON.stringify(config));
  return root;
}

describe("readLualsTargets", () => {
  test("parses a druid entry into a typed target with expected moduleId/namespace", () => {
    const root = writeConfig({ targets: [DRUID] });
    const targets = readLualsTargets(root);
    expect(targets).toHaveLength(1);
    const [target] = targets;
    expect(target?.moduleId).toBe("druid.druid");
    expect(target?.namespace).toBe("druid");
    expect(target?.repo).toBe("https://github.com/Insality/druid");
    expect(target?.ref).toBe("1.2.5");
    expect(target?.sourceGlobs).toEqual(["druid/**/*.lua"]);
  });

  test("throws naming the missing field and the offending entry", () => {
    const { ref: _drop, ...missingRef } = DRUID;
    const root = writeConfig({ targets: [missingRef] });
    expect(() => readLualsTargets(root)).toThrow(/ref/);
    expect(() => readLualsTargets(root)).toThrow(/druid\.druid/);
  });

  test("names the entry index when moduleId itself is the missing field", () => {
    const { moduleId: _drop, ...missingModuleId } = DRUID;
    const root = writeConfig({ targets: [missingModuleId] });
    expect(() => readLualsTargets(root)).toThrow(/moduleId/);
    expect(() => readLualsTargets(root)).toThrow(/0/);
  });

  test("defaults typeRenames to {} and ignore to [] when omitted", () => {
    const { typeRenames: _tr, ignore: _ig, ...bare } = DRUID;
    const root = writeConfig({ targets: [bare] });
    const [target] = readLualsTargets(root);
    expect(target?.typeRenames).toEqual({});
    expect(target?.ignore).toEqual([]);
  });

  test("reads the committed druid seed", () => {
    const targets = readLualsTargets(PACKAGE_ROOT);
    const druid = targets.find((t) => t.moduleId === "druid.druid");
    expect(druid).toBeDefined();
    expect(druid?.namespace).toBe("druid");
    expect(druid?.repo).toBe("https://github.com/Insality/druid");
  });
});

describe("selectLualsSources", () => {
  test("includes glob matches, drops ignored/non-.lua/unmatched paths, sorted", () => {
    const paths = [
      "druid/widget/button/button.lua",
      "druid/druid.lua",
      "druid/test/foo.lua",
      "druid/example/demo.lua",
      "druid/readme.md",
      "other/thing.lua",
    ];
    expect(selectLualsSources(paths, DRUID)).toEqual([
      "druid/druid.lua",
      "druid/widget/button/button.lua",
    ]);
  });

  test("dedupes repeated paths", () => {
    const paths = ["druid/druid.lua", "druid/druid.lua"];
    expect(selectLualsSources(paths, DRUID)).toEqual(["druid/druid.lua"]);
  });
});

describe("fetchLualsFixtures", () => {
  test("writes only selected sources under fixtures/luals/<namespace>, fetching offline", async () => {
    const root = mkdtempSync(join(tmpdir(), "luals-types-fetch-"));
    const tree = ["druid/druid.lua", "druid/widget/button.lua", "druid/test/x.lua", "readme.md"];
    const fetched: string[] = [];
    const listTree: ListLualsTree = async () => tree;
    const fetchText: FetchText = async (url) => {
      fetched.push(url);
      return `-- ${url}\n`;
    };

    await fetchLualsFixtures(root, DRUID, { listTree, fetchText });

    // Only the selected paths are fetched — ignored and non-matching are skipped.
    expect(fetched).toEqual([
      "https://raw.githubusercontent.com/Insality/druid/1.2.5/druid/druid.lua",
      "https://raw.githubusercontent.com/Insality/druid/1.2.5/druid/widget/button.lua",
    ]);

    // Selected files land under fixtures/luals/<namespace>/<relpath>, tree shape preserved.
    const druidLua = join(root, "fixtures/luals/druid/druid/druid.lua");
    const buttonLua = join(root, "fixtures/luals/druid/druid/widget/button.lua");
    expect(existsSync(druidLua)).toBe(true);
    expect(existsSync(buttonLua)).toBe(true);
    expect(readFileSync(druidLua, "utf8")).toBe(
      "-- https://raw.githubusercontent.com/Insality/druid/1.2.5/druid/druid.lua\n",
    );

    // Ignored and non-matching paths are never written.
    expect(existsSync(join(root, "fixtures/luals/druid/druid/test/x.lua"))).toBe(false);
    expect(existsSync(join(root, "fixtures/luals/druid/readme.md"))).toBe(false);
  });
});

describe("lualsCorpusTargets", () => {
  test("tags the druid entry as a LuaLS-sourced pure-Lua corpus member", () => {
    const entries = lualsCorpusTargets(PACKAGE_ROOT);
    const druid = entries.find((e) => e.moduleId === "druid.druid");
    expect(druid).toEqual({
      moduleId: "druid.druid",
      namespace: "druid",
      classification: "pure-lua",
      source: "luals",
    });
  });
});

describe("buildTargetModel module ownership", () => {
  const DRUID_PUBLICS = [
    "new",
    "register",
    "set_default_style",
    "set_text_function",
    "set_sound_function",
    "init_window_listener",
    "on_window_callback",
    "on_language_change",
    "get_widget",
    "register_druid_as_widget",
    "unregister_druid_as_widget",
    "set_logger",
    "get_logger",
  ];

  const druidTarget = readLualsTargets(PACKAGE_ROOT).find((t) => t.moduleId === "druid.druid");

  test("scopes moduleFunctions to druid/druid.lua's own publics, dropping other files and locals", () => {
    if (!druidTarget) throw new Error("druid target missing from luals-targets.json");
    const names = buildTargetModel(PACKAGE_ROOT, druidTarget).moduleFunctions.map((f) => f.name);
    expect([...names].sort()).toEqual([...DRUID_PUBLICS].sort());
    expect(names).not.toContain("wrap_widget"); // druid.lua's `local function` helper
    expect(names).not.toContain("get_color"); // color.lua
    expect(names).not.toContain("utf8charbytes"); // system/utf8.lua
  });

  test("the set_text_function callback maps through emit to (text_id: string) => string", () => {
    if (!druidTarget) throw new Error("druid target missing from luals-targets.json");
    const emitted = emitLibraryDeclarations(buildTargetModel(PACKAGE_ROOT, druidTarget), {
      moduleId: druidTarget.moduleId,
      typeRenames: druidTarget.typeRenames,
    });
    expect(emitted).toContain(
      "export function set_text_function(this: void, callback: (text_id: string) => string): void;",
    );
  });

  test("a target whose moduleId has no matching .lua fixture throws, naming the expected path", () => {
    const bogus: LualsTarget = { ...DRUID, moduleId: "druid.nonexistent" };
    expect(() => buildTargetModel(PACKAGE_ROOT, bogus)).toThrow(/druid\/nonexistent\.lua/);
  });

  test("a Windows-style backslash readdir resolves druid.druid to the same moduleFunctions", () => {
    if (!druidTarget) throw new Error("druid target missing from luals-targets.json");
    const backslashReadDir: ReadFixtureDir = (root) =>
      readdirSync(root, { recursive: true }).map((entry) => String(entry).replace(/\//g, "\\"));
    const backslashNames = buildTargetModel(PACKAGE_ROOT, druidTarget, {
      readDir: backslashReadDir,
    }).moduleFunctions.map((f) => f.name);
    const posixNames = buildTargetModel(PACKAGE_ROOT, druidTarget).moduleFunctions.map(
      (f) => f.name,
    );
    expect([...backslashNames].sort()).toEqual([...posixNames].sort());
    expect([...backslashNames].sort()).toEqual([...DRUID_PUBLICS].sort());
  });
});
