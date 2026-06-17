import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseDefoldApiDoc } from "../src/api-doc";
import { MODULE_MANIFEST } from "./regen";
import {
  buildCoverageReport,
  EXTENSION_MANIFEST,
  parseChecklistNamespaces,
  readZip,
  SYNC_MANIFEST,
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
    expect(graphics?.fixture).toBe("fixtures/graphics_doc.json");
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

  test("every entry's fixture is a fixtures/*_doc.json path and zipEntry is non-empty", () => {
    for (const entry of SYNC_MANIFEST) {
      // Dotted namespaces (e.g. `b2d.body`) override the default `fixtures/<ns>_doc.json`
      // pattern with an underscore-joined form (`fixtures/b2d_body_doc.json`); the on-disk
      // filename must never carry dots because the dot is a route separator on the docs site.
      const expected = `fixtures/${entry.namespace.replace(/\./g, "_")}_doc.json`;
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
      expect(entry.fixture).toBe(`fixtures/${entry.namespace}_doc.json`);
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
