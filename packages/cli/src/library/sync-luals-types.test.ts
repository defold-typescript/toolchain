import { afterEach, describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FIXTURE_DATA_DIR, writeLibraryTargets } from "../library-data-fixture";
import { emitLibraryDeclarations, isPublicMethod } from "./emit-library-dts";
import { LIBRARY_DATA_DIR } from "./package-root";
import type { LibraryInterface, LibraryModel } from "./parse-luals";
import {
  buildTargetFidelity,
  buildTargetModel,
  type FetchText,
  fetchLualsFixtures,
  type ListLualsTree,
  type LualsTarget,
  lualsCorpusTargets,
  lualsFixtureTree,
  type ReadFixtureDir,
  readLualsTargets,
  selectLualsSources,
} from "./sync-luals-types";

const DATA_DIR = LIBRARY_DATA_DIR;

// A per-entry target as it appears in a validated config — the LuaLS front-end
// pins `repo`/`ref` on each target instead of one shared `source`.
const GLINT: LualsTarget = {
  repo: "https://github.com/example/glint",
  ref: "1.2.5",
  sourceGlobs: ["glint/**/*.lua"],
  moduleId: "glint.glint",
  namespace: "glint",
  typeRenames: {},
  ignore: ["**/test/**", "**/example/**", "**/example_*/**"],
  sourceDir: "example/glint/source/glint",
};

// A second library, in a folder that sorts after GLINT's.
const SPARK: LualsTarget = {
  repo: "https://github.com/example/spark",
  ref: "0.3.0",
  sourceGlobs: ["spark/**/*.lua"],
  moduleId: "spark.spark",
  namespace: "spark",
  typeRenames: {},
  ignore: [],
  sourceDir: "example/spark/source/spark",
};

// GLINT's sources, spread over several files: the module file with a local helper,
// a private function and a callback-typed setter; a sibling and a nested file with
// publics of their own; an internal file declaring a class only the module's
// signatures name; and a test file the ignore drops.
const GLINT_SOURCES: Record<string, string> = {
  "glint/glint.lua": [
    "local M = {}",
    "",
    "local function wrap_widget(widget)",
    "\treturn widget",
    "end",
    "",
    "---Create a new glint instance",
    "---@param context table the parent context",
    "---@return glint.adapter adapter",
    "function M.new(context)",
    "\treturn wrap_widget(context)",
    "end",
    "",
    "---@param callback fun(text_id: string): string Get localized text",
    "function M.set_text_function(callback)",
    "end",
    "",
    "---@private",
    "---@param dt number",
    "function M.update_animation(dt)",
    "end",
    "",
    "return M",
  ].join("\n"),
  "glint/color.lua": [
    "local M = {}",
    "",
    "---@param name string",
    "---@return vector4",
    "function M.get_color(name)",
    "end",
    "",
    "return M",
  ].join("\n"),
  "glint/system/utf8.lua": [
    "local M = {}",
    "",
    "---@param s string",
    "---@return integer",
    "function M.utf8charbytes(s)",
    "end",
    "",
    "return M",
  ].join("\n"),
  "glint/internal.lua": [
    "---@class glint.adapter",
    "---@field get_node fun(id: string): node",
    "local M = {}",
    "",
    "return M",
  ].join("\n"),
  "glint/test/helpers.lua": [
    "---@class glint.test_double",
    "---@field calls integer",
    "local M = {}",
    "",
    "return M",
  ].join("\n"),
};

const GLINT_MODULE_FUNCTIONS = ["new", "set_text_function", "update_animation"];

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(prefix: string): string {
  const root = mkdtempSync(join(tmpdir(), prefix));
  roots.push(root);
  return root;
}

function writeConfig(targets: Partial<LualsTarget>[]): string {
  const root = tempRoot("luals-types-config-");
  writeLibraryTargets(root, {
    luals: targets.map(({ sourceDir: _sourceDir, ...target }) => ({
      repo: GLINT.repo,
      ...target,
    })),
  });
  return root;
}

// GLINT's config with its sources vendored under its `sourceDir`, and the target
// read back from it.
function writeGlintLibrary(): { root: string; target: LualsTarget } {
  const root = writeConfig([GLINT]);
  for (const [rel, text] of Object.entries(GLINT_SOURCES)) {
    const file = join(root, GLINT.sourceDir, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  const [target] = readLualsTargets(root);
  if (!target) throw new Error("glint target missing from the written library");
  return { root, target };
}

function fixtureTarget(): LualsTarget {
  const target = readLualsTargets(FIXTURE_DATA_DIR).find((t) => t.moduleId === "glow-kit.glow");
  if (!target) throw new Error("glow-kit.glow target missing from the fixture data");
  return target;
}

describe("readLualsTargets", () => {
  test("parses an entry into a typed target with expected moduleId/namespace", () => {
    const root = writeConfig([GLINT]);
    const targets = readLualsTargets(root);
    expect(targets).toHaveLength(1);
    const [target] = targets;
    expect(target?.moduleId).toBe("glint.glint");
    expect(target?.namespace).toBe("glint");
    expect(target?.repo).toBe("https://github.com/example/glint");
    expect(target?.ref).toBe("1.2.5");
    expect(target?.sourceGlobs).toEqual(["glint/**/*.lua"]);
  });

  test("throws naming the missing field and the offending entry", () => {
    const { sourceGlobs: _drop, ...missingGlobs } = GLINT;
    const root = writeConfig([missingGlobs]);
    expect(() => readLualsTargets(root)).toThrow(/sourceGlobs/);
    expect(() => readLualsTargets(root)).toThrow(/glint\.glint/);
    expect(() => readLualsTargets(root)).toThrow("example/glint/recipe.json");
  });

  test("throws naming the library's reviewed.json when it pins no ref", () => {
    const { ref: _drop, ...missingRef } = GLINT;
    const root = writeConfig([missingRef]);
    expect(() => readLualsTargets(root)).toThrow("example/glint/reviewed.json");
  });

  test("names the entry index when moduleId itself is the missing field", () => {
    const { moduleId: _drop, ...missingModuleId } = GLINT;
    const root = writeConfig([missingModuleId]);
    expect(() => readLualsTargets(root)).toThrow(/moduleId/);
    expect(() => readLualsTargets(root)).toThrow(/0/);
  });

  test("defaults typeRenames to {} and ignore to [] when omitted", () => {
    const { typeRenames: _tr, ignore: _ig, ...bare } = GLINT;
    const root = writeConfig([bare]);
    const [target] = readLualsTargets(root);
    expect(target?.typeRenames).toEqual({});
    expect(target?.ignore).toEqual([]);
  });

  test("reads the committed fixture-luals target", () => {
    const targets = readLualsTargets(FIXTURE_DATA_DIR);
    const glow = targets.find((t) => t.moduleId === "glow-kit.glow");
    expect(glow).toBeDefined();
    expect(glow?.namespace).toBe("glow");
    expect(glow?.repo).toBe("https://github.com/example/fixture-luals");
  });

  test("passes externalTypes through when present and leaves it undefined when absent", () => {
    const externalTypes = { ext: { module: "other.mod", name: "ext" } };
    const withExternal = writeConfig([{ ...GLINT, externalTypes }]);
    expect(readLualsTargets(withExternal)[0]?.externalTypes).toEqual(externalTypes);

    const without = writeConfig([GLINT]);
    expect(readLualsTargets(without)[0]?.externalTypes).toBeUndefined();
  });

  test("every committed entry reads back with the fields its recipe declares", () => {
    const entries = readdirSync(FIXTURE_DATA_DIR)
      .sort()
      .flatMap((owner) =>
        readdirSync(join(FIXTURE_DATA_DIR, owner))
          .sort()
          .map((repo) => `${owner}/${repo}`),
      )
      .flatMap((dir) => {
        const recipe = join(FIXTURE_DATA_DIR, dir, "recipe.json");
        if (!existsSync(recipe)) return [];
        const { luals = [] } = JSON.parse(readFileSync(recipe, "utf8")) as {
          luals?: Record<string, unknown>[];
        };
        return luals;
      });
    const targets = readLualsTargets(FIXTURE_DATA_DIR);
    expect(targets).toHaveLength(entries.length);
    for (const [index, entry] of entries.entries()) {
      const target = targets[index] as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(entry)) expect(target[key]).toEqual(value);
    }
  });

  test("reads a second library's target with its own pin, in folder order — the generality proof", () => {
    const targets = readLualsTargets(writeConfig([SPARK, GLINT]));
    expect(targets.map((t) => [t.moduleId, t.namespace, t.repo, t.ref, t.sourceDir])).toEqual([
      ["glint.glint", "glint", GLINT.repo, "1.2.5", "example/glint/source/glint"],
      ["spark.spark", "spark", SPARK.repo, "0.3.0", "example/spark/source/spark"],
    ]);
  });
});

describe("selectLualsSources", () => {
  test("includes glob matches, drops ignored/non-.lua/unmatched paths, sorted", () => {
    const paths = [
      "glint/widget/button/button.lua",
      "glint/glint.lua",
      "glint/test/foo.lua",
      "glint/example/demo.lua",
      "glint/readme.md",
      "other/thing.lua",
    ];
    expect(selectLualsSources(paths, GLINT)).toEqual([
      "glint/glint.lua",
      "glint/widget/button/button.lua",
    ]);
  });

  test("dedupes repeated paths", () => {
    const paths = ["glint/glint.lua", "glint/glint.lua"];
    expect(selectLualsSources(paths, GLINT)).toEqual(["glint/glint.lua"]);
  });
});

describe("fetchLualsFixtures", () => {
  test("writes only selected sources under the target's sourceDir, fetching offline", async () => {
    const root = tempRoot("luals-types-fetch-");
    const tree = ["glint/glint.lua", "glint/widget/button.lua", "glint/test/x.lua", "readme.md"];
    const fetched: string[] = [];
    const listTree: ListLualsTree = async () => tree;
    const fetchText: FetchText = async (url) => {
      fetched.push(url);
      return `-- ${url}\n`;
    };

    await fetchLualsFixtures(root, GLINT, { listTree, fetchText });

    // Only the selected paths are fetched — ignored and non-matching are skipped.
    expect(fetched).toEqual([
      "https://raw.githubusercontent.com/example/glint/1.2.5/glint/glint.lua",
      "https://raw.githubusercontent.com/example/glint/1.2.5/glint/widget/button.lua",
    ]);

    // Selected files land under <sourceDir>/<relpath>, tree shape preserved.
    const glintLua = join(root, "example/glint/source/glint/glint/glint.lua");
    const buttonLua = join(root, "example/glint/source/glint/glint/widget/button.lua");
    expect(existsSync(glintLua)).toBe(true);
    expect(existsSync(buttonLua)).toBe(true);
    expect(readFileSync(glintLua, "utf8")).toBe(
      "-- https://raw.githubusercontent.com/example/glint/1.2.5/glint/glint.lua\n",
    );

    // Ignored and non-matching paths are never written.
    expect(existsSync(join(root, "example/glint/source/glint/glint/test/x.lua"))).toBe(false);
    expect(existsSync(join(root, "example/glint/source/glint/readme.md"))).toBe(false);
  });
});

describe("lualsCorpusTargets", () => {
  test("tags the committed fixture-luals entry as a LuaLS-sourced pure-Lua corpus member", () => {
    const entries = lualsCorpusTargets(FIXTURE_DATA_DIR);
    const glow = entries.find((e) => e.moduleId === "glow-kit.glow");
    expect(glow).toEqual({
      moduleId: "glow-kit.glow",
      namespace: "glow",
      classification: "pure-lua",
      source: "luals",
    });
  });

  test("tags every library's entry as a LuaLS-sourced pure-Lua corpus member", () => {
    expect(lualsCorpusTargets(writeConfig([GLINT, SPARK]))).toEqual([
      { moduleId: "glint.glint", namespace: "glint", classification: "pure-lua", source: "luals" },
      { moduleId: "spark.spark", namespace: "spark", classification: "pure-lua", source: "luals" },
    ]);
  });
});

describe("buildTargetModel module ownership", () => {
  test("scopes moduleFunctions to glint/glint.lua's own functions, dropping other files and locals", () => {
    const { root, target } = writeGlintLibrary();
    const names = buildTargetModel(root, target).moduleFunctions.map((f) => f.name);
    expect([...names].sort()).toEqual([...GLINT_MODULE_FUNCTIONS].sort());
    expect(names).not.toContain("wrap_widget"); // glint.lua's `local function` helper
    expect(names).not.toContain("get_color"); // color.lua
    expect(names).not.toContain("utf8charbytes"); // system/utf8.lua
  });

  test("the committed fixture-luals target yields its module functions — not hollow", () => {
    const names = buildTargetModel(FIXTURE_DATA_DIR, fixtureTarget()).moduleFunctions.map(
      (f) => f.name,
    );
    expect(names).toEqual(["configure", "enable", "set_predicate", "setup"]);
  });

  test("the set_text_function callback maps through emit to (text_id: string) => string", () => {
    const { root, target } = writeGlintLibrary();
    const emitted = emitLibraryDeclarations(buildTargetModel(root, target), {
      moduleId: target.moduleId,
      typeRenames: target.typeRenames,
    });
    expect(emitted).toContain(
      "export function set_text_function(this: void, callback: (text_id: string) => string): void;",
    );
  });

  test("a target whose moduleId has no matching .lua fixture throws, naming the expected path", () => {
    const { root } = writeGlintLibrary();
    const bogus: LualsTarget = { ...GLINT, moduleId: "glint.nonexistent" };
    expect(() => buildTargetModel(root, bogus)).toThrow(/glint\/nonexistent\.lua/);
  });

  test("a Windows-style backslash readdir resolves glint.glint to the same moduleFunctions", () => {
    const { root, target } = writeGlintLibrary();
    const backslashReadDir: ReadFixtureDir = (dir) =>
      readdirSync(dir, { recursive: true }).map((entry) => String(entry).replace(/\//g, "\\"));
    const backslashNames = buildTargetModel(
      root,
      target,
      lualsFixtureTree(root, target, { readDir: backslashReadDir }),
    ).moduleFunctions.map((f) => f.name);
    const posixNames = buildTargetModel(root, target).moduleFunctions.map((f) => f.name);
    expect([...backslashNames].sort()).toEqual([...posixNames].sort());
    expect([...backslashNames].sort()).toEqual([...GLINT_MODULE_FUNCTIONS].sort());
  });

  // `update_animation` is parsed (it is a real `M.` function) but tagged
  // `---@private`, so it must survive parsing and be dropped by the public
  // projection every emit surface shares.
  test("update_animation is parsed private and excluded from the public projection", () => {
    const { root, target } = writeGlintLibrary();
    const moduleFunctions = buildTargetModel(root, target).moduleFunctions;
    expect(moduleFunctions.find((f) => f.name === "update_animation")?.visibility).toBe("private");
    expect(moduleFunctions.filter(isPublicMethod).map((f) => f.name)).not.toContain(
      "update_animation",
    );
  });

  // `glint.adapter` is declared in `glint/internal.lua`, not in the module file —
  // so a `sourceGlobs` narrowed to `glint/glint.lua` would strand it. The ignored
  // test file's class stays out.
  test("the merged model declares the interfaces that live outside the module file", () => {
    const { root, target } = writeGlintLibrary();
    const names = buildTargetModel(root, target).interfaces.map((i) => i.name);
    expect(names).toContain("glint.adapter");
    expect(names).not.toContain("glint.test_double");
  });
});

describe("buildTargetModel annotation overrides", () => {
  test("a moduleFunctions override replaces the parsed param with exactly the configured token", () => {
    const target = fixtureTarget();
    const token = target.annotationOverrides?.moduleFunctions?.setup?.params?.self?.type;
    if (token === undefined) {
      throw new Error("fixture-luals carries no annotationOverrides type for setup's self param");
    }
    const selfTypes = (built: LualsTarget) =>
      buildTargetModel(FIXTURE_DATA_DIR, built)
        .moduleFunctions.find((f) => f.name === "setup")
        ?.params.find((p) => p.name === "self")?.types;
    expect(selfTypes(target)).toEqual([token]);
    const { annotationOverrides: _, ...upstream } = target;
    expect(selfTypes(upstream)).toEqual([]);
  });
});

describe("buildTargetFidelity", () => {
  // Built live rather than read off a committed report: dropping the `vector4`
  // rename must red here on the config alone, without a regen first.
  test("every LuaLS token the fixture-luals target writes resolves — no unknown fallback", () => {
    const report = buildTargetFidelity(FIXTURE_DATA_DIR, fixtureTarget());
    expect(report.unknownTokens).toEqual([]);
    expect(report.unknownFallbacks).toBe(0);
  });

  test("the bare `vector4` token is resolved by the target's rename, not by the core map", () => {
    const report = buildTargetFidelity(FIXTURE_DATA_DIR, { ...fixtureTarget(), typeRenames: {} });
    expect(report.unknownTokens).toEqual(["vector4"]);
  });
});

describe("panthera ingestion spans the subtree and hides its private module function", () => {
  function pantheraTarget(): LualsTarget {
    const target = readLualsTargets(DATA_DIR).find((t) => t.namespace === "panthera");
    if (!target) throw new Error("panthera target missing from library data");
    return target;
  }

  // tweener is a runtime `require` only: no annotation names a `tweener` type, so
  // declaring it as an externalTypes dependency would be a fiction.
  test("panthera declares no externalTypes — tweener is a runtime-only companion", () => {
    expect(pantheraTarget().externalTypes).toBeUndefined();
  });
});

describe("narrator annotation overrides make the surface runtime-faithful", () => {
  function narratorTarget(): LualsTarget {
    const target = readLualsTargets(DATA_DIR).find((t) => t.namespace === "narrator");
    if (!target) throw new Error("narrator target missing from library data");
    return target;
  }

  // Naive comma split: safe because no parameter type in this token carries a comma.
  function splitObserverParams(token: string): { name: string; type: string }[] {
    return token
      .slice(token.indexOf("(") + 1, token.lastIndexOf(")"))
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const colon = entry.indexOf(":");
        return colon === -1
          ? { name: entry, type: "" }
          : { name: entry.slice(0, colon).trim(), type: entry.slice(colon + 1).trim() };
      });
  }

  function storyMember(model: LibraryModel): LibraryInterface {
    const story = model.interfaces.find((i) => i.name === "Narrator.Story");
    if (!story) throw new Error("Narrator.Story missing from the built model");
    return story;
  }

  function observerParams(model: LibraryModel): { name: string; type: string }[] {
    const types = storyMember(model)
      .methods.find((m) => m.name === "observe")
      ?.params.find((p) => p.name === "observer")?.types;
    if (types?.length !== 1 || !types[0]) {
      throw new Error(
        `Narrator.Story.observe observer: expected one type token, saw ${JSON.stringify(types)}`,
      );
    }
    return splitObserverParams(types[0]);
  }

  // The observed value is whatever was just written into the variable store, so the
  // store's own declared value type is the callback argument's source of truth.
  function expectedObserverParamType(model: LibraryModel): string {
    const field = storyMember(model).fields.find((f) => f.name === "variables");
    const token = field?.types.length === 1 ? field.types[0] : undefined;
    if (!token) {
      throw new Error(
        `Narrator.Story.variables: expected one type token, saw ${JSON.stringify(field?.types)}`,
      );
    }
    const match = /^table<\s*string\s*,\s*(.+?)\s*>$/.exec(token);
    if (!match?.[1]) {
      throw new Error(
        `Narrator.Story.variables: expected a "table<string, V>" token, saw "${token}"`,
      );
    }
    return match[1];
  }

  test("its callback's argument type equals the variable store's declared value type", () => {
    const model = buildTargetModel(DATA_DIR, narratorTarget());
    expect(observerParams(model).map((p) => p.type)).toEqual([expectedObserverParamType(model)]);
  });

  test("a retyped variable store reds that comparison, proving the derivation is live", () => {
    const target = narratorTarget();
    const root = tempRoot("luals-types-narrator-store-");
    const sourceRoot = join(root, target.sourceDir);
    cpSync(join(DATA_DIR, target.sourceDir), sourceRoot, { recursive: true });

    const storyPath = join(sourceRoot, "narrator/story.lua");
    const original = readFileSync(storyPath, "utf8");
    const mutated = original.replace(
      "---@field variables table<string, any>",
      "---@field variables table<string, string>",
    );
    if (mutated === original) throw new Error("variable store field missing from story.lua");
    writeFileSync(storyPath, mutated);

    // The committed target, so the override still declares `fun(value: any)`.
    const mutatedModel = buildTargetModel(root, target);
    expect(expectedObserverParamType(mutatedModel)).toBe("string");
    expect(observerParams(mutatedModel).map((p) => p.type)).not.toEqual(["string"]);

    const pristine = buildTargetModel(DATA_DIR, target);
    expect(expectedObserverParamType(pristine)).toBe("any");
  });

  // Counts, not names: Lua passes arguments by position, so a renamed parameter is
  // harmless while an added or dropped one is not.
  test("its callback takes as many parameters as the runtime's observer call passes", () => {
    const target = narratorTarget();
    const story = readFileSync(join(DATA_DIR, target.sourceDir, "narrator/story.lua"), "utf8");
    const invoked = /^\s*observer\(([^)]*)\)/m.exec(story);
    if (!invoked) throw new Error("observer invocation missing from story.lua");
    const argumentCount = (invoked[1] ?? "")
      .split(",")
      .filter((entry) => entry.trim().length > 0).length;

    expect(observerParams(buildTargetModel(DATA_DIR, target))).toHaveLength(argumentCount);
  });
});
