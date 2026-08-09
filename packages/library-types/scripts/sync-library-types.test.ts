import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readAuthoredTargets } from "./sync-authored-types";
import {
  type ClassificationEntry,
  checkDescriptions,
  checkDrift,
  classifyLibraryDirs,
  codemodDeclaration,
  type FetchRepoDescription,
  type FetchText,
  type LibrarySource,
  type LibraryTarget,
  type LibraryTargets,
  type ListTree,
  libraryModulesFromTree,
  maintainedHereModules,
  mergeLibraryDescriptions,
  rawUrl,
  readMaintainedHereRegistry,
  repoSlug,
  severedDirsFromModules,
  writeClassification,
  writeDescriptions,
} from "./sync-library-types";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const REGISTRY = JSON.parse(
  readFileSync(join(PACKAGE_ROOT, "library-targets.json"), "utf8"),
) as LibraryTargets;

// A minimal package root with a single vendored target, used by the drift tests
// that need the committed generated file to be deliberately in or out of sync —
// something the real `generated/` (always regenerated) cannot express.
function writeTempTarget(fixture: string, generated: string): string {
  const root = mkdtempSync(join(tmpdir(), "library-types-drift-"));
  const source: LibrarySource = {
    repo: "https://github.com/ts-defold/library",
    commit: "0000000000000000000000000000000000000000",
    license: "MIT",
  };
  const target: LibraryTarget = {
    module: "sample.sample",
    path: "packages/sample/sample.sample.d.ts",
    fixture: "fixtures/ts-defold/sample.sample.d.ts",
    generated: "generated/sample.sample.d.ts",
  };
  mkdirSync(join(root, "fixtures/ts-defold"), { recursive: true });
  mkdirSync(join(root, "generated"), { recursive: true });
  writeFileSync(join(root, target.fixture), fixture);
  writeFileSync(join(root, target.generated), generated);
  writeFileSync(join(root, "library-targets.json"), JSON.stringify({ source, targets: [target] }));
  return root;
}

// A representative ambient module that mixes every construct the transform must
// handle: bare core types (`hash`, `url`), dotted `vmath.*` references, an engine
// handle (`node`), passthrough language extensions (`LuaMultiReturn`, `LuaMap`), a
// locally-declared `table` alias that collides with a Defold core-type name, and a
// `hashValue` member whose identifier merely embeds a core-type token.
const SAMPLE = `/** @noSelfInFile */

/**
 * @noResolution
 */
declare module 'sample.sample' {
  type table = {};
  type ScreenId = hash | string;
  type State = {
    node: node;
    node_id: hash;
    hashValue: number;
  };
  export const DONE: hash;
  /**
   * @param {string|hash} id
   * @param {url} where
   */
  export function make(id: hash | string, where: url, at: vmath.vector3): State;
  export function spin(): vmath.quat;
  export function pair(): LuaMultiReturn<[boolean, string]>;
  export function nodes(): LuaMap<hash, node>;
  export function group(fn: () => void): table;
}
`;

describe("codemodDeclaration", () => {
  test("renames core-type references to the @defold-typescript/types surface", () => {
    const { output, unmapped } = codemodDeclaration(SAMPLE);
    expect(unmapped).toEqual([]);
    expect(output).toContain("at: Vector3)");
    expect(output).toContain("export function spin(): Quaternion;");
    expect(output).toContain("type ScreenId = Hash | string;");
    expect(output).toContain("export const DONE: Hash;");
    expect(output).toContain("where: Url,");
    expect(output).toContain('node: Opaque<"node">;');
    expect(output).toContain("node_id: Hash;");
    expect(output).toContain('LuaMap<Hash, Opaque<"node">>');
  });

  test("leaves passthrough constructs byte-identical", () => {
    const { output } = codemodDeclaration(SAMPLE);
    expect(output).toContain("/** @noSelfInFile */");
    expect(output).toContain("@noResolution");
    expect(output).toContain("declare module 'sample.sample' {");
    expect(output).toContain("LuaMultiReturn<[boolean, string]>");
    // Core-type tokens inside JSDoc are comment text, not type references.
    expect(output).toContain("@param {string|hash} id");
    expect(output).toContain("@param {url} where");
  });

  test("does not rename a core-type token embedded in an identifier", () => {
    const { output } = codemodDeclaration(SAMPLE);
    expect(output).toContain("hashValue: number;");
    expect(output).not.toContain("HashValue");
  });

  test("leaves a locally-declared `table` alias untouched", () => {
    const { output } = codemodDeclaration(SAMPLE);
    expect(output).toContain("type table = {};");
    expect(output).toContain("): table;");
  });

  test("renames the vmath.quaternion alias to Quaternion alongside vmath.quat", () => {
    const src =
      "declare module 'x.x' {\n  export function a(): vmath.quat;\n  export function b(): vmath.quaternion;\n}\n";
    const { output, unmapped } = codemodDeclaration(src);
    expect(unmapped).toEqual([]);
    expect(output).toContain("export function a(): Quaternion;");
    expect(output).toContain("export function b(): Quaternion;");
  });

  test("reports an unmapped vmath.* reference instead of renaming it silently", () => {
    const src = "declare module 'x.x' {\n  export function f(): vmath.matrix3;\n}\n";
    const { output, unmapped } = codemodDeclaration(src);
    expect(unmapped).toContain("vmath.matrix3");
    expect(output).toContain("vmath.matrix3");
  });
});

describe("the dormant ts-defold lane", () => {
  test("library-targets.json still exists and pins its source, but owns no rows", () => {
    // The severance series drained this registry to zero. The file itself stays
    // committed because three consumers read it as a *presence* check, not a
    // content one: the CLI's `loadVendoredLibraryRegistry` returns EMPTY — no
    // LuaLS, script_api or authored libraries at all — when it is missing,
    // `libraryModuleDirs` guards on `existsSync`, and `library-classification.json`
    // asserts its commit pin against this `source` block.
    //
    // Stated explicitly because the two data-driven describes below (the
    // transform-drift guard and `checkDrift`'s ok-case) now iterate nothing and
    // pass vacuously. They are not coverage of an empty registry; the codemod
    // and drift machinery keep their real coverage through the `writeTempTarget`
    // synthetic roots.
    expect(existsSync(join(PACKAGE_ROOT, "library-targets.json"))).toBe(true);
    expect(REGISTRY.targets).toEqual([]);
    expect(REGISTRY.source.repo).toBe("https://github.com/ts-defold/library");
    expect(REGISTRY.source.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(REGISTRY.source.license).toBe("MIT");
  });
});

describe("rawUrl", () => {
  test("composes the pinned raw.githubusercontent URL for a target", () => {
    // Composed from a synthetic target: the real registry is permanently empty,
    // so there is no row left to read a subject off. This is the end of the
    // subject relay (`monarch.monarch`, then `gooey.gooey`, then
    // `nakama.nakama`), not another move.
    const target: LibraryTarget = {
      module: "sample.sample",
      path: "packages/sample-dir/sample.sample.d.ts",
      fixture: "fixtures/ts-defold/sample.sample.d.ts",
      generated: "generated/sample.sample.d.ts",
    };
    expect(rawUrl(REGISTRY.source, target)).toBe(
      `https://raw.githubusercontent.com/ts-defold/library/${REGISTRY.source.commit}/packages/sample-dir/sample.sample.d.ts`,
    );
  });
});

// The CI-wired gate: the committed generated files must be exactly what the
// codemod produces from the committed fixtures. Data-driven over the registry,
// so a newly added target is covered without editing this test. Fails loudly if
// a fixture or the codemod changed without a `bun regen`.
describe("transform-drift guard: committed generated matches codemod(fixture)", () => {
  for (const target of REGISTRY.targets) {
    test(target.module, () => {
      const fixture = readFileSync(join(PACKAGE_ROOT, target.fixture), "utf8");
      const generated = readFileSync(join(PACKAGE_ROOT, target.generated), "utf8");
      expect(codemodDeclaration(fixture).output).toBe(generated);
    });
  }
});

describe("checkDrift", () => {
  test("reports ok when every fetched upstream matches its committed fixture", async () => {
    const fetchText: FetchText = async (url) => {
      const target = REGISTRY.targets.find((t) => rawUrl(REGISTRY.source, t) === url);
      if (!target) throw new Error(`no target for ${url}`);
      return readFileSync(join(PACKAGE_ROOT, target.fixture), "utf8");
    };
    const results = await checkDrift(PACKAGE_ROOT, fetchText);
    expect(results.map((r) => r.module)).toEqual(REGISTRY.targets.map((t) => t.module));
    expect(results.every((r) => r.status === "ok")).toBe(true);
  });

  test("reports upstream-drift when fetched bytes differ from the committed fixture", async () => {
    const fixture = "declare module 'sample.sample' {\n  export const A: hash;\n}\n";
    const root = writeTempTarget(fixture, codemodDeclaration(fixture).output);
    const results = await checkDrift(root, async () => `${fixture}// upstream moved\n`);
    expect(results).toEqual([{ module: "sample.sample", status: "upstream-drift" }]);
  });

  test("reports transform-drift when the committed generated file is stale", async () => {
    const fixture = "declare module 'sample.sample' {\n  export const A: hash;\n}\n";
    const stale = "declare module 'sample.sample' {\n  export const A: NotRenamed;\n}\n";
    const root = writeTempTarget(fixture, stale);
    const results = await checkDrift(root, async () => fixture);
    expect(results).toEqual([{ module: "sample.sample", status: "transform-drift" }]);
  });
});

describe("NOTICE", () => {
  test("attributes the upstream project, license, and pinned commit", () => {
    const notice = readFileSync(join(PACKAGE_ROOT, "NOTICE"), "utf8");
    expect(notice).toContain("ts-defold/library");
    expect(notice).toContain(REGISTRY.source.license);
    expect(notice).toContain(REGISTRY.source.commit);
  });

  test("the credit table survives the emptied registry, which now owes no dir", () => {
    // NOTICE credits the ts-defold binding every severed fork descends from, so
    // the table is historical attribution and stays populated after the last row
    // left. What the *live* registry owes is separately zero; a returning row
    // re-arms the per-dir loop below instead of it silently passing.
    const notice = readFileSync(join(PACKAGE_ROOT, "NOTICE"), "utf8");
    const credited = [
      ...notice.matchAll(/^\s+- (\S+)\s+— .+, (https:\/\/github\.com\/\S+)$/gm),
    ].map((m) => m[1]);
    expect(credited.length).toBeGreaterThan(0);
    // The fork's own upstream keeps its credit: a severance moves a lane, it
    // does not retire attribution.
    expect(credited).toContain("nakama-defold");
    const dirs = new Set(
      REGISTRY.targets.map((t) => t.path.split("/")[1]).filter((d): d is string => d !== undefined),
    );
    expect(dirs.size).toBe(0);
    for (const dir of dirs) {
      expect(notice).toContain(dir);
    }
  });

  // The credit and the pin live in separate files, so an upstream that moves — or a
  // target re-pointed at a different slug — can leave the shipped attribution naming
  // a repository that no longer resolves. Keyed on the credited dir matching the
  // pinned repo's own basename, which is the only join the two files share.
  test("every forked library's credit names the repo its authored-targets entry pins", () => {
    const notice = readFileSync(join(PACKAGE_ROOT, "NOTICE"), "utf8");
    const credited = new Map(
      [...notice.matchAll(/^\s+- (\S+)\s+— .+, (https:\/\/github\.com\/\S+)$/gm)].map((m) => [
        m[1] as string,
        m[2] as string,
      ]),
    );
    const mismatched: string[] = [];
    let compared = 0;
    for (const entry of readAuthoredTargets(PACKAGE_ROOT)) {
      const basename = entry.repo.split("/").pop() ?? "";
      const credit = credited.get(basename);
      if (credit === undefined) continue;
      compared += 1;
      if (credit !== entry.repo)
        mismatched.push(`${basename}: NOTICE ${credit} vs pin ${entry.repo}`);
    }
    expect(mismatched).toEqual([]);
    expect(compared).toBeGreaterThan(5);
  });
});

describe("repoSlug", () => {
  test("strips the github prefix, any .git suffix, and a trailing slash", () => {
    expect(repoSlug("https://github.com/ts-defold/library")).toBe("ts-defold/library");
    expect(repoSlug("https://github.com/ts-defold/library.git")).toBe("ts-defold/library");
    expect(repoSlug("https://github.com/Lerg/extension-cas/")).toBe("Lerg/extension-cas");
  });
});

describe("libraryModulesFromTree", () => {
  test("groups packages/<dir>/<module>.d.ts by dir, dropping version aliases and non-.d.ts", () => {
    const byDir = libraryModulesFromTree([
      "packages/DAABBCC/daabbcc.d.ts",
      "packages/DAABBCC/daabbcc-3.0.1.d.ts",
      "packages/DAABBCC/aabb.d.ts",
      "packages/DAABBCC/library.json",
      "packages/monarch/monarch.monarch.d.ts",
      "packages/monarch/monarch-5.1.0.d.ts",
      "packages/def_taptic_engine/taptic_engine.d.ts",
      "packages/def_taptic_engine/taptic_engine-1.2.d.ts",
      "packages/gd-defold/gdsdk.ts",
      "packages/gd-defold/gdsdk-1.2.0.d.ts",
      "packages/tsconfig.json",
      ".github/workflows/main.yml",
      "README.md",
    ]);
    expect(byDir.get("DAABBCC")).toEqual(["aabb", "daabbcc"]);
    expect(byDir.get("monarch")).toEqual(["monarch.monarch"]);
    expect(byDir.get("def_taptic_engine")).toEqual(["taptic_engine"]);
    // Only a version alias and a .ts source — no real module.
    expect(byDir.get("gd-defold")).toEqual([]);
    expect([...byDir.keys()].sort()).toEqual([
      "DAABBCC",
      "def_taptic_engine",
      "gd-defold",
      "monarch",
    ]);
  });
});

describe("classifyLibraryDirs", () => {
  const dirs = [
    { dir: "monarch", modules: ["monarch.monarch"] },
    { dir: "DAABBCC", modules: ["aabb", "daabbcc"] },
  ];

  test("native iff any bare module, pure-lua iff every module dotted, sorted by dir", () => {
    const entries = classifyLibraryDirs(dirs, {
      vendoredDirs: new Set<string>(),
      coveredByGoalDirs: new Set<string>(),
    });
    expect(entries.map((e) => e.dir)).toEqual(["DAABBCC", "monarch"]);
    expect(entries.find((e) => e.dir === "DAABBCC")).toEqual({
      dir: "DAABBCC",
      classification: "native",
      modules: ["aabb", "daabbcc"],
    });
    expect(entries.find((e) => e.dir === "monarch")?.classification).toBe("pure-lua");
  });

  test("a dir with no modules is native (nothing pure-Lua to vendor)", () => {
    const [entry] = classifyLibraryDirs([{ dir: "gd-defold", modules: [] }], {
      vendoredDirs: new Set<string>(),
      coveredByGoalDirs: new Set<string>(),
    });
    expect(entry?.classification).toBe("native");
  });

  test("exclusion sets win over module shape", () => {
    const entries = classifyLibraryDirs(
      [
        { dir: "monarch", modules: ["monarch.monarch"] },
        { dir: "defold-xmath", modules: ["xmath"] },
      ],
      { vendoredDirs: new Set(["monarch"]), coveredByGoalDirs: new Set(["defold-xmath"]) },
    );
    expect(entries.find((e) => e.dir === "monarch")?.classification).toBe("already-vendored");
    // A bare (native-shaped) module, but the goal-covered exclusion wins.
    expect(entries.find((e) => e.dir === "defold-xmath")?.classification).toBe("covered-by-goal");
  });
});

interface ClassificationManifest {
  source: LibrarySource;
  dirs: ClassificationEntry[];
}

describe("library-classification.json coverage", () => {
  const manifest = JSON.parse(
    readFileSync(join(PACKAGE_ROOT, "library-classification.json"), "utf8"),
  ) as ClassificationManifest;
  const byDir = new Map(manifest.dirs.map((e) => [e.dir, e] as const));
  const TOKENS = new Set(["pure-lua", "native", "already-vendored", "covered-by-goal"]);
  const vendoredDirs = new Set(
    REGISTRY.targets.map((t) => t.path.split("/")[1]).filter((d): d is string => d !== undefined),
  );
  const coveredByGoalDirs = new Set(["defold-lldebugger", "defold-xmath"]);

  test("pins the same commit as library-targets.json", () => {
    expect(manifest.source.commit).toBe(REGISTRY.source.commit);
  });

  test("every entry uses a known token consistent with its module shape and exclusion", () => {
    expect(manifest.dirs.length).toBeGreaterThan(0);
    for (const e of manifest.dirs) {
      expect(TOKENS.has(e.classification)).toBe(true);
      if (!vendoredDirs.has(e.dir) && !coveredByGoalDirs.has(e.dir)) {
        const pure = e.modules.length > 0 && e.modules.every((m) => m.includes("."));
        expect(e.classification).toBe(pure ? "pure-lua" : "native");
      }
    }
  });

  test("known-native dirs are native", () => {
    for (const dir of ["DAABBCC", "defold-astar", "drawpixels", "defold-yoga"]) {
      expect(byDir.get(dir)?.classification).toBe("native");
    }
  });

  test("no pure-Lua candidates remain", () => {
    expect([...byDir.values()].filter((entry) => entry.classification === "pure-lua")).toEqual([]);
  });

  test("goal-covered dirs are covered-by-goal", () => {
    expect(byDir.get("defold-lldebugger")?.classification).toBe("covered-by-goal");
    expect(byDir.get("defold-xmath")?.classification).toBe("covered-by-goal");
  });

  test("no dir is already-vendored, because the registry derives none", () => {
    // The derivation is kept rather than replaced by a literal: a returning
    // `library-targets.json` row re-arms the per-dir assertion instead of this
    // test silently passing on an empty set. With the registry drained, the
    // committed manifest must carry no `already-vendored` entry at all — the
    // token is now reachable only through `writeClassification`'s synthetic
    // roots.
    expect(vendoredDirs.size).toBe(0);
    for (const dir of vendoredDirs) {
      expect(byDir.get(dir)?.classification).toBe("already-vendored");
    }
    expect(manifest.dirs.filter((e) => e.classification === "already-vendored")).toEqual([]);
  });

  test("no committed module is owned by a maintained-here lane", () => {
    const liveModules = new Set(REGISTRY.targets.map((t) => t.module));
    // The assembly is shared with production so a lane added there widens this
    // guard at the same time; only the predicate below stays restated.
    const registry = readMaintainedHereRegistry(PACKAGE_ROOT);
    // Restated here rather than routed through `maintainedHereModules`, so a bug
    // in the predicate cannot blind the guard at the moment the manifest is wrong.
    const scanned = manifest.dirs.flatMap((e) => e.modules);
    const offenders = scanned.filter(
      (m) =>
        !liveModules.has(m) &&
        (registry.moduleIds.has(m) ||
          registry.namespaces.has(m) ||
          registry.namespaces.has(m.split(".")[0] as string)),
    );
    expect(offenders).toEqual([]);
    expect(scanned.length).toBeGreaterThan(0);
  });

  test("gd-defold is the only dir shipped with no modules", () => {
    // A resurrected severed dir arrives with every maintained-here module stripped
    // by the survivor filter, so the module scan above sees nothing and the shape
    // test resolves its empty `modules` to `native`. This allowlist is what catches
    // it. `gd-defold` is legitimate: its only upstream entries are a `.ts` source
    // and a version alias, both dropped by `libraryModulesFromTree`.
    expect(manifest.dirs.filter((e) => e.modules.length === 0).map((e) => e.dir)).toEqual([
      "gd-defold",
    ]);
  });
});

// The registry union and live-row set every maintained-here derivation reads,
// populated with the real pinned values: `yagames.yagames` is an authored
// moduleId, `tweener` a bare luals namespace, `saver.saver`/`saver.storage` the
// dotted ones, and `nakama` an openapi namespace that is also a live row.
const MAINTAINED_HERE_REGISTRY = {
  moduleIds: new Set(["yagames.yagames", "nakama.engine.defold", "nakama.util.log"]),
  namespaces: new Set(["tweener", "saver.saver", "saver.storage", "nakama"]),
};
const LIVE_MODULES = new Set(["nakama.nakama", "monarch.monarch"]);

describe("maintainedHereModules", () => {
  test("an authored moduleId is maintained here", () => {
    expect([
      ...maintainedHereModules(["yagames.yagames"], MAINTAINED_HERE_REGISTRY, LIVE_MODULES),
    ]).toEqual(["yagames.yagames"]);
  });

  test("a module whose top dotted segment is a registered namespace is maintained here", () => {
    expect([
      ...maintainedHereModules(["tweener.tweener"], MAINTAINED_HERE_REGISTRY, LIVE_MODULES),
    ]).toEqual(["tweener.tweener"]);
  });

  test("a module whose full name is a registered namespace is maintained here", () => {
    // `saver`'s luals namespaces are dotted, so a top-segment-only match misses both.
    expect([
      ...maintainedHereModules(
        ["saver.saver", "saver.storage"],
        MAINTAINED_HERE_REGISTRY,
        LIVE_MODULES,
      ),
    ]).toEqual(["saver.saver", "saver.storage"]);
  });

  test("a live library-targets.json row is not maintained here", () => {
    expect([
      ...maintainedHereModules(["nakama.nakama"], MAINTAINED_HERE_REGISTRY, LIVE_MODULES),
    ]).toEqual([]);
  });

  test("an unregistered module is not maintained here", () => {
    expect([
      ...maintainedHereModules(["monarch.monarch"], MAINTAINED_HERE_REGISTRY, LIVE_MODULES),
    ]).toEqual([]);
  });
});

describe("severedDirsFromModules", () => {
  test("a dir whose every module is maintained here is severed", () => {
    const severed = severedDirsFromModules(
      new Map([
        ["defold-tweener", ["tweener.tweener"]],
        ["defold-saver", ["saver.saver", "saver.storage"]],
        ["defold-yagames", ["yagames.yagames"]],
      ]),
      MAINTAINED_HERE_REGISTRY,
      LIVE_MODULES,
    );
    expect([...severed].sort()).toEqual(["defold-saver", "defold-tweener", "defold-yagames"]);
  });

  test("a dir mixing maintained-here and live modules is not severed", () => {
    const severed = severedDirsFromModules(
      new Map([["nakama-defold", ["nakama.engine.defold", "nakama.nakama", "nakama.util.log"]]]),
      MAINTAINED_HERE_REGISTRY,
      LIVE_MODULES,
    );
    expect([...severed]).toEqual([]);
  });

  test("a dir with no modules is not severed", () => {
    const severed = severedDirsFromModules(
      new Map([["gd-defold", []]]),
      MAINTAINED_HERE_REGISTRY,
      LIVE_MODULES,
    );
    expect([...severed]).toEqual([]);
  });
});

describe("writeClassification", () => {
  const source: LibrarySource = {
    repo: "https://github.com/ts-defold/library",
    commit: "0000000000000000000000000000000000000000",
    license: "MIT",
  };

  // `writeClassification` reads every maintained-here registry from the package
  // root, and each reader loud-fails on a missing required field — so the temp
  // root needs all five complete, not stubs.
  function writeClassifyRoot(opts: {
    vendoredPaths: string[];
    authoredModuleIds: string[];
    lualsNamespaces?: string[];
    scriptApiNamespaces?: string[];
    openApiNamespaces?: string[];
    markdownNamespaces?: string[];
  }): string {
    const root = mkdtempSync(join(tmpdir(), "library-types-classify-"));
    const lane = (namespaces: string[] | undefined, extra: Record<string, string>) =>
      JSON.stringify({
        targets: (namespaces ?? []).map((namespace) => ({
          repo: "https://github.com/example/example",
          ref: "1",
          moduleId: namespace,
          namespace,
          generated: `generated/${namespace}.d.ts`,
          apiDoc: `api-doc/${namespace}.json`,
          ...extra,
        })),
      });
    writeFileSync(
      join(root, "luals-targets.json"),
      JSON.stringify({
        targets: (opts.lualsNamespaces ?? []).map((namespace) => ({
          repo: "https://github.com/example/example",
          ref: "1",
          sourceGlobs: ["**/*.lua"],
          moduleId: namespace,
          namespace,
        })),
      }),
    );
    writeFileSync(
      join(root, "script-api-targets.json"),
      lane(opts.scriptApiNamespaces, { scriptApi: "api.script_api" }),
    );
    writeFileSync(
      join(root, "openapi-targets.json"),
      lane(opts.openApiNamespaces, { swagger: "api.swagger.json", proto: "api.proto" }),
    );
    writeFileSync(
      join(root, "markdown-targets.json"),
      lane(opts.markdownNamespaces, { markdown: "README.md" }),
    );
    writeFileSync(
      join(root, "library-targets.json"),
      JSON.stringify({
        source,
        targets: opts.vendoredPaths.map((path) => ({
          module: path.split("/")[2]?.replace(/\.d\.ts$/, ""),
          path,
          fixture: "f",
          generated: "g",
        })),
      }),
    );
    writeFileSync(
      join(root, "authored-targets.json"),
      JSON.stringify({
        targets: opts.authoredModuleIds.map((moduleId) => {
          const namespace = moduleId.split(".")[0] as string;
          return {
            repo: "https://github.com/example/example",
            ref: "1",
            authored: `fixtures/authored/${moduleId}.d.ts`,
            moduleId,
            namespace,
            generated: `generated/${namespace}.d.ts`,
            apiDoc: `api-doc/${namespace}.json`,
            // A synthetic target has no upstream to vendor, and the parity
            // declaration is mandatory for any config `readAuthoredTargets` accepts.
            parityVerdict: {
              reason: "no-module-file",
              note: "synthetic classification fixture — no upstream repository exists.",
            },
          };
        }),
      }),
    );
    return root;
  }

  test("writes a manifest matching classifyLibraryDirs on an injected tree (offline)", async () => {
    const root = writeClassifyRoot({
      vendoredPaths: ["packages/monarch/monarch.monarch.d.ts"],
      authoredModuleIds: ["yagames.yagames"],
      lualsNamespaces: ["tweener", "saver.saver", "saver.storage"],
      scriptApiNamespaces: ["bridge"],
      // All five lanes are registered so dropping any one of them from the shared
      // registry assembly reds here, offline, without waiting for a regen. The
      // tree omits nakama's live row so the openapi lane's own contribution is
      // what severs the dir.
      openApiNamespaces: ["nakama"],
      markdownNamespaces: ["orthographic"],
    });
    const listTree: ListTree = async () => [
      "packages/monarch/monarch.monarch.d.ts",
      "packages/DAABBCC/daabbcc.d.ts",
      "packages/DAABBCC/aabb.d.ts",
      "packages/defold-richtext/richtext.richtext.d.ts",
      "packages/defold-lldebugger/lldebugger.debug.d.ts",
      "packages/defold-yagames/yagames.yagames.d.ts",
      "packages/defold-tweener/tweener.tweener.d.ts",
      "packages/defold-saver/saver.saver.d.ts",
      "packages/defold-saver/saver.storage.d.ts",
      "packages/defold-bridge/bridge.bridge.d.ts",
      "packages/nakama-defold/nakama.nakama.d.ts",
      "packages/defold-orthographic/orthographic.camera.d.ts",
      "packages/tsconfig.json",
      "README.md",
    ];

    await writeClassification(root, { listTree });

    const written = JSON.parse(
      readFileSync(join(root, "library-classification.json"), "utf8"),
    ) as ClassificationManifest;
    expect(written.source.commit).toBe(source.commit);
    const byDir = new Map(written.dirs.map((e) => [e.dir, e] as const));
    for (const dir of [
      "defold-yagames",
      "defold-tweener",
      "defold-saver",
      "defold-bridge",
      "nakama-defold",
      "defold-orthographic",
    ]) {
      expect(byDir.has(dir)).toBe(false);
    }
    expect(byDir.get("monarch")?.classification).toBe("already-vendored");
    expect(byDir.get("DAABBCC")?.classification).toBe("native");
    expect(byDir.get("defold-richtext")?.classification).toBe("pure-lua");
    expect(byDir.get("defold-lldebugger")?.classification).toBe("covered-by-goal");

    // Literal exclusion list, never recomputed from the production predicate — a
    // recomputed filter stays green under an inverted `every`/`some`.
    const expected = classifyLibraryDirs(
      [...libraryModulesFromTree(await listTree(source))]
        .filter(
          ([dir]) =>
            dir !== "defold-yagames" &&
            dir !== "defold-tweener" &&
            dir !== "defold-saver" &&
            dir !== "defold-bridge" &&
            dir !== "nakama-defold" &&
            dir !== "defold-orthographic",
        )
        .map(([dir, modules]) => ({ dir, modules })),
      {
        vendoredDirs: new Set(["monarch"]),
        coveredByGoalDirs: new Set(["defold-lldebugger", "defold-xmath"]),
      },
    );
    expect(written.dirs).toEqual(expected);
  });

  test("a surviving dir keeps its live modules and drops its maintained-here ones", async () => {
    // Modelled on what `nakama-defold` was: one live ts-defold row under an
    // openapi namespace, plus two helpers forked onto the authored lane. That
    // dir has since severed whole, so the mixed live/maintained-here shape is no
    // longer a committed one anywhere — this synthetic root is the only witness
    // the rule has left.
    const root = writeClassifyRoot({
      vendoredPaths: ["packages/nakama-defold/nakama.nakama.d.ts"],
      authoredModuleIds: ["nakama.engine.defold", "nakama.util.log"],
      openApiNamespaces: ["nakama"],
    });
    const listTree: ListTree = async () => [
      "packages/nakama-defold/nakama.engine.defold.d.ts",
      "packages/nakama-defold/nakama.nakama.d.ts",
      "packages/nakama-defold/nakama.util.log.d.ts",
    ];

    await writeClassification(root, { listTree });

    const written = JSON.parse(
      readFileSync(join(root, "library-classification.json"), "utf8"),
    ) as ClassificationManifest;
    const entry = written.dirs.find((e) => e.dir === "nakama-defold");
    expect(entry?.classification).toBe("already-vendored");
    expect(entry?.modules).toEqual(["nakama.nakama"]);
  });

  test("a vendored dir survives severance when its live row's module is gone from the tree", async () => {
    // `orthographic.camera` is the live `library-targets.json` row but an upstream
    // rename left it stale: the tree now carries only `orthographic.orthographic`,
    // which is maintained here. Every module the dir still has is severed, so the
    // dir survives on the vendored rescue alone.
    const root = writeClassifyRoot({
      vendoredPaths: [
        "packages/monarch/monarch.monarch.d.ts",
        "packages/defold-orthographic/orthographic.camera.d.ts",
      ],
      authoredModuleIds: ["orthographic.orthographic"],
    });
    const listTree: ListTree = async () => [
      "packages/monarch/monarch.monarch.d.ts",
      "packages/defold-orthographic/orthographic.orthographic.d.ts",
    ];

    await writeClassification(root, { listTree });

    const written = JSON.parse(
      readFileSync(join(root, "library-classification.json"), "utf8"),
    ) as ClassificationManifest;
    const byDir = new Map(written.dirs.map((e) => [e.dir, e] as const));
    const entry = byDir.get("defold-orthographic");
    expect(entry?.classification).toBe("already-vendored");
    // The survivor's evidence is empty: its one tree module is maintained here.
    expect(entry?.modules).toEqual([]);
  });
});

describe("mergeLibraryDescriptions", () => {
  test("an override wins over a fetched description for the same dir", () => {
    expect(
      mergeLibraryDescriptions({ monarch: "fetched text" }, { monarch: "curated text" }),
    ).toEqual({ monarch: "curated text" });
  });

  test("a dir present only in fetched keeps the fetched text", () => {
    expect(mergeLibraryDescriptions({ monarch: "fetched text" }, {})).toEqual({
      monarch: "fetched text",
    });
  });

  test("a dir with an empty fetched value takes the override", () => {
    expect(mergeLibraryDescriptions({ monarch: "" }, { monarch: "curated text" })).toEqual({
      monarch: "curated text",
    });
  });

  test("a dir with neither fetched nor override is omitted", () => {
    expect(mergeLibraryDescriptions({ monarch: "fetched" }, { richtext: "curated" })).toEqual({
      monarch: "fetched",
      richtext: "curated",
    });
  });

  test("a dir with an empty value in both fetched and override is omitted", () => {
    expect(mergeLibraryDescriptions({ monarch: "" }, { richtext: "  " })).toEqual({});
  });

  test("emits a sorted key set in the output", () => {
    const merged = mergeLibraryDescriptions({ zebra: "z", alpha: "a", mango: "m" }, {});
    expect([...Object.keys(merged)]).toEqual(["alpha", "mango", "zebra"]);
  });
});

describe("checkDescriptions", () => {
  function writeTempRoot(
    committed: Record<string, string>,
    overrides: Record<string, string>,
  ): string {
    const root = mkdtempSync(join(tmpdir(), "library-types-description-check-"));
    writeFileSync(join(root, "library-descriptions.json"), JSON.stringify(committed, null, 2));
    writeFileSync(
      join(root, "library-description-overrides.json"),
      JSON.stringify(overrides, null, 2),
    );
    return root;
  }

  test("does not report fetched-only committed descriptions as drift", () => {
    const root = writeTempRoot(
      {
        "fetched-only": "description from GitHub",
        curated: "curated description",
      },
      { curated: "curated description" },
    );

    expect(checkDescriptions(root)).toEqual([]);
  });

  test("reports an override whose committed description is stale", () => {
    const root = writeTempRoot(
      {
        "fetched-only": "description from GitHub",
        curated: "old description",
      },
      { curated: "curated description" },
    );

    expect(checkDescriptions(root)).toEqual(["curated"]);
  });
});

describe("writeDescriptions", () => {
  const NOTICE = [
    "Some preamble.",
    "",
    "Attributed upstream libraries (by their directory in ts-defold/library):",
    "",
    "    - with-repo        — Alice, https://github.com/alice/with-repo",
    "    - without-repo    — Bob, https://example.com/no-github",
    "    - bare            — Carol",
    "",
  ].join("\n");

  function writeTempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "library-types-descriptions-"));
    writeFileSync(join(root, "NOTICE"), NOTICE);
    return root;
  }

  test("fetches owner/repo from NOTICE credit URLs, applies overrides, writes sorted map", async () => {
    const root = writeTempRoot();
    const fetchRepoDescription: FetchRepoDescription = async (owner, repo) => {
      if (owner === "alice" && repo === "with-repo") return "fetched with-repo text";
      if (owner === "bob") return "fetched bob text";
      throw new Error(`unexpected fetch: ${owner}/${repo}`);
    };
    await writeDescriptions(root, {
      fetchRepoDescription,
      overrides: { "without-repo": "curated bob text" },
    });
    const written = JSON.parse(
      readFileSync(join(root, "library-descriptions.json"), "utf8"),
    ) as Record<string, string>;
    expect(written).toEqual({
      "with-repo": "fetched with-repo text",
      "without-repo": "curated bob text",
    });
    expect([...Object.keys(written)]).toEqual([...Object.keys(written)].sort());
  });

  test("skips a NOTICE entry whose credit URL is not a github repo", async () => {
    const root = mkdtempSync(join(tmpdir(), "library-types-descriptions-skip-"));
    writeFileSync(
      join(root, "NOTICE"),
      [
        "    - non-github      — Alice, https://example.com/no-github",
        "    - no-url          — Bob",
        "",
      ].join("\n"),
    );
    const fetchRepoDescription: FetchRepoDescription = async () => {
      throw new Error("should not be called");
    };
    await writeDescriptions(root, {
      fetchRepoDescription,
      overrides: {},
    });
    const written = JSON.parse(
      readFileSync(join(root, "library-descriptions.json"), "utf8"),
    ) as Record<string, string>;
    expect(written).toEqual({});
  });
});
