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

  test("reads the committed second luals target (decore) — the generality proof", () => {
    const targets = readLualsTargets(PACKAGE_ROOT);
    const decore = targets.find((t) => t.moduleId === "decore.decore");
    expect(decore).toBeDefined();
    expect(decore?.namespace).toBe("decore");
    expect(decore?.repo).toBe("https://github.com/Insality/decore");
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

  test("tags the decore entry as a LuaLS-sourced pure-Lua corpus member", () => {
    const entries = lualsCorpusTargets(PACKAGE_ROOT);
    const decore = entries.find((e) => e.moduleId === "decore.decore");
    expect(decore).toEqual({
      moduleId: "decore.decore",
      namespace: "decore",
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

  test("the second target (decore) yields a non-empty moduleFunctions surface — not hollow", () => {
    const decoreTarget = readLualsTargets(PACKAGE_ROOT).find((t) => t.moduleId === "decore.decore");
    if (!decoreTarget) throw new Error("decore target missing from luals-targets.json");
    const names = buildTargetModel(PACKAGE_ROOT, decoreTarget).moduleFunctions.map((f) => f.name);
    expect(names.length).toBeGreaterThan(0);
    expect(names).toContain("create");
    expect(names).toContain("register_component");
    expect(names).toContain("new_world");
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

describe("tweener migrated off the ts-defold corpus onto the LuaLS front-end", () => {
  test("tweener is a luals namespace and no longer a ts-defold target or classified dir", () => {
    const luals = readLualsTargets(PACKAGE_ROOT);
    expect(luals.some((t) => t.namespace === "tweener")).toBe(true);

    const targets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.targets.some((t) => t.module === "tweener.tweener")).toBe(false);

    const classification = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(classification.dirs.some((l) => l.dir === "defold-tweener")).toBe(false);
  });

  test("the retired ts-defold tweener artifacts are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "generated/tweener.tweener.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/tweener.tweener.d.ts"))).toBe(false);
  });
});

describe("event migrated off the ts-defold corpus onto the LuaLS front-end", () => {
  test("event is a luals namespace and no longer a ts-defold target or classified dir", () => {
    const luals = readLualsTargets(PACKAGE_ROOT);
    expect(luals.some((t) => t.namespace === "event")).toBe(true);

    const targets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.targets.some((t) => t.module === "event.event")).toBe(false);

    const classification = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(classification.dirs.some((l) => l.dir === "defold-event")).toBe(false);
  });

  test("the retired ts-defold event artifacts are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "generated/event.event.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/event.event.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/event.event.json"))).toBe(false);
  });
});

describe("lang migrated off the ts-defold corpus onto the LuaLS front-end", () => {
  test("lang is a luals namespace and no longer a ts-defold target or classified dir", () => {
    const luals = readLualsTargets(PACKAGE_ROOT);
    expect(luals.some((t) => t.namespace === "lang")).toBe(true);

    const targets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.targets.some((t) => t.module === "lang.lang")).toBe(false);

    const classification = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(classification.dirs.some((l) => l.dir === "defold-lang")).toBe(false);
  });

  test("the retired ts-defold lang artifacts are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "generated/lang.lang.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/lang.lang.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/lang.lang.json"))).toBe(false);
  });
});

describe("log migrated off the ts-defold corpus onto the LuaLS front-end", () => {
  test("log is a luals namespace and no longer a ts-defold target or classified dir", () => {
    const luals = readLualsTargets(PACKAGE_ROOT);
    expect(luals.some((t) => t.namespace === "log")).toBe(true);

    const targets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.targets.some((t) => t.module === "log.log")).toBe(false);

    const classification = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(classification.dirs.some((l) => l.dir === "defold-log")).toBe(false);
  });

  test("the retired ts-defold log artifacts are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "generated/log.log.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/log.log.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/log.log.json"))).toBe(false);
  });
});

describe("proto migrated off the ts-defold corpus onto the LuaLS front-end", () => {
  test("proto is a luals namespace and no longer a ts-defold target or classified dir", () => {
    const luals = readLualsTargets(PACKAGE_ROOT);
    expect(luals.some((t) => t.namespace === "proto")).toBe(true);

    const targets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.targets.some((t) => t.module === "proto.proto")).toBe(false);

    const classification = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(classification.dirs.some((l) => l.dir === "defold-proto")).toBe(false);
  });

  test("the retired ts-defold proto artifacts are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "generated/proto.proto.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/proto.proto.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/proto.proto.json"))).toBe(false);
  });
});

describe("immutable migrated off the ts-defold corpus onto the LuaLS front-end", () => {
  test("immutable is a luals namespace and no longer a ts-defold target or classified dir", () => {
    const luals = readLualsTargets(PACKAGE_ROOT);
    expect(luals.some((t) => t.namespace === "immutable")).toBe(true);

    const targets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.targets.some((t) => t.module === "immutable.immutable")).toBe(false);

    const classification = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(classification.dirs.some((l) => l.dir === "lua-immutable")).toBe(false);
  });

  test("the retired ts-defold immutable artifacts are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "generated/immutable.immutable.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/immutable.immutable.d.ts"))).toBe(
      false,
    );
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/immutable.immutable.json"))).toBe(false);
  });
});

describe("squid migrated off the ts-defold corpus onto the LuaLS front-end", () => {
  test("squid is a luals namespace and no longer a ts-defold target or classified dir", () => {
    const luals = readLualsTargets(PACKAGE_ROOT);
    expect(luals.some((t) => t.namespace === "squid")).toBe(true);

    const targets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.targets.some((t) => t.module === "squid.squid")).toBe(false);

    const classification = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(classification.dirs.some((l) => l.dir === "squid")).toBe(false);
  });

  test("the retired ts-defold squid artifacts are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "generated/squid.squid.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/squid.squid.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/squid.squid.json"))).toBe(false);
  });
});

describe("narrator migrated off the ts-defold corpus onto the LuaLS front-end", () => {
  test("narrator is a luals namespace and no longer a ts-defold target or classified dir", () => {
    const luals = readLualsTargets(PACKAGE_ROOT);
    expect(luals.some((t) => t.namespace === "narrator")).toBe(true);

    const targets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.targets.some((t) => t.module === "narrator.narrator")).toBe(false);

    const classification = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(classification.dirs.some((l) => l.dir === "narrator")).toBe(false);
  });

  test("the retired ts-defold narrator artifacts are gone", () => {
    expect(existsSync(join(PACKAGE_ROOT, "generated/narrator.narrator.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/narrator.narrator.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/narrator.narrator.json"))).toBe(false);
  });
});

describe("saver migrated off the ts-defold corpus onto the LuaLS front-end", () => {
  test("saver.saver and saver.storage are luals namespaces, no longer ts-defold targets or a classified dir", () => {
    const luals = readLualsTargets(PACKAGE_ROOT);
    expect(luals.some((t) => t.namespace === "saver.saver")).toBe(true);
    expect(luals.some((t) => t.namespace === "saver.storage")).toBe(true);

    const targets = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
    ) as { targets: { module: string }[] };
    expect(targets.targets.some((t) => t.module === "saver.saver")).toBe(false);
    expect(targets.targets.some((t) => t.module === "saver.storage")).toBe(false);

    const classification = JSON.parse(
      readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
    ) as { dirs: { dir: string }[] };
    expect(classification.dirs.some((l) => l.dir === "defold-saver")).toBe(false);
  });

  test("only the retired ts-defold saver fixtures are gone; the regenerated generated/api-doc persist in place", () => {
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/saver.saver.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "fixtures/ts-defold/saver.storage.d.ts"))).toBe(false);
    expect(existsSync(join(PACKAGE_ROOT, "generated/saver.saver.d.ts"))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, "generated/saver.storage.d.ts"))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/saver.saver.json"))).toBe(true);
    expect(existsSync(join(PACKAGE_ROOT, "api-doc/saver.storage.json"))).toBe(true);
  });
});

describe("narrator ingestion restricted to its public surface", () => {
  const NARRATOR_PUBLIC_INTERFACES = [
    "Narrator.Book.Version",
    "Narrator.Book",
    "Narrator.ParsingParams",
    "Narrator.Paragraph",
    "Narrator.Choice",
    "Narrator.State",
    "Narrator.Story",
  ];

  const narratorTarget = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === "narrator");

  test("sourceGlobs pin only the three type-bearing fixtures", () => {
    expect(narratorTarget?.sourceGlobs).toEqual([
      "narrator/annotations.lua",
      "narrator/narrator.lua",
      "narrator/story.lua",
    ]);
  });

  test("the model carries the public interfaces and drops the internal Object/constructor tables", () => {
    if (!narratorTarget) throw new Error("narrator target missing from luals-targets.json");
    const names = buildTargetModel(PACKAGE_ROOT, narratorTarget).interfaces.map((i) => i.name);
    for (const name of NARRATOR_PUBLIC_INTERFACES) expect(names).toContain(name);
    expect(names).not.toContain("Object");
    expect(names).not.toContain("constructor");
  });

  test("the committed api-doc declares no Object/constructor element", () => {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, "api-doc/narrator.json"), "utf8")) as {
      elements: { name: string }[];
    };
    const names = doc.elements.map((e) => e.name);
    expect(names).not.toContain("Object");
    expect(names).not.toContain("constructor");
  });
});

describe("narrator annotation overrides make the surface runtime-faithful", () => {
  const narratorTarget = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === "narrator");

  test("parse_content's trailing inclusions param is optional", () => {
    if (!narratorTarget) throw new Error("narrator target missing from luals-targets.json");
    const parseContent = buildTargetModel(PACKAGE_ROOT, narratorTarget).moduleFunctions.find(
      (f) => f.name === "parse_content",
    );
    expect(parseContent?.params.find((p) => p.name === "inclusions")?.isOptional).toBe(true);
  });

  test("Narrator.Story.continue returns the array-or-paragraph union", () => {
    if (!narratorTarget) throw new Error("narrator target missing from luals-targets.json");
    const story = buildTargetModel(PACKAGE_ROOT, narratorTarget).interfaces.find(
      (i) => i.name === "Narrator.Story",
    );
    const cont = story?.methods.find((m) => m.name === "continue");
    expect(cont?.returns).toHaveLength(1);
    expect(cont?.returns[0]?.types).toEqual(["Narrator.Paragraph[]|Narrator.Paragraph"]);
  });
});

describe("druid.drag's on_drag_callback override matches the runtime arity", () => {
  // Naive comma split: safe because no parameter type in this token carries a comma.
  // A future override that needs one should make this bracket-aware, not looser.
  function splitParams(body: string): { name: string; type: string }[] {
    return body
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

  function overrideToken(): string {
    const druid = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === "druid");
    if (!druid) throw new Error("druid target missing from luals-targets.json");
    const token =
      druid.annotationOverrides?.interfaces?.["druid.drag"]?.methods?.init?.params?.on_drag_callback
        ?.type;
    if (!token) throw new Error("druid.drag.init on_drag_callback override missing");
    return token;
  }

  function overrideParams(): { name: string; type: string }[] {
    const token = overrideToken();
    return splitParams(token.slice(token.indexOf("(") + 1, token.lastIndexOf(")")));
  }

  test("its parameter names equal the fixture's own on_drag_callback declaration", () => {
    const fixture = readFileSync(
      join(PACKAGE_ROOT, "fixtures/luals/druid/druid/custom/rich_input/rich_input.lua"),
      "utf8",
    );
    const declared = /^local function on_drag_callback\(([^)]*)\)/m.exec(fixture);
    if (!declared?.[1]) throw new Error("on_drag_callback declaration missing from rich_input.lua");
    expect(overrideParams().map((p) => p.name)).toEqual(
      splitParams(declared[1]).map((p) => p.name),
    );
  });

  test("it types the four deltas as number and the touch as touch", () => {
    expect(overrideParams()).toEqual([
      { name: "self", type: "any" },
      { name: "dx", type: "number" },
      { name: "dy", type: "number" },
      { name: "x", type: "number" },
      { name: "y", type: "number" },
      { name: "touch", type: "touch" },
    ]);
  });
});
