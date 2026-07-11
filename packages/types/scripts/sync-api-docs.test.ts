import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseDefoldApiDoc } from "../src/api-doc";
import { MODULE_MANIFEST } from "./regen";
import {
  buildCoverageReport,
  collectUpstreamNamespaces,
  EXTENSION_MANIFEST,
  extractFixtures,
  IGNORED_UPSTREAM,
  LUA_STDLIB_MANIFEST,
  mergeApiDocs,
  parseChecklistNamespaces,
  readZip,
  SYNC_MANIFEST,
  type SyncManifestEntry,
  scriptApiToFixtureJson,
  syncFixtures,
  UNMAPPED,
  type ZipAccessor,
} from "./sync-api-docs";

const VISION = resolve(import.meta.dir, "..", "..", "..", "docs", "prd", "vision.md");

function fakeZip(entries: Record<string, string>): ZipAccessor {
  return {
    has: (entry) => Object.hasOwn(entries, entry),
    entries: () => Object.keys(entries),
    read: (entry) => {
      if (!Object.hasOwn(entries, entry)) throw new Error(`fake zip missing entry: ${entry}`);
      return entries[entry] as string;
    },
  };
}

describe("SYNC_MANIFEST coverage", () => {
  // vision.md lives under the gitignored planning-doc surface, so it is absent
  // in a fresh checkout (CI). This cross-check runs only where that private doc
  // exists; it is an authoring-time guard, not a shipped invariant.
  test.skipIf(!existsSync(VISION))(
    "covers every vision.md checklist namespace (core-mapped, extension-mapped, or UNMAPPED)",
    async () => {
      const checklist = parseChecklistNamespaces(await Bun.file(VISION).text());
      expect(checklist.length).toBeGreaterThan(0);
      const mapped = new Set([...SYNC_MANIFEST, ...EXTENSION_MANIFEST].map((e) => e.namespace));
      const missing = checklist.filter((ns) => !mapped.has(ns) && !UNMAPPED.has(ns));
      expect(missing).toEqual([]);
    },
  );

  test("maps graphics to its src-script ref-doc entry", () => {
    const graphics = SYNC_MANIFEST.find((e) => e.namespace === "graphics");
    expect(graphics?.zipEntry).toBe("doc/src-script_graphics.cpp_doc.json");
    expect(graphics?.fixture).toBe("fixtures/defold-1.13.0/graphics_doc.json");
  });

  test("maps font to its scripts-script ref-doc entry", () => {
    const font = SYNC_MANIFEST.find((e) => e.namespace === "font");
    expect(font?.zipEntry).toBe("doc/scripts-script_font.cpp_doc.json");
    expect(font?.fixture).toBe("fixtures/defold-1.13.0/font_doc.json");
  });

  test("every UNMAPPED entry carries a non-empty reason", () => {
    for (const [namespace, reason] of UNMAPPED) {
      expect(reason.length).toBeGreaterThan(0);
      expect(namespace.length).toBeGreaterThan(0);
    }
  });

  test("a namespace is never both mapped and unmapped", () => {
    for (const entry of SYNC_MANIFEST) {
      expect(UNMAPPED.has(entry.namespace)).toBe(false);
    }
  });

  test("every entry's fixture is a 1.13.0 *_doc.json path and zipEntry is non-empty", () => {
    for (const entry of SYNC_MANIFEST) {
      // Dotted namespaces use underscore-joined filenames inside the version-owned
      // fixture directory; dots remain route separators only in namespace ids.
      const expected = `fixtures/defold-1.13.0/${entry.namespace.replace(/\./g, "_")}_doc.json`;
      expect(entry.fixture).toBe(expected);
      expect(entry.zipEntry.length).toBeGreaterThan(0);
    }
  });

  test("every MODULE_MANIFEST namespace is mapped to a core or extension source", () => {
    const mapped = new Set([...SYNC_MANIFEST, ...EXTENSION_MANIFEST].map((e) => e.namespace));
    for (const entry of MODULE_MANIFEST) {
      expect(mapped.has(entry.namespace)).toBe(true);
    }
  });
});

const CORE_FIVE_STDLIB: ReadonlyArray<[string, string]> = [
  ["math", "doc/lua_math.doc_h_doc.json"],
  ["os", "doc/lua_os.doc_h_doc.json"],
  ["string", "doc/lua_string.doc_h_doc.json"],
  ["table", "doc/lua_table.doc_h_doc.json"],
  ["coroutine", "doc/lua_coroutine.doc_h_doc.json"],
];

const SANDBOXED_THREE: ReadonlyArray<[string, string]> = [
  ["debug", "doc/lua_debug.doc_h_doc.json"],
  ["io", "doc/lua_io.doc_h_doc.json"],
  ["package", "doc/lua_package.doc_h_doc.json"],
];

describe("LUA_STDLIB_MANIFEST", () => {
  test("maps base and bit to their ref-doc.zip entries with the standard fixture path", () => {
    expect(LUA_STDLIB_MANIFEST).toHaveLength(10);
    const base = LUA_STDLIB_MANIFEST.find((e) => e.namespace === "base");
    expect(base?.zipEntry).toBe("doc/lua_base.doc_h_doc.json");
    expect(base?.fixture).toBe("fixtures/defold-1.13.0/base_doc.json");
    const bit = LUA_STDLIB_MANIFEST.find((e) => e.namespace === "bit");
    expect(bit?.zipEntry).toBe("doc/src-script_bitop.cpp_doc.json");
    expect(bit?.fixture).toBe("fixtures/defold-1.13.0/bit_doc.json");
  });

  test("maps the five core stdlib namespaces to their confirmed 1.13.0 zip entries", () => {
    for (const [namespace, zipEntry] of CORE_FIVE_STDLIB) {
      const found = LUA_STDLIB_MANIFEST.find((e) => e.namespace === namespace);
      expect(found?.zipEntry).toBe(zipEntry);
      expect(found?.fixture).toBe(`fixtures/defold-1.13.0/${namespace}_doc.json`);
    }
  });

  test("maps the sandboxed debug/io/package namespaces to their confirmed 1.13.0 zip entries", () => {
    for (const [namespace, zipEntry] of SANDBOXED_THREE) {
      const found = LUA_STDLIB_MANIFEST.find((e) => e.namespace === namespace);
      expect(found?.zipEntry).toBe(zipEntry);
      expect(found?.fixture).toBe(`fixtures/defold-1.13.0/${namespace}_doc.json`);
    }
  });

  test("extractFixtures resolves all ten entries from a fake zip", () => {
    const entries: Record<string, string> = {
      "doc/lua_base.doc_h_doc.json": '{"info":{"namespace":"base"}}\n',
      "doc/src-script_bitop.cpp_doc.json": '{"info":{"namespace":"bit"}}\n',
    };
    for (const [namespace, zipEntry] of [...CORE_FIVE_STDLIB, ...SANDBOXED_THREE]) {
      entries[zipEntry] = `{"info":{"namespace":"${namespace}"}}\n`;
    }
    const zip = fakeZip(entries);
    const fixtures = extractFixtures(zip, LUA_STDLIB_MANIFEST);
    expect(fixtures.map((f) => f.namespace).sort()).toEqual([
      "base",
      "bit",
      "coroutine",
      "debug",
      "io",
      "math",
      "os",
      "package",
      "string",
      "table",
    ]);
    for (const [namespace, zipEntry] of [...CORE_FIVE_STDLIB, ...SANDBOXED_THREE]) {
      expect(fixtures.find((f) => f.namespace === namespace)?.contents).toBe(entries[zipEntry]);
    }
  });

  test("no LUA_STDLIB_MANIFEST namespace appears in MODULE_MANIFEST (docs-only, no generated .d.ts)", () => {
    for (const entry of LUA_STDLIB_MANIFEST) {
      expect(MODULE_MANIFEST.some((m) => m.namespace === entry.namespace)).toBe(false);
    }
  });

  test("IGNORED_UPSTREAM drops every wired stdlib namespace, leaving only the non-runtime surfaces", () => {
    for (const [namespace] of [...CORE_FIVE_STDLIB, ...SANDBOXED_THREE]) {
      expect(IGNORED_UPSTREAM.has(namespace)).toBe(false);
    }
    expect([...IGNORED_UPSTREAM.keys()].sort()).toEqual(["builtins", "editor", "engine"]);
  });
});

describe("parseChecklistNamespaces", () => {
  test("extracts a dotted sub-namespace token (b2d.body)", () => {
    const markdown = [
      "Concrete breadth checklist (one module fixture + one generated `.d.ts` per entry, driven by `MODULE_MANIFEST`):",
      "`go`, `b2d.body`, `vmath`.",
    ].join(" ");
    expect(parseChecklistNamespaces(markdown)).toEqual(["go", "b2d.body", "vmath"]);
  });

  test("rejects tokens with non-identifier segments", () => {
    const markdown = [
      "Concrete breadth checklist (one module fixture + one generated `.d.ts` per entry, driven by `MODULE_MANIFEST`):",
      "`go`, `bad-token`, `also.bad..name`, `1abc`, `ok`.",
    ].join(" ");
    expect(parseChecklistNamespaces(markdown)).toEqual(["go", "ok"]);
  });
});

describe("EXTENSION_MANIFEST", () => {
  test("each entry carries repo, tag, path, and the standard fixture path", () => {
    expect(EXTENSION_MANIFEST.length).toBeGreaterThan(0);
    for (const entry of EXTENSION_MANIFEST) {
      expect(entry.namespace.length).toBeGreaterThan(0);
      expect(entry.repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
      expect(entry.tag.length).toBeGreaterThan(0);
      expect(entry.path.length).toBeGreaterThan(0);
      expect(entry.fixture).toBe(`fixtures/defold-1.13.0/${entry.namespace}_doc.json`);
    }
  });

  test("an extension namespace is never also core-mapped or UNMAPPED", () => {
    const core = new Set(SYNC_MANIFEST.map((e) => e.namespace));
    for (const entry of EXTENSION_MANIFEST) {
      expect(core.has(entry.namespace)).toBe(false);
      expect(UNMAPPED.has(entry.namespace)).toBe(false);
    }
  });

  test("scriptApiToFixtureJson yields a core-format doc parseable by parseDefoldApiDoc", () => {
    const text = [
      "- name: demo",
      "  type: table",
      "  desc: A demo namespace.",
      "  members:",
      "  - name: greet",
      "    type: function",
      "    desc: Greet.",
      "    parameters:",
      "      - name: who",
      "        type: string",
      "        desc: the name",
    ].join("\n");
    const module = parseDefoldApiDoc(JSON.parse(scriptApiToFixtureJson(text)));
    expect(module.namespace).toBe("demo");
    expect(module.functions.map((f) => f.name)).toEqual(["demo.greet"]);
  });
});

describe("buildCoverageReport", () => {
  const fabricatedDoc = {
    info: { namespace: "baz" },
    elements: [
      { type: "FUNCTION", name: "baz.new", parameters: [], returnvalues: [] },
      {
        type: "FUNCTION",
        name: "baz.aim",
        parameters: [{ name: "id", types: ["cameraid"] }],
        returnvalues: [],
      },
    ],
  };

  const report = buildCoverageReport({
    manifest: [{ namespace: "foo" }, { namespace: "baz" }],
    moduleManifest: [{ namespace: "foo" }],
    unmapped: new Map([["bar", "extension-only surface"]]),
    syncedDocs: [{ namespace: "baz", doc: fabricatedDoc }],
  });

  test("classifies wired modules (in MODULE_MANIFEST)", () => {
    expect(report.wired).toContain("foo");
    expect(report.wired).not.toContain("baz");
  });

  test("classifies fixtureOnly modules (synced, not yet wired)", () => {
    expect(report.fixtureOnly).toContain("baz");
    expect(report.fixtureOnly).not.toContain("foo");
  });

  test("classifies missingMapping modules (checklist, no zip entry)", () => {
    expect(report.missingMapping).toContain("bar");
  });

  test("lists unknown type tokens that would emit `unknown`", () => {
    const baz = report.unknownTypeTokens.find((u) => u.namespace === "baz");
    expect(baz?.tokens).toContain("cameraid");
  });
});

describe("syncFixtures --check", () => {
  const manifest = [
    { namespace: "foo", zipEntry: "doc/foo.json", fixture: "fixtures/foo_doc.json" },
  ];

  function scratchRoot(committed: string): string {
    const root = mkdtempSync(join(tmpdir(), "sync-api-docs-"));
    const fixturesDir = join(root, "fixtures");
    mkdirSync(fixturesDir, { recursive: true });
    writeFileSync(join(fixturesDir, "foo_doc.json"), committed);
    return root;
  }

  test("reports clean when zip content matches the committed fixture", () => {
    const content = '{"info":{"namespace":"foo"}}\n';
    const root = scratchRoot(content);
    const results = syncFixtures(fakeZip({ "doc/foo.json": content }), {
      fixturesRoot: root,
      check: true,
      manifest,
    });
    expect(results).toHaveLength(1);
    expect(results[0]?.status).toBe("clean");
  });

  test("reports clean when committed fixture is byte-different but semantically identical", () => {
    const committed = '{"info":{"namespace":"foo"},"elements":[1, 2]}\n';
    const incoming =
      '{\n  "info": {\n    "namespace": "foo"\n  },\n  "elements": [\n    1,\n    2\n  ]\n}';
    const root = scratchRoot(committed);
    const results = syncFixtures(fakeZip({ "doc/foo.json": incoming }), {
      fixturesRoot: root,
      check: true,
      manifest,
    });
    expect(results[0]?.status).toBe("clean");
    expect(readFileSync(join(root, "fixtures", "foo_doc.json"), "utf8")).toBe(committed);
  });

  test("reports drift without writing when zip content differs", () => {
    const committed = '{"info":{"namespace":"foo"}}\n';
    const root = scratchRoot(committed);
    const incoming = '{"info":{"namespace":"foo"},"elements":[]}\n';
    const results = syncFixtures(fakeZip({ "doc/foo.json": incoming }), {
      fixturesRoot: root,
      check: true,
      manifest,
    });
    expect(results[0]?.status).toBe("drift");
    expect(readFileSync(join(root, "fixtures", "foo_doc.json"), "utf8")).toBe(committed);
  });

  test("non-check write applies the format seam and the result re-checks clean", () => {
    const committed = '{"info":{"namespace":"foo"}}\n';
    const root = scratchRoot(committed);
    const incoming = '{"info":{"namespace":"foo"},"elements":[]}\n';
    const format = (raw: string) => JSON.stringify(JSON.parse(raw), null, 2);
    const written = syncFixtures(fakeZip({ "doc/foo.json": incoming }), {
      fixturesRoot: root,
      check: false,
      manifest,
      format,
    });
    expect(written[0]?.status).toBe("drift");
    const onDisk = readFileSync(join(root, "fixtures", "foo_doc.json"), "utf8");
    expect(onDisk).toBe(format(incoming));
    expect(JSON.parse(onDisk)).toEqual(JSON.parse(incoming));

    const rechecked = syncFixtures(fakeZip({ "doc/foo.json": incoming }), {
      fixturesRoot: root,
      check: true,
      manifest,
    });
    expect(rechecked[0]?.status).toBe("clean");
  });
});

function hasExecutable(command: string[]): boolean {
  // Bun.spawnSync throws "Executable not found in $PATH" when the binary is
  // absent (e.g. no `zip` on Windows runners) rather than returning a non-zero
  // exitCode, so a missing tool must be caught, not read off the result.
  try {
    return Bun.spawnSync(command).exitCode === 0;
  } catch {
    return false;
  }
}

function zipToolsAvailable(): boolean {
  return hasExecutable(["zip", "-h"]) && hasExecutable(["unzip", "-v"]);
}

describe("mergeApiDocs", () => {
  test("unions elements from every doc, preserving the first doc's info", () => {
    const a = {
      info: { namespace: "sys", brief: "core" },
      elements: [{ type: "FUNCTION", name: "sys.a" }],
    };
    const b = {
      info: { namespace: "sys", brief: "extra" },
      elements: [{ type: "FUNCTION", name: "sys.b" }],
    };
    const merged = mergeApiDocs([a, b]) as { info: unknown; elements: { name: string }[] };
    expect(merged.info).toEqual(a.info);
    expect(merged.elements.map((e) => e.name)).toEqual(["sys.a", "sys.b"]);
  });

  test("dedups matching signatures with first occurrence winning (b2d.body _defold hazard)", () => {
    const a = {
      info: { namespace: "b2d.body" },
      elements: [{ type: "FUNCTION", name: "get_world_center", doc: "first" }],
    };
    const b = {
      info: { namespace: "b2d.body" },
      elements: [
        { type: "FUNCTION", name: "get_world_center", doc: "second" },
        { type: "FUNCTION", name: "get_angle" },
      ],
    };
    const merged = mergeApiDocs([a, b]) as { elements: { name: string; doc?: string }[] };
    expect(merged.elements).toHaveLength(2);
    expect(merged.elements.find((e) => e.name === "get_world_center")?.doc).toBe("first");
  });

  test("keeps same-named elements of different types distinct", () => {
    const a = { info: { namespace: "n" }, elements: [{ type: "FUNCTION", name: "k" }] };
    const b = { info: { namespace: "n" }, elements: [{ type: "CONSTANT", name: "k" }] };
    const merged = mergeApiDocs([a, b]) as { elements: unknown[] };
    expect(merged.elements).toHaveLength(2);
  });
});

describe("extractFixtures merge", () => {
  test("reads every mergeEntry and folds them into one parseable fixture", () => {
    const manifest: SyncManifestEntry[] = [
      {
        namespace: "sys",
        zipEntry: "doc/main.json",
        fixture: "fixtures/sys_doc.json",
        mergeEntries: ["doc/extra.json"],
      },
    ];
    const zip = fakeZip({
      "doc/main.json": JSON.stringify({
        info: { namespace: "sys" },
        elements: [{ type: "FUNCTION", name: "sys.a", parameters: [], returnvalues: [] }],
      }),
      "doc/extra.json": JSON.stringify({
        info: { namespace: "sys" },
        elements: [{ type: "FUNCTION", name: "sys.b", parameters: [], returnvalues: [] }],
      }),
    });
    const [fixture] = extractFixtures(zip, manifest);
    const module = parseDefoldApiDoc(JSON.parse(fixture?.contents ?? ""));
    expect(module.functions.map((f) => f.name)).toEqual(["sys.a", "sys.b"]);
  });
});

describe("sys multi-source merge", () => {
  test("the sys SYNC_MANIFEST row merges the gamesys, engine, and DDF docs", () => {
    const sys = SYNC_MANIFEST.find((e) => e.namespace === "sys");
    expect(sys?.zipEntry).toBe("doc/script-script_engine.cpp_doc.json");
    expect(sys?.mergeEntries).toEqual([
      "doc/script-sys_ddf.proto_doc.json",
      "doc/scripts-script_sys_gamesys.cpp_doc.json",
      "doc/src-script_sys.cpp_doc.json",
    ]);
  });

  test("the vendored sys fixture carries the merged gamesys + engine functions", () => {
    const path = resolve(import.meta.dir, "..", "fixtures", "defold-1.13.0", "sys_doc.json");
    const module = parseDefoldApiDoc(JSON.parse(readFileSync(path, "utf8")));
    const names = new Set(module.functions.map((f) => f.name));
    for (const fn of [
      "sys.load_buffer",
      "sys.load_buffer_async",
      "sys.set_engine_throttle",
      "sys.set_render_enable",
    ]) {
      expect(names.has(fn)).toBe(true);
    }
  });
});

describe("upstream-coverage guard", () => {
  test("IGNORED_UPSTREAM is a ReadonlyMap of namespace -> non-empty sourced reason", () => {
    expect(IGNORED_UPSTREAM).toBeInstanceOf(Map);
    for (const [namespace, reason] of IGNORED_UPSTREAM) {
      expect(namespace.length).toBeGreaterThan(0);
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  test("collectUpstreamNamespaces reports each function-bearing doc with its count", () => {
    const zip = fakeZip({
      "doc/foo.json": JSON.stringify({
        info: { namespace: "foo" },
        elements: [
          { type: "FUNCTION", name: "foo.a" },
          { type: "CONSTANT", name: "foo.K" },
        ],
      }),
      "doc/bar.json": JSON.stringify({
        info: { namespace: "bar" },
        elements: [{ type: "CONSTANT", name: "bar.K" }],
      }),
      "doc/asset.txt": "not json",
    });
    const upstream = collectUpstreamNamespaces(zip);
    expect(upstream).toEqual([{ namespace: "foo", functionCount: 1, zipEntry: "doc/foo.json" }]);
  });

  test("buildCoverageReport flags an unmapped function-bearing namespace, and only it", () => {
    const zip = fakeZip({
      "doc/mapped.json": JSON.stringify({
        info: { namespace: "mapped" },
        elements: [{ type: "FUNCTION", name: "mapped.a" }],
      }),
      "doc/unmapped.json": JSON.stringify({
        info: { namespace: "unmapped" },
        elements: [{ type: "FUNCTION", name: "unmapped.a" }],
      }),
      "doc/allow.json": JSON.stringify({
        info: { namespace: "allow" },
        elements: [{ type: "FUNCTION", name: "allow.a" }],
      }),
      "doc/empty.json": JSON.stringify({
        info: { namespace: "empty" },
        elements: [{ type: "CONSTANT", name: "empty.K" }],
      }),
    });
    const report = buildCoverageReport({
      manifest: [],
      moduleManifest: [],
      unmapped: new Map(),
      syncedDocs: [],
      upstream: collectUpstreamNamespaces(zip),
      upstreamMapped: new Set(["mapped"]),
      ignoredUpstream: new Map([["allow", "allowlisted test namespace"]]),
    });
    expect(report.unmappedUpstream).toEqual([
      { namespace: "unmapped", zipEntry: "doc/unmapped.json" },
    ]);
  });

  test("native-SDK, empty, and uppercase namespaces are never flagged", () => {
    const zip = fakeZip({
      "doc/sdk.json": JSON.stringify({
        info: { namespace: "dmGraphics" },
        elements: [{ type: "FUNCTION", name: "Foo" }],
      }),
      "doc/blank.json": JSON.stringify({
        info: { namespace: "" },
        elements: [{ type: "FUNCTION", name: "Bar" }],
      }),
    });
    const report = buildCoverageReport({
      manifest: [],
      moduleManifest: [],
      unmapped: new Map(),
      syncedDocs: [],
      upstream: collectUpstreamNamespaces(zip),
      upstreamMapped: new Set(),
      ignoredUpstream: new Map(),
    });
    expect(report.unmappedUpstream).toEqual([]);
  });
});

describe("readZip entries", () => {
  test.skipIf(!zipToolsAvailable())(
    "surfaces every archive entry path, agreeing with has()",
    () => {
      const dir = mkdtempSync(join(tmpdir(), "readzip-entries-"));
      mkdirSync(join(dir, "api"), { recursive: true });
      writeFileSync(join(dir, "api", "ext.script_api"), "- name: ext\n");
      writeFileSync(join(dir, "ext.txt"), "asset");
      const zipPath = join(dir, "archive.zip");
      const zipped = Bun.spawnSync(["zip", "-r", zipPath, "api", "ext.txt"], { cwd: dir });
      expect(zipped.exitCode).toBe(0);

      const zip = readZip(zipPath);
      const entries = zip.entries();
      expect(entries).toContain("api/ext.script_api");
      expect(entries).toContain("ext.txt");
      for (const entry of entries) {
        expect(zip.has(entry)).toBe(true);
      }
    },
  );
});
