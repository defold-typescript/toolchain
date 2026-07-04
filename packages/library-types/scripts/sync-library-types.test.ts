import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  type ClassificationEntry,
  checkDrift,
  classifyLibraryDirs,
  codemodDeclaration,
  type FetchText,
  type LibrarySource,
  type LibraryTarget,
  type LibraryTargets,
  type ListTree,
  libraryModulesFromTree,
  rawUrl,
  repoSlug,
  writeClassification,
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

  test("reports an unmapped vmath.* reference instead of renaming it silently", () => {
    const src = "declare module 'x.x' {\n  export function f(): vmath.matrix3;\n}\n";
    const { output, unmapped } = codemodDeclaration(src);
    expect(unmapped).toContain("vmath.matrix3");
    expect(output).toContain("vmath.matrix3");
  });
});

describe("rawUrl", () => {
  test("composes the pinned raw.githubusercontent URL for a target", () => {
    const target = REGISTRY.targets.find((t) => t.module === "monarch.monarch");
    expect(target).toBeDefined();
    expect(rawUrl(REGISTRY.source, target as LibraryTarget)).toBe(
      `https://raw.githubusercontent.com/ts-defold/library/${REGISTRY.source.commit}/packages/monarch/monarch.monarch.d.ts`,
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

  test("attributes every distinct upstream library directory", () => {
    const notice = readFileSync(join(PACKAGE_ROOT, "NOTICE"), "utf8");
    const dirs = new Set(
      REGISTRY.targets.map((t) => t.path.split("/")[1]).filter((d): d is string => d !== undefined),
    );
    expect(dirs.size).toBeGreaterThan(0);
    for (const dir of dirs) {
      expect(notice).toContain(dir);
    }
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

  test("named pure-Lua candidates are pure-lua", () => {
    for (const dir of [
      "defold-richtext",
      "defold-saver",
      "defsave",
      "defmath",
      "narrator",
      "squid",
      "starly",
      "defold-tweener",
      "defold-log",
      "defold-proto",
      "defold-lang",
    ]) {
      expect(byDir.get(dir)?.classification).toBe("pure-lua");
    }
  });

  test("goal-covered dirs are covered-by-goal", () => {
    expect(byDir.get("defold-lldebugger")?.classification).toBe("covered-by-goal");
    expect(byDir.get("defold-xmath")?.classification).toBe("covered-by-goal");
  });

  test("every vendored upstream dir is already-vendored", () => {
    expect(vendoredDirs.size).toBeGreaterThan(0);
    for (const dir of vendoredDirs) {
      expect(byDir.get(dir)?.classification).toBe("already-vendored");
    }
  });
});

describe("writeClassification", () => {
  test("writes a manifest matching classifyLibraryDirs on an injected tree (offline)", async () => {
    const source: LibrarySource = {
      repo: "https://github.com/ts-defold/library",
      commit: "0000000000000000000000000000000000000000",
      license: "MIT",
    };
    const root = mkdtempSync(join(tmpdir(), "library-types-classify-"));
    writeFileSync(
      join(root, "library-targets.json"),
      JSON.stringify({
        source,
        targets: [
          {
            module: "monarch.monarch",
            path: "packages/monarch/monarch.monarch.d.ts",
            fixture: "f",
            generated: "g",
          },
        ],
      }),
    );
    const listTree: ListTree = async () => [
      "packages/monarch/monarch.monarch.d.ts",
      "packages/DAABBCC/daabbcc.d.ts",
      "packages/DAABBCC/aabb.d.ts",
      "packages/defold-richtext/richtext.richtext.d.ts",
      "packages/defold-lldebugger/lldebugger.debug.d.ts",
      "packages/tsconfig.json",
      "README.md",
    ];

    await writeClassification(root, { listTree });

    const written = JSON.parse(
      readFileSync(join(root, "library-classification.json"), "utf8"),
    ) as ClassificationManifest;
    expect(written.source.commit).toBe(source.commit);
    const byDir = new Map(written.dirs.map((e) => [e.dir, e] as const));
    expect(byDir.get("monarch")?.classification).toBe("already-vendored");
    expect(byDir.get("DAABBCC")?.classification).toBe("native");
    expect(byDir.get("defold-richtext")?.classification).toBe("pure-lua");
    expect(byDir.get("defold-lldebugger")?.classification).toBe("covered-by-goal");

    const expected = classifyLibraryDirs(
      [...libraryModulesFromTree(await listTree(source))].map(([dir, modules]) => ({
        dir,
        modules,
      })),
      {
        vendoredDirs: new Set(["monarch"]),
        coveredByGoalDirs: new Set(["defold-lldebugger", "defold-xmath"]),
      },
    );
    expect(written.dirs).toEqual(expected);
  });
});
