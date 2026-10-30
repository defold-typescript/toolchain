import { describe, expect, test } from "bun:test";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { newestDataFolder } from "../packages/cli/src/library/data-folder.ts";
import type {
  AssetPortalManifest,
  PortalEntry,
  PortalRepo,
} from "../packages/cli/src/library/sync-asset-portal.ts";
import {
  type DefoldExtensionsManifest,
  isSafePageKey,
} from "../packages/cli/src/library/sync-defold-extensions.ts";
import {
  type AssetPortalScriptApiManifest,
  type ScriptApiSource,
  syncAssetPortalScriptApi,
} from "./sync-asset-portal-script-api.ts";

const REAL_PACKAGE_ROOT = join(import.meta.dir, "..", "packages", "library-types");
const REAL_DATA_DIR = newestDataFolder(REAL_PACKAGE_ROOT);
const SYNCED_AT = "2026-10-21T00:00:00.000Z";

const ASTAR_SCRIPT_API = `- name: astar
  type: table
  desc: A* pathfinding.
  members:
  - name: ASTAR_NORTH
    type: number
    desc: The north direction.
  - name: solve
    type: function
    desc: Solve a path.
    parameters:
    - name: callback
      type: function
      parameters:
      - name: result
        type: table
        fields:
        - name: cost
          type: number
`;

// A JSON string is a YAML double-quoted scalar, so a namespace holding `/`, `\`,
// a newline or a control character reaches the converter unchanged.
function scriptApiDeclaring(namespace: string): string {
  return `- name: ${JSON.stringify(namespace)}\n  type: table\n  desc: A declared table.\n  members:\n  - name: run\n    type: function\n`;
}

function scriptApiEntry(overrides: Partial<PortalEntry> & { id: string }): PortalEntry {
  return {
    name: overrides.id,
    description: `The ${overrides.id} portal description.`,
    tags: [],
    portalLibrary: true,
    repo: `https://github.com/acme/${overrides.id}`,
    archived: false,
    fork: false,
    pushedAt: "2026-10-01T00:00:00Z",
    stars: 1,
    ref: "1.0.0",
    refKind: "release",
    includeDirs: [overrides.id],
    scriptApi: 1,
    extManifest: 1,
    lua: 0,
    luaSampled: 0,
    luaAnnotated: 0,
    kind: "script-api",
    ...overrides,
  };
}

const DEFOLD_PAD_REPO = "https://github.com/defold/extension-pad";

/**
 * A `library-types` package root beside a `types` dir declaring the engine `gui`,
 * with the real lane registries except a one-library Defold manifest (page `pad`),
 * one native target (`share`) and one vendored library (`monarch`).
 */
function packageRoot(entries: PortalEntry[], verdicts: Record<string, string> = {}): string {
  const base = mkdtempSync(join(tmpdir(), "portal-script-api-"));
  const root = join(base, "library-types");
  mkdirSync(join(base, "types"), { recursive: true });
  mkdirSync(join(root, "api-doc"), { recursive: true });
  for (const file of readdirSync(REAL_PACKAGE_ROOT)) {
    if (file.endsWith(".json") && file !== "asset-portal-script-api.json") {
      copyFileSync(join(REAL_PACKAGE_ROOT, file), join(root, file));
    }
  }
  const data = join(root, relative(REAL_PACKAGE_ROOT, REAL_DATA_DIR));
  mkdirSync(data, { recursive: true });
  for (const file of readdirSync(REAL_DATA_DIR)) {
    if (file.endsWith(".json")) copyFileSync(join(REAL_DATA_DIR, file), join(data, file));
  }
  writeFileSync(
    join(base, "types", "api-targets.json"),
    JSON.stringify({ targets: [{ modules: [{ namespace: "gui" }] }] }),
  );
  writeFileSync(join(root, "api-doc", "monarch.json"), "{}");
  const authored = JSON.parse(readFileSync(join(data, "authored-targets.json"), "utf8")) as {
    targets: Record<string, unknown>[];
  };
  authored.targets.push({
    ...authored.targets[0],
    moduleId: "monarch.vendored",
    namespace: "monarch",
    apiDoc: "api-doc/monarch.json",
  });
  writeFileSync(join(data, "authored-targets.json"), JSON.stringify(authored));
  writeFileSync(
    join(root, "defold-extensions.json"),
    JSON.stringify({
      libraries: [
        {
          repo: DEFOLD_PAD_REPO,
          ref: "1.0.0",
          refKind: "release",
          license: "MIT",
          description: "",
          docs: [{ path: "pad/api/pad.script_api", namespace: "pad", page: "pad" }],
        },
      ],
    }),
  );
  writeFileSync(
    join(data, "native-targets.json"),
    JSON.stringify({
      targets: [{ repo: "https://github.com/acme/native-share", ref: "1", namespace: "share" }],
    }),
  );
  writeFileSync(join(root, "asset-portal-aliases.json"), JSON.stringify({ aliases: {} }));
  writeFileSync(join(root, "asset-portal-verdicts.json"), JSON.stringify({ verdicts }));
  const manifest: AssetPortalManifest = {
    source: {
      repo: "https://github.com/defold/asset-portal",
      commit: "a".repeat(40),
      syncedAt: SYNCED_AT,
    },
    entries,
  };
  writeFileSync(join(root, "asset-portal.json"), JSON.stringify(manifest));
  return root;
}

/** `packageRoot` plus an empty committed manifest and one prior api-doc, `kept.json`. */
function seededPackageRoot(entries: PortalEntry[]): string {
  const root = packageRoot(entries);
  writeFileSync(
    join(root, "asset-portal-script-api.json"),
    `${JSON.stringify({ libraries: [] }, null, 2)}\n`,
  );
  const apiDoc = join(root, "asset-portal-script-api", "api-doc");
  mkdirSync(apiDoc, { recursive: true });
  writeFileSync(join(apiDoc, "kept.json"), "{}");
  return root;
}

function repoMeta(fullName: string): PortalRepo {
  return {
    full_name: fullName,
    archived: false,
    fork: false,
    pushed_at: "2026-10-01T00:00:00Z",
    stargazers_count: 1,
    default_branch: "main",
    license: { spdx_id: "MIT" },
  };
}

/** Every repo is live under its own name; `trees` keys `owner/repo@ref`, `files` keys raw URLs. */
function fakeSource(
  trees: Record<string, string[]>,
  files: Record<string, string>,
): ScriptApiSource & { fetched: string[] } {
  const fetched: string[] = [];
  return {
    fetched,
    repo: async (ownerRepo) => repoMeta(ownerRepo),
    tree: async (fullName, ref) => {
      const tree = trees[`${fullName}@${ref}`];
      if (!tree) throw new Error(`no tree for ${fullName}@${ref}`);
      return tree;
    },
    fetchText: async (url) => {
      fetched.push(url);
      const text = files[url];
      if (text === undefined) throw new Error(`fetch failed: ${url} -> 404`);
      return text;
    },
  };
}

function raw(ownerRepo: string, ref: string, path: string): string {
  return `https://raw.githubusercontent.com/${ownerRepo}/${ref}/${path}`;
}

/** One candidate per namespace, each in its own `acme/<repo>` shipping `<repo>/api.script_api`. */
function declaring(docs: { repo: string; namespace: string }[]): {
  entries: PortalEntry[];
  source: ScriptApiSource;
} {
  const trees: Record<string, string[]> = {};
  const files: Record<string, string> = {};
  const entries = docs.map(({ repo, namespace }) => {
    const ownerRepo = repo.includes("/") ? repo : `acme/${repo}`;
    const name = ownerRepo.split("/")[1] ?? repo;
    const id = ownerRepo.replace("/", "-");
    trees[`${ownerRepo}@1.0.0`] = [`${name}/api.script_api`];
    files[raw(ownerRepo, "1.0.0", `${name}/api.script_api`)] = scriptApiDeclaring(namespace);
    return scriptApiEntry({ id, repo: `https://github.com/${ownerRepo}`, includeDirs: [name] });
  });
  return { entries, source: fakeSource(trees, files) };
}

function pagesOf(manifest: AssetPortalScriptApiManifest): Record<string, string> {
  return Object.fromEntries(
    manifest.libraries.flatMap((library) =>
      library.docs.map((doc) => [`${library.repo}#${doc.namespace}`, doc.page]),
    ),
  );
}

/** Every file under `dir`, keyed by its path relative to `dir`. */
function snapshot(dir: string): Record<string, Buffer> {
  const files: Record<string, Buffer> = {};
  for (const path of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    if (statSync(join(dir, path)).isFile()) files[path] = readFileSync(join(dir, path));
  }
  return files;
}

describe("syncAssetPortalScriptApi — selection and pin", () => {
  const astar = scriptApiEntry({
    id: "astar",
    repo: "https://github.com/acme/defold-astar",
    ref: "v1.2.3",
    refKind: "tag",
    includeDirs: ["astar"],
  });
  const astarSource = () =>
    fakeSource(
      {
        "acme/defold-astar@v1.2.3": [
          "game.project",
          "astar/api/astar.script_api",
          "example/demo.script_api",
        ],
      },
      { [raw("acme/defold-astar", "v1.2.3", "astar/api/astar.script_api")]: ASTAR_SCRIPT_API },
    );

  test("a script-api candidate yields one library at its manifest pin, paging only include_dirs docs", async () => {
    const root = packageRoot([astar]);
    const source = astarSource();
    const manifest = await syncAssetPortalScriptApi(root, source);
    expect(manifest.libraries).toEqual([
      {
        id: "astar",
        repo: "https://github.com/acme/defold-astar",
        ref: "v1.2.3",
        refKind: "tag",
        license: "MIT",
        description: "The astar portal description.",
        docs: [{ path: "astar/api/astar.script_api", namespace: "astar", page: "astar" }],
      },
    ]);
    expect(source.fetched).toEqual([
      raw("acme/defold-astar", "v1.2.3", "astar/api/astar.script_api"),
    ]);
    expect(JSON.parse(readFileSync(join(root, "asset-portal-script-api.json"), "utf8"))).toEqual(
      manifest,
    );
  });

  test("a candidate whose portal entry carries refDate copies it directly after refKind", async () => {
    const root = packageRoot([{ ...astar, refDate: "2024-03-01T00:00:00Z" }]);
    const [library] = (await syncAssetPortalScriptApi(root, astarSource())).libraries;
    expect(library?.refDate).toBe("2024-03-01T00:00:00Z");
    const keys = Object.keys(library ?? {});
    expect(keys.indexOf("refDate")).toBe(keys.indexOf("refKind") + 1);
    const written = JSON.parse(readFileSync(join(root, "asset-portal-script-api.json"), "utf8"));
    expect(written.libraries[0].refDate).toBe("2024-03-01T00:00:00Z");
  });

  test("the written api-doc is the complete conversion, constants and nested callback fields included", async () => {
    const root = packageRoot([astar]);
    await syncAssetPortalScriptApi(root, astarSource());
    const doc = JSON.parse(
      readFileSync(join(root, "asset-portal-script-api", "api-doc", "astar.json"), "utf8"),
    ) as {
      info: { namespace: string };
      elements: { type: string; name: string; parameters?: { fields?: unknown[] }[] }[];
    };
    expect(doc.info.namespace).toBe("astar");
    expect(doc.elements.find((e) => e.name === "astar.ASTAR_NORTH")?.type).toBe("CONSTANT");
    const callback = doc.elements.find((e) => e.name === "astar.solve")?.parameters?.[0];
    expect(callback?.fields).toEqual([
      {
        name: "result",
        doc: "",
        types: ["table"],
        fields: [{ name: "cost", doc: "", types: ["number"] }],
      },
    ]);
  });

  test("an entry a lane pins, a declined entry and a pure-lua candidate yield no library", async () => {
    const root = packageRoot(
      [
        astar,
        scriptApiEntry({ id: "pad", repo: DEFOLD_PAD_REPO }),
        scriptApiEntry({ id: "editor-only" }),
        scriptApiEntry({ id: "plain-lua", kind: "pure-lua", scriptApi: 0 }),
      ],
      { "editor-only": "editor script only" },
    );
    const manifest = await syncAssetPortalScriptApi(root, astarSource());
    expect(manifest.libraries.map((library) => library.id)).toEqual(["astar"]);
  });

  test("a re-sync over its own output pages the same library again", async () => {
    const root = packageRoot([astar]);
    const first = await syncAssetPortalScriptApi(root, astarSource());
    const second = await syncAssetPortalScriptApi(root, astarSource());
    expect(second).toEqual(first);
    expect(second.libraries.map((library) => library.id)).toEqual(["astar"]);
    expect(existsSync(join(root, "asset-portal-script-api", "api-doc", "astar.json"))).toBe(true);
  });

  test("a stale api-doc from an earlier sync is removed", async () => {
    const root = packageRoot([astar]);
    const apiDoc = join(root, "asset-portal-script-api", "api-doc");
    mkdirSync(apiDoc, { recursive: true });
    writeFileSync(join(apiDoc, "gone.json"), "{}");
    await syncAssetPortalScriptApi(root, astarSource());
    expect(readdirSync(apiDoc)).toEqual(["astar.json"]);
  });

  test("a candidate whose include_dirs hold no .script_api at its pin throws naming the repo and pin", async () => {
    const root = packageRoot([astar]);
    const source = fakeSource({ "acme/defold-astar@v1.2.3": ["example/demo.script_api"] }, {});
    await expect(syncAssetPortalScriptApi(root, source)).rejects.toThrow(
      "https://github.com/acme/defold-astar@v1.2.3",
    );
  });

  test("a .script_api the converter rejects throws naming its raw URL", async () => {
    const root = packageRoot([astar]);
    const url = raw("acme/defold-astar", "v1.2.3", "astar/api/astar.script_api");
    const source = fakeSource(
      { "acme/defold-astar@v1.2.3": ["astar/api/astar.script_api"] },
      { [url]: "- name: astar\n  type: table\n  members: [\n" },
    );
    await expect(syncAssetPortalScriptApi(root, source)).rejects.toThrow(url);
  });
});

describe("syncAssetPortalScriptApi — page keys", () => {
  test("a doc shadowing an engine, Defold, native or vendored page takes a repo-qualified key", async () => {
    const { entries, source } = declaring([
      { repo: "defold-ui", namespace: "gui" },
      { repo: "defold-gamepad", namespace: "pad" },
      { repo: "defold-sharing", namespace: "share" },
      { repo: "defold-router", namespace: "monarch" },
    ]);
    const manifest = await syncAssetPortalScriptApi(packageRoot(entries), source);
    expect(pagesOf(manifest)).toEqual({
      "https://github.com/acme/defold-ui#gui": "ui.gui",
      "https://github.com/acme/defold-gamepad#pad": "gamepad.pad",
      "https://github.com/acme/defold-sharing#share": "sharing.share",
      "https://github.com/acme/defold-router#monarch": "router.monarch",
    });
  });

  test("two candidates declaring one namespace: the repo named for it keeps it, the other takes its stem", async () => {
    const { entries, source } = declaring([
      { repo: "rnd", namespace: "rnd" },
      { repo: "defold-rng", namespace: "rnd" },
    ]);
    const manifest = await syncAssetPortalScriptApi(packageRoot(entries), source);
    expect(pagesOf(manifest)).toEqual({
      "https://github.com/acme/rnd#rnd": "rnd",
      "https://github.com/acme/defold-rng#rnd": "rng",
    });
  });

  test("a key that still collides throws naming both docs and asset-portal-script-api", async () => {
    const { entries, source } = declaring([
      { repo: "acme/rng", namespace: "rng" },
      { repo: "bob/rng", namespace: "rng" },
    ]);
    await expect(syncAssetPortalScriptApi(packageRoot(entries), source)).rejects.toThrow(
      /^asset-portal-script-api: page key "rng" is claimed by both acme\/rng\/rng\/api\.script_api \(rng\) and bob\/rng\/rng\/api\.script_api \(rng\)/,
    );
  });

  test("a key that traverses out of api-doc throws before any file under the package changes", async () => {
    const { entries, source } = declaring([{ repo: "escape", namespace: "../../asset-portal" }]);
    const root = seededPackageRoot(entries);
    const before = snapshot(dirname(root));
    await expect(syncAssetPortalScriptApi(root, source)).rejects.toThrow(
      'asset-portal-script-api: page key "../../asset-portal" from acme/escape/escape/api.script_api ',
    );
    expect(snapshot(dirname(root))).toEqual(before);
  });

  test.each([
    "CON",
    "con",
    "Nul",
    "PRN",
    "AUX",
    "COM0",
    "COM1",
    "com9",
    "LPT1",
    "lpt9",
    "CON.api",
    "nul.tar.gz",
    "Aux.cmd",
  ])("key %p is a Windows device name and throws before any file under the package changes", async (namespace) => {
    const { entries, source } = declaring([{ repo: "device", namespace }]);
    const root = seededPackageRoot(entries);
    const before = snapshot(dirname(root));
    await expect(syncAssetPortalScriptApi(root, source)).rejects.toThrow(
      `asset-portal-script-api: page key ${JSON.stringify(namespace)} from acme/device/device/api.script_api `,
    );
    expect(snapshot(dirname(root))).toEqual(before);
  });

  test("a derived key whose stem is a Windows device name throws naming the derived key", async () => {
    const { entries, source } = declaring([{ repo: "defold-nul", namespace: "gui" }]);
    await expect(syncAssetPortalScriptApi(packageRoot(entries), source)).rejects.toThrow(
      'asset-portal-script-api: page key "nul.gui" from acme/defold-nul/defold-nul/api.script_api ',
    );
  });

  test("keys that only contain or extend a Windows device name pass and each writes its api-doc", async () => {
    const { entries, source } = declaring([
      { repo: "console", namespace: "console" },
      { repo: "con-x", namespace: "con-x" },
      { repo: "com10", namespace: "com10" },
      { repo: "lpt", namespace: "lpt" },
      { repo: "nullable", namespace: "nullable" },
      { repo: "rive", namespace: "rive.con" },
    ]);
    const root = packageRoot(entries);
    const manifest = await syncAssetPortalScriptApi(root, source);
    expect(pagesOf(manifest)).toEqual({
      "https://github.com/acme/console#console": "console",
      "https://github.com/acme/con-x#con-x": "con-x",
      "https://github.com/acme/com10#com10": "com10",
      "https://github.com/acme/lpt#lpt": "lpt",
      "https://github.com/acme/nullable#nullable": "nullable",
      "https://github.com/acme/rive#rive.con": "rive.con",
    });
    expect(readdirSync(join(root, "asset-portal-script-api", "api-doc")).sort()).toEqual([
      "com10.json",
      "con-x.json",
      "console.json",
      "lpt.json",
      "nullable.json",
      "rive.con.json",
    ]);
  });

  test.each([
    "a/b",
    "a\\b",
    "..",
    ".",
    ".hidden",
    "trailing.",
    "-lead",
    "has space",
    "line\nbreak",
    "bad\u0001key",
    "q?x",
    "pct%2f",
  ])("key %p is no safe route and file-name segment and throws naming it", async (namespace) => {
    const { entries, source } = declaring([{ repo: "unsafe", namespace }]);
    await expect(syncAssetPortalScriptApi(packageRoot(entries), source)).rejects.toThrow(
      `asset-portal-script-api: page key ${JSON.stringify(namespace)} from acme/unsafe/unsafe/api.script_api `,
    );
  });

  test("dotted, underscored and hyphenated keys pass and each writes its api-doc", async () => {
    const { entries, source } = declaring([
      { repo: "rive", namespace: "rive.cmd" },
      { repo: "defold-page-visibility", namespace: "page_visibility" },
      { repo: "firebase", namespace: "firebase" },
      { repo: "firebase-analytics", namespace: "firebase" },
    ]);
    const root = packageRoot(entries);
    const manifest = await syncAssetPortalScriptApi(root, source);
    expect(pagesOf(manifest)).toEqual({
      "https://github.com/acme/rive#rive.cmd": "rive.cmd",
      "https://github.com/acme/defold-page-visibility#page_visibility": "page_visibility",
      "https://github.com/acme/firebase#firebase": "firebase",
      "https://github.com/acme/firebase-analytics#firebase": "firebase-analytics",
    });
    expect(readdirSync(join(root, "asset-portal-script-api", "api-doc")).sort()).toEqual([
      "firebase-analytics.json",
      "firebase.json",
      "page_visibility.json",
      "rive.cmd.json",
    ]);
  });

  test("every committed Defold extension and portal page key is safe", () => {
    const pages = ["defold-extensions.json", "asset-portal-script-api.json"].flatMap((file) =>
      (
        JSON.parse(readFileSync(join(REAL_PACKAGE_ROOT, file), "utf8")) as
          | DefoldExtensionsManifest
          | AssetPortalScriptApiManifest
      ).libraries.flatMap((library) => library.docs.map((doc) => doc.page)),
    );
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.filter((page) => !isSafePageKey(page))).toEqual([]);
  });
});
