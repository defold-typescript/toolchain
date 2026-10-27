import { describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { emitLibraryDeclarations, isPublicMethod } from "./emit-library-dts";
import type { LibraryInterface, LibraryModel } from "./parse-luals";
import {
  buildTargetFidelity,
  buildTargetModel,
  type FetchText,
  fetchLualsFixtures,
  type ListLualsTree,
  type LualsTarget,
  listTargetFixtures,
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

  test("passes externalTypes through when present and leaves it undefined when absent", () => {
    const externalTypes = { ext: { module: "other.mod", name: "ext" } };
    const withExternal = writeConfig({ targets: [{ ...DRUID, externalTypes }] });
    expect(readLualsTargets(withExternal)[0]?.externalTypes).toEqual(externalTypes);

    const without = writeConfig({ targets: [DRUID] });
    expect(readLualsTargets(without)[0]?.externalTypes).toBeUndefined();
  });

  test("every committed entry reads back with the fields its config declares", () => {
    const raw = JSON.parse(readFileSync(join(PACKAGE_ROOT, "luals-targets.json"), "utf8")) as {
      targets: Record<string, unknown>[];
    };
    const targets = readLualsTargets(PACKAGE_ROOT);
    expect(targets).toHaveLength(raw.targets.length);
    for (const [index, entry] of raw.targets.entries()) {
      const target = targets[index] as unknown as Record<string, unknown>;
      for (const [key, value] of Object.entries(entry)) expect(target[key]).toEqual(value);
    }
  });

  test("reads the committed second luals target (decore) — the generality proof", () => {
    const targets = readLualsTargets(PACKAGE_ROOT);
    const decore = targets.find((t) => t.moduleId === "decore.decore");
    expect(decore).toBeDefined();
    expect(decore?.namespace).toBe("decore");
    expect(decore?.repo).toBe("https://github.com/Insality/decore");
  });
});

describe("druid's external event dependency", () => {
  const targets = readLualsTargets(PACKAGE_ROOT);

  test("the druid target resolves `event` to the committed event target's own moduleId", () => {
    const druid = targets.find((t) => t.moduleId === "druid.druid");
    const event = targets.find((t) => t.namespace === "event");
    expect(event?.moduleId).toBeDefined();
    expect(druid?.externalTypes?.event).toEqual({
      module: event?.moduleId as string,
      name: "event",
    });
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
    "get_druid",
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

  test("its callback's argument type equals the variable store's declared value type", () => {
    if (!narratorTarget) throw new Error("narrator target missing from luals-targets.json");
    const model = buildTargetModel(PACKAGE_ROOT, narratorTarget);
    expect(observerParams(model).map((p) => p.type)).toEqual([expectedObserverParamType(model)]);
  });

  test("a retyped variable store reds that comparison, proving the derivation is live", () => {
    if (!narratorTarget) throw new Error("narrator target missing from luals-targets.json");
    const root = mkdtempSync(join(tmpdir(), "luals-types-narrator-store-"));
    const fixtureRoot = join(root, "fixtures/luals/narrator");
    cpSync(join(PACKAGE_ROOT, "fixtures/luals/narrator"), fixtureRoot, { recursive: true });

    const storyPath = join(fixtureRoot, "narrator/story.lua");
    const original = readFileSync(storyPath, "utf8");
    const mutated = original.replace(
      "---@field variables table<string, any>",
      "---@field variables table<string, string>",
    );
    if (mutated === original) throw new Error("variable store field missing from story.lua");
    writeFileSync(storyPath, mutated);

    // The committed target, so the override still declares `fun(value: any)`.
    const mutatedModel = buildTargetModel(root, narratorTarget);
    expect(expectedObserverParamType(mutatedModel)).toBe("string");
    expect(observerParams(mutatedModel).map((p) => p.type)).not.toEqual(["string"]);

    const pristine = buildTargetModel(PACKAGE_ROOT, narratorTarget);
    expect(expectedObserverParamType(pristine)).toBe("any");
  });

  test("its callback parameters equal the fixture's own observer invocation", () => {
    // Naive comma split: safe because no parameter type in this token carries a comma.
    const paramNames = (body: string): string[] =>
      body
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => {
          const colon = entry.indexOf(":");
          return (colon === -1 ? entry : entry.slice(0, colon)).trim();
        });

    const token =
      narratorTarget?.annotationOverrides?.interfaces?.["Narrator.Story"]?.methods?.observe?.params
        ?.observer?.type;
    if (!token) throw new Error("Narrator.Story.observe observer override missing");

    const fixture = readFileSync(
      join(PACKAGE_ROOT, "fixtures/luals/narrator/narrator/story.lua"),
      "utf8",
    );
    const invoked = /^\s*observer\(([^)]*)\)/m.exec(fixture);
    if (!invoked) throw new Error("observer invocation missing from story.lua");

    expect(paramNames(token.slice(token.indexOf("(") + 1, token.lastIndexOf(")")))).toEqual(
      paramNames(invoked[1] ?? ""),
    );
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

describe("panthera ingestion spans the subtree and hides its private module function", () => {
  const PANTHERA_MODULE_FUNCTIONS = ["create_go", "create_gui", "create", "play", "play_tweener"];

  function pantheraTarget(): LualsTarget {
    const target = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === "panthera");
    if (!target) throw new Error("panthera target missing from luals-targets.json");
    return target;
  }

  test("the public module surface carries the constructors and both playback entry points", () => {
    const names = buildTargetModel(PACKAGE_ROOT, pantheraTarget())
      .moduleFunctions.filter(isPublicMethod)
      .map((f) => f.name);
    for (const name of PANTHERA_MODULE_FUNCTIONS) expect(names).toContain(name);
  });

  // `update_animation` is parsed (it is a real `M.` function) but tagged
  // `---@private`, so it must survive parsing and be dropped by the public
  // projection every emit surface shares.
  test("update_animation is parsed private and excluded from the public projection", () => {
    const moduleFunctions = buildTargetModel(PACKAGE_ROOT, pantheraTarget()).moduleFunctions;
    expect(moduleFunctions.find((f) => f.name === "update_animation")?.visibility).toBe("private");
    expect(moduleFunctions.filter(isPublicMethod).map((f) => f.name)).not.toContain(
      "update_animation",
    );
  });

  test("the committed api-doc declares the public functions and no private one", () => {
    const doc = JSON.parse(readFileSync(join(PACKAGE_ROOT, "api-doc/panthera.json"), "utf8")) as {
      elements: { name: string }[];
    };
    const names = doc.elements.map((e) => e.name);
    for (const name of PANTHERA_MODULE_FUNCTIONS) expect(names).toContain(name);
    expect(names).not.toContain("update_animation");
  });

  // `panthera.adapter` is declared in `panthera_internal.lua`, not in the module
  // file — so a `sourceGlobs` narrowed to `panthera/panthera.lua` would strand it.
  test("the merged model declares the interfaces that live outside the module file", () => {
    const names = buildTargetModel(PACKAGE_ROOT, pantheraTarget()).interfaces.map((i) => i.name);
    expect(names).toContain("panthera.adapter");
    expect(names).toContain("panthera.logger");
    expect(names).toContain("panthera.animation.data");
  });

  // Built live rather than read off `fidelity/panthera.json`: dropping the
  // `vector` rename must red here on the config alone, without a regen first.
  test("every LuaLS token panthera writes resolves — no unknown fallback", () => {
    const report = buildTargetFidelity(PACKAGE_ROOT, pantheraTarget());
    expect(report.unknownTokens).toEqual([]);
    expect(report.unknownFallbacks).toBe(0);
  });

  // `panthera_internal.lua` annotates `easing_custom number[]|vector|nil`, and bare
  // `vector` is absent from CORE_TYPE_RENAMES — only the dotted `vmath.vector` is.
  test("the bare `vector` token is renamed by the target, not by the core map", () => {
    expect(pantheraTarget().typeRenames.vector).toBe("Vector");
  });

  // tweener is a runtime `require` only: no annotation names a `tweener` type, so
  // declaring it as an externalTypes dependency would be a fiction.
  test("panthera declares no externalTypes — tweener is a runtime-only companion", () => {
    expect(pantheraTarget().externalTypes).toBeUndefined();
  });
});

describe("detiled, token and quest ingest their module surfaces and inherit their event members", () => {
  function target(namespace: string): LualsTarget {
    const found = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === namespace);
    if (!found) throw new Error(`${namespace} target missing from luals-targets.json`);
    return found;
  }

  test.each([
    ["detiled", ["parse", "cell_to_pos", "pos_to_cell", "load_tileset"]],
    ["token", ["container", "init", "delete_container"]],
    ["quest", ["event", "start_quest", "complete_quest"]],
  ])("%s's public module surface carries its documented entry points", (namespace, expected) => {
    const names = buildTargetModel(PACKAGE_ROOT, target(namespace))
      .moduleFunctions.filter(isPublicMethod)
      .map((f) => f.name);
    for (const name of expected) expect(names).toContain(name);
  });

  // Upstream restates event's `trigger` and `subscribe` as `fun(_, ...)` fields on
  // every typed event; emitted as-is they fail `extends event` and make a TS caller
  // pass a dummy first argument. The overrides drop them so the inherited methods,
  // called with a colon as Lua does, are the only ones.
  test.each([
    ["token", "token.container.event.on_token_change", "event"],
    ["token", "token.container.event.on_token_visual_change", "event"],
    ["token", "token.event.on_token_change", "event"],
    ["token", "token.event.on_token_visual_change", "event"],
    ["token", "token.event.on_token_restore_change", "event"],
    ["quest", "quest.event.is_can_start", "event"],
    ["quest", "quest.event.is_can_complete", "event"],
    ["quest", "quest.event.is_can_event", "event"],
    ["quest", "quest.queue.quest_event", "queue"],
  ])("%s's %s extends %s without restating trigger or subscribe", (namespace, name, parent) => {
    const iface = buildTargetModel(PACKAGE_ROOT, target(namespace)).interfaces.find(
      (i) => i.name === name,
    );
    expect(iface?.extends).toBe(parent);
    const members = [...(iface?.fields ?? []), ...(iface?.methods ?? [])].map((m) => m.name);
    expect(members).not.toContain("trigger");
    expect(members).not.toContain("subscribe");
  });

  // Upstream binds each event's `---@class` to a module-table assignment
  // (`M.on_token_change = event.create()`), which the parser does not lift to a module
  // value; the `moduleObject` override does.
  test.each([
    ["token", "on_token_change", "token.event.on_token_change"],
    ["token", "on_token_visual_change", "token.event.on_token_visual_change"],
    ["token", "on_token_restore_change", "token.event.on_token_restore_change"],
    ["quest", "on_quest_event", "quest.queue.quest_event"],
    ["quest", "is_can_start", "quest.event.is_can_start"],
    ["quest", "is_can_complete", "quest.event.is_can_complete"],
    ["quest", "is_can_event", "quest.event.is_can_event"],
  ])("%s exports its module value %s typed %s", (namespace, name, type) => {
    const model = buildTargetModel(PACKAGE_ROOT, target(namespace));
    expect(model.moduleObject).toBe(namespace);
    const field = model.interfaces
      .find((i) => i.name === namespace)
      ?.fields.find((f) => f.name === name);
    expect(field?.types).toEqual([type]);
  });

  function getReturnTypes(model: LibraryModel, iface: string): string[][] | undefined {
    return model.interfaces
      .find((i) => i.name === iface)
      ?.methods.find((m) => m.name === "get")
      ?.returns.map((r) => r.types);
  }

  // The runtime's `container:get` is `return token:get()`, so it returns exactly what
  // `token.value`'s `get` does.
  test("token.container's get returns what its token.value delegate's get returns", () => {
    const model = buildTargetModel(PACKAGE_ROOT, target("token"));
    const delegate = getReturnTypes(model, "token.value");
    expect(delegate).toHaveLength(1);
    expect(getReturnTypes(model, "token.container")).toEqual(delegate);
  });

  test("upstream still annotates token.container's get as number|any", () => {
    const { annotationOverrides: _, ...upstream } = target("token");
    const model = buildTargetModel(PACKAGE_ROOT, upstream);
    expect(getReturnTypes(model, "token.container")).toEqual([["number|any"]]);
  });

  // Built live rather than read off `fidelity/<namespace>.json`: dropping the
  // `event` or `queue` external entry, or keeping quest's stray `_)` field, must
  // red here on the config alone, without a regen first.
  test.each([
    "token",
    "quest",
  ])("every LuaLS token %s writes resolves — no unknown fallback", (namespace) => {
    const report = buildTargetFidelity(PACKAGE_ROOT, target(namespace));
    expect(report.unknownTokens).toEqual([]);
    expect(report.unknownFallbacks).toBe(0);
  });
});

describe("pigeon ingests its message API and drops the base letter's restated data", () => {
  function pigeonTarget(): LualsTarget {
    const found = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === "pigeon");
    if (!found) throw new Error("pigeon target missing from luals-targets.json");
    return found;
  }

  test("pigeon's public module surface carries its message entry points", () => {
    const names = buildTargetModel(PACKAGE_ROOT, pigeonTarget())
      .moduleFunctions.filter(isPublicMethod)
      .map((f) => f.name);
    for (const name of ["define", "subscribe", "send", "send_to"]) expect(names).toContain(name);
  });

  // The `Letter*` subclasses restate `data` as their own message shape or as optional,
  // which the base's required `data` rejects under `extends`; dropping the base field
  // leaves each subclass its own.
  test("BaseLetterDefinition carries no data field while a letter subclass keeps its own", () => {
    const interfaces = buildTargetModel(PACKAGE_ROOT, pigeonTarget()).interfaces;
    const fieldNames = (name: string): string[] => {
      const iface = interfaces.find((i) => i.name === name);
      if (!iface) throw new Error(`${name} missing from the pigeon model`);
      return iface.fields.map((f) => f.name);
    };
    expect(fieldNames("BaseLetterDefinition")).not.toContain("data");
    expect(fieldNames("LetterSetCamera")).toContain("data");
  });

  // Built live, so dropping the `vector*` renames reds here on the config alone.
  test("every LuaLS token pigeon writes resolves — no unknown fallback", () => {
    const report = buildTargetFidelity(PACKAGE_ROOT, pigeonTarget());
    expect(report.unknownTokens).toEqual([]);
    expect(report.unknownFallbacks).toBe(0);
  });

  test("pigeon's sourceGlobs keep every fixture its model reads and the ignore drops upstream's test file", () => {
    const fixtures = listTargetFixtures(PACKAGE_ROOT, pigeonTarget());
    expect(selectLualsSources([...fixtures, "pigeon/test.lua"], pigeonTarget())).toEqual(fixtures);
  });
});

describe("live_unbundler ingests its module file and types its unannotated constants", () => {
  function liveUnbundlerTarget(): LualsTarget {
    const found = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === "live_unbundler");
    if (!found) throw new Error("live_unbundler target missing from luals-targets.json");
    return found;
  }

  test("the module file feeds the 17 module functions and the 14 constants", () => {
    const model = buildTargetModel(PACKAGE_ROOT, liveUnbundlerTarget());
    const names = model.moduleFunctions.filter(isPublicMethod).map((f) => f.name);
    expect(names).toHaveLength(17);
    for (const name of ["init", "request_module_load", "get_download_progress"]) {
      expect(names).toContain(name);
    }
    expect(model.moduleConstants?.map((c) => c.name)).toEqual([
      "MSG_INITIALIZED",
      "MSG_INITIALIZATION_FAILED",
      "MSG_FILE_LOADED",
      "MSG_MODULE_LOADED",
      "MSG_ALL_LOADED",
      "MSG_NETWORK_ERROR",
      "DEBUG",
      "INFO",
      "WARN",
      "ERROR",
      "FATAL",
      "RES_HIGH_ONLY",
      "RES_LOW_ONLY",
      "RES_BOTH",
    ]);
  });

  test("every LuaLS token live_unbundler writes, constants included, resolves", () => {
    const report = buildTargetFidelity(PACKAGE_ROOT, liveUnbundlerTarget());
    expect(report.unknownTokens).toEqual([]);
    expect(report.unknownFallbacks).toBe(0);
  });
});

describe("ads_wrapper's meta network class reaches the model as dot-called methods", () => {
  test("ads_network carries the 18 functions of ads_network.lua, each without self", () => {
    const target = readLualsTargets(PACKAGE_ROOT).find(
      (t) => t.moduleId === "ads_wrapper.ads_wrapper",
    );
    if (!target) throw new Error("ads_wrapper.ads_wrapper target missing from luals-targets.json");
    const network = buildTargetModel(PACKAGE_ROOT, target).interfaces.find(
      (i) => i.name === "ads_network",
    );
    expect(network?.methods.map((m) => m.name)).toEqual([
      "setup",
      "init",
      "request_idfa",
      "is_supported",
      "is_initialized",
      "show_rewarded",
      "load_rewarded",
      "is_rewarded_loaded",
      "show_interstitial",
      "load_interstitial",
      "is_interstitial_loaded",
      "is_banner_setup",
      "load_banner",
      "unload_banner",
      "is_banner_loaded",
      "show_banner",
      "hide_banner",
      "is_banner_showed",
    ]);
    expect(network?.methods.every((m) => m.noSelf === true)).toBe(true);
  });
});

describe("ads_wrapper.queue.add takes the queue function run calls", () => {
  test("add's fn param carries exactly the configured override token", () => {
    const target = readLualsTargets(PACKAGE_ROOT).find((t) => t.moduleId === "ads_wrapper.queue");
    if (!target) throw new Error("ads_wrapper.queue target missing from luals-targets.json");
    const token = target.annotationOverrides?.moduleFunctions?.add?.params?.fn?.type;
    if (token === undefined) {
      throw new Error("ads_wrapper.queue carries no annotationOverrides type for add's fn param");
    }
    const add = buildTargetModel(PACKAGE_ROOT, target).moduleFunctions.find(
      (f) => f.name === "add",
    );
    expect(add?.params.find((p) => p.name === "fn")?.types).toEqual([token]);
  });
});

describe("log's dropped call signature matches the runtime's non-callable logger", () => {
  function logTarget(): LualsTarget {
    const log = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === "log");
    if (!log) throw new Error("log target missing from luals-targets.json");
    return log;
  }

  test("the override is configured to drop the emitted call signature", () => {
    expect(logTarget().annotationOverrides?.interfaces?.log?.callSignature?.drop).toBe(true);
  });

  test("the metatable get_logger stamps on every logger declares no __call", () => {
    const fixture = readFileSync(join(PACKAGE_ROOT, "fixtures/luals/log/log/log.lua"), "utf8");

    const metatable = /^local METATABLE = (\{[^}]*\})/m.exec(fixture);
    if (!metatable?.[1]) {
      throw new Error("the METATABLE literal moved out of log.lua — recheck the drop's premise");
    }
    expect(metatable[1]).not.toContain("__call");

    const built =
      /function M\.get_logger\([^)]*\)[\s\S]*?\n\s*return setmetatable\(instance, (\w+)\)/.exec(
        fixture,
      );
    if (!built?.[1]) {
      throw new Error("get_logger no longer returns setmetatable(instance, …) — recheck the drop");
    }
    expect(built[1]).toBe("METATABLE");
  });
});

describe("the glass, hyper trails, pixel-art and outline targets", () => {
  function target(namespace: string): LualsTarget {
    const found = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === namespace);
    if (!found) throw new Error(`${namespace} target missing from luals-targets.json`);
    return found;
  }

  test("glass binds its module object and lowers the probe-mode alias to its variants", () => {
    const model = buildTargetModel(PACKAGE_ROOT, target("fake_real_glass"));
    expect(model.moduleObject).toBe("FakeRealGlassModule");
    expect(model.aliases.find((a) => a.name === "FakeRealGlassProbeMode")?.types).toEqual([
      "0",
      "1",
      "2",
    ]);
  });

  test("every hyper_trails self param is retyped to an open options table", () => {
    const model = buildTargetModel(PACKAGE_ROOT, target("hyper_trails"));
    const selfParams = model.moduleFunctions.flatMap((f) =>
      f.params.filter((p) => p.name === "self"),
    );
    expect(selfParams).toHaveLength(17);
    expect(selfParams.every((p) => p.types.join() === "table<string, any>")).toBe(true);
  });

  test("pixelart's module functions include init and set_light", () => {
    const names = buildTargetModel(
      PACKAGE_ROOT,
      target("pixelart.scripts.pixelart"),
    ).moduleFunctions.map((f) => f.name);
    expect(names).toContain("init");
    expect(names).toContain("set_light");
  });

  test("outline's update takes its four signature params, the unused clear_buffer optional", () => {
    const model = buildTargetModel(PACKAGE_ROOT, target("outline"));
    const update = model.moduleFunctions.find((f) => f.name === "update");
    expect(update?.params.map((p) => [p.name, p.isOptional])).toEqual([
      ["self", false],
      ["predicates", false],
      ["frustum", false],
      ["clear_buffer", true],
    ]);
    expect(model.moduleConstants?.map((c) => c.name)).toEqual(["type"]);
  });

  test("pixelart_render's update takes all seven signature params, each required", () => {
    const model = buildTargetModel(PACKAGE_ROOT, target("pixelart.scripts.pixelart_render"));
    const update = model.moduleFunctions.find((f) => f.name === "update");
    expect(update?.params.map((p) => [p.name, p.isOptional])).toEqual([
      ["self", false],
      ["camera_frustum", false],
      ["view", false],
      ["proj", false],
      ["window_width", false],
      ["window_height", false],
      ["clear_buffers", false],
    ]);
  });

  test.each([
    "fake_real_glass",
    "hyper_trails",
    "pixelart.scripts.pixelart",
    "outline",
    "pixelart.scripts.pixelart_render",
  ])("%s resolves every type token", (namespace) => {
    expect(buildTargetFidelity(PACKAGE_ROOT, target(namespace)).unknownFallbacks).toBe(0);
  });
});

describe("the flow targets", () => {
  function target(namespace: string): LualsTarget {
    const found = readLualsTargets(PACKAGE_ROOT).find((t) => t.namespace === namespace);
    if (!found) throw new Error(`${namespace} target missing from luals-targets.json`);
    return found;
  }

  function field(model: LibraryModel, iface: string, name: string): string {
    const found = model.interfaces
      .find((i) => i.name === iface)
      ?.fields.find((f) => f.name === name);
    if (!found) throw new Error(`${iface}.${name} missing from the flow.types model`);
    return found.types.join("|");
  }

  test("flow.types is the whole class vocabulary with no module functions", () => {
    const model = buildTargetModel(PACKAGE_ROOT, target("flow.types"));
    expect(model.moduleFunctions).toHaveLength(0);
    expect(model.interfaces).toHaveLength(32);
    expect(model.aliases.map((a) => a.name).sort()).toEqual([
      "Flow.ColorValue",
      "Flow.DefRegistry",
      "Flow.LogLevel",
      "Flow.ScreenRegistry",
    ]);
  });

  test("flow.types retypes the screen registry and navigation params a project passes as literals", () => {
    const model = buildTargetModel(PACKAGE_ROOT, target("flow.types"));
    expect(field(model, "Flow.InitConfig", "screens")).toBe("flow_screen_registry");
    expect(field(model, "Flow.RuntimeConfig", "screens")).toBe("flow_screen_registry");
    expect(field(model, "Flow.InitConfig", "initial_params")).toBe("flow_params");
    expect(field(model, "Flow.RuntimeConfig", "initial_params")).toBe("flow_params");
    for (const name of ["push", "replace", "reset"]) {
      expect(field(model, "Flow.Navigation", name)).toContain("params?: flow_params");
    }
  });

  test("flow.ui and flow.navigation.runtime export the gui_script and .script lifecycle", () => {
    const names = (namespace: string) =>
      buildTargetModel(PACKAGE_ROOT, target(namespace)).moduleFunctions.map((f) => f.name);
    expect(names("flow.ui")).toEqual(expect.arrayContaining(["mount", "render", "hit_test"]));
    expect(names("flow.navigation.runtime")).toEqual(["init", "final", "on_message"]);
  });

  test.each([
    "flow.ui",
    "flow.navigation.runtime",
    "flow.navigation.proxy",
  ])("every %s self param is retyped to an open table", (namespace) => {
    const selfParams = buildTargetModel(PACKAGE_ROOT, target(namespace)).moduleFunctions.flatMap(
      (f) => f.params.filter((p) => p.name === "self"),
    );
    expect(selfParams.length).toBeGreaterThan(0);
    expect(selfParams.every((p) => p.types.join() === "table<string, any>")).toBe(true);
  });

  test.each([
    "flow.types",
    "flow.ui",
    "flow.layout",
    "flow.flex",
    "flow.navigation.messages",
    "flow.navigation.runtime",
    "flow.navigation.proxy",
    "flow.navigation.gui",
  ])("%s resolves every type token", (namespace) => {
    expect(buildTargetFidelity(PACKAGE_ROOT, target(namespace)).unknownFallbacks).toBe(0);
  });
});
