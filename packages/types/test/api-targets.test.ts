import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildFidelityReport } from "../scripts/fidelity-audit";
import {
  type ApiTarget,
  generateModuleDeclaration,
  generateVersionIndex,
  loadApiTargets,
  loadTargetModules,
  MODULE_MANIFEST,
  resolveTargetModules,
  VERSIONED_MODULE_MANIFEST,
} from "../scripts/regen";
import { DEFOLD_VERSION, SYNC_MANIFEST, type ZipAccessor } from "../scripts/sync-api-docs";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const GENERATED = resolve(PACKAGE_ROOT, "generated");
const EDITOR_DOCUMENT_FIXTURE = "editor_doc.json";
const EDITOR_NAMESPACE = "editor";

// Committed targets are the ones whose fixtures live in the repo; a `source`
// target is fetched, so its fixture tree is not a fact this suite can assert on.
function committedTargets(): readonly ApiTarget[] {
  return loadApiTargets().filter((target) => (target.source ?? null) === null);
}

function declaringTargets(): readonly ApiTarget[] {
  return committedTargets().filter((target) => (target.editorModules?.length ?? 0) > 0);
}

function firstSegment(dotted: string): string {
  return dotted.split(".")[0] ?? dotted;
}

// The top-level namespaces a target's editor document actually carries, read
// from the fixture rather than restated, so the expectation moves with upstream.
// dotted: a segment that owns members (`json.decode`) and so needs its own VM
// module; flat: a segment that is itself the element (`pprint`) and can only be
// covered by an exact skip rule. `editor` is excluded — it is the entry the
// rules live on, not a namespace split out of it.
function editorDocumentNamespaces(target: ApiTarget): {
  dotted: ReadonlySet<string>;
  flat: ReadonlySet<string>;
} {
  const doc = JSON.parse(
    readFileSync(resolve(PACKAGE_ROOT, target.fixturesDir, EDITOR_DOCUMENT_FIXTURE), "utf8"),
  ) as { elements: { name: string }[] };
  const dotted = new Set<string>();
  const flat = new Set<string>();
  for (const element of doc.elements) {
    const segment = firstSegment(element.name);
    if (segment === EDITOR_NAMESPACE) continue;
    if (element.name === segment) flat.add(segment);
    else dotted.add(segment);
  }
  return { dotted, flat };
}

function labelRefDocZip(): { fakeZip: ZipAccessor; cacheDir: string; version: string } {
  // Intentionally historical: 1.9.8 is a fixed ref-doc regression target, not the
  // current/previous release, so it stays a literal across version bumps.
  const version = "1.9.8";
  const labelEntry = SYNC_MANIFEST.find((e) => e.namespace === "label");
  if (!labelEntry) throw new Error("no label SYNC_MANIFEST entry");
  const labelDoc = readFileSync(resolve(PACKAGE_ROOT, "fixtures", "label_doc.json"), "utf8");
  const fakeZip: ZipAccessor = {
    has: (e) => e === labelEntry.zipEntry,
    entries: () => [labelEntry.zipEntry],
    read: (e) => {
      if (e !== labelEntry.zipEntry) throw new Error(`unexpected zip entry ${e}`);
      return labelDoc;
    },
  };
  const cacheDir = mkdtempSync(resolve(tmpdir(), "ref-doc-cache-"));
  mkdirSync(resolve(cacheDir, version), { recursive: true });
  writeFileSync(resolve(cacheDir, version, "ref-doc.zip"), "seeded");
  return { fakeZip, cacheDir, version };
}

const noDownload = async (): Promise<Uint8Array> => {
  throw new Error("download should not be called");
};

describe("api-targets registry", () => {
  test("the current version is the sole default and every demoted committed target is a complete subset", () => {
    const targets = loadApiTargets();
    const current = targets.find((target) => target.id === `defold-${DEFOLD_VERSION}`);
    // Demoted releases are the committed targets that are not the default,
    // identified structurally so a version bump follows the registry (and the
    // `DEFOLD_VERSION` the registry's default id is cross-checked against here).
    const committedNonDefault = targets.filter(
      (target) => target.source == null && target.default !== true,
    );
    expect(committedNonDefault.length).toBeGreaterThanOrEqual(1);

    expect(targets.filter((target) => target.default === true).map((target) => target.id)).toEqual([
      `defold-${DEFOLD_VERSION}`,
    ]);
    expect(current?.source).toBeNull();
    const currentNamespaces = new Set(current?.modules.map((module) => module.namespace));
    for (const demoted of committedNonDefault) {
      expect(demoted.default).toBe(false);
      expect(demoted.source).toBeNull();
      for (const module of demoted.modules) {
        expect(currentNamespaces.has(module.namespace)).toBe(true);
      }
      expect(demoted.modules.length).toBeGreaterThanOrEqual(39);
    }
  });

  // A toolchain upgrade must not strand a team on an engine it can no longer
  // type-check: 1.13.0 was dropped by the 0.26.0 patch rotation and restored, and
  // a silent second removal is the regression this names.
  test("defold-1.13.0 stays a committed, demoted rollback target", () => {
    const restored = loadApiTargets().find((target) => target.id === "defold-1.13.0");
    expect(restored).toBeDefined();
    expect(restored?.default).toBe(false);
    expect(restored?.source).toBeNull();
  });

  test("registry parses and shape is valid", () => {
    const targets = loadApiTargets();
    expect(targets.length).toBeGreaterThanOrEqual(1);
    expect(targets.filter((t) => t.default === true)).toHaveLength(1);
    for (const target of targets) {
      expect(typeof target.id).toBe("string");
      expect(typeof target.fixturesDir).toBe("string");
      expect(typeof target.generatedDir).toBe("string");
      expect(typeof target.coreTypesImport).toBe("string");
      expect(target.modules.length).toBeGreaterThan(0);
    }
  });

  test("every registry module references an existing fixture file", () => {
    for (const target of loadApiTargets().filter((t) => t.source == null)) {
      for (const module of target.modules) {
        const path = resolve(PACKAGE_ROOT, target.fixturesDir, module.fixture);
        expect(existsSync(path)).toBe(true);
      }
    }
  });

  test("b2d.body module references fixtures/b2d_body_doc.json and its committed .d.ts byte-matches regen", async () => {
    const target = loadApiTargets().find((t) => t.default === true);
    if (!target) throw new Error("no default target");
    const module = target.modules.find((m) => m.namespace === "b2d.body");
    if (!module) throw new Error("no b2d.body module in default target");
    const fixturePath = resolve(PACKAGE_ROOT, target.fixturesDir, module.fixture);
    expect(existsSync(fixturePath)).toBe(true);
    const entry = loadTargetModules(target).find((e) => e.namespace === "b2d.body");
    if (!entry) throw new Error("no b2d.body entry from loadTargetModules");
    const { contents: fresh } = generateModuleDeclaration(entry);
    const committed = await Bun.file(resolve(GENERATED, entry.outFile)).text();
    expect(committed).toBe(fresh);
  });

  test("every registry module regenerates byte-for-byte", async () => {
    for (const target of loadApiTargets().filter((t) => t.source == null)) {
      for (const entry of loadTargetModules(target)) {
        const { contents: fresh } = generateModuleDeclaration(entry);
        const committed = await Bun.file(
          target.default
            ? resolve(GENERATED, entry.outFile)
            : resolve(GENERATED, "versions", target.id, entry.outFile),
        ).text();
        expect(committed).toBe(fresh);
      }
    }
  });

  test("the promoted surface has no unknown tokens or uncovered dropped declarations", () => {
    const report = buildFidelityReport(MODULE_MANIFEST);
    for (const entry of Object.values(report)) {
      expect(entry.unknownTokens).toEqual([]);
      expect(entry.droppedElements).toBe(0);
      expect(entry.droppedMembers).toBe(0);
    }
  });

  test("MODULE_MANIFEST equals the default target's modules", () => {
    const targets = loadApiTargets();
    const defaultTarget = targets.find((t) => t.default === true);
    if (!defaultTarget) throw new Error("no default target");
    const registry = defaultTarget.modules.map((m) => ({
      namespace: m.namespace,
      outFile: m.outFile,
      skipFunctions: m.skipFunctions ?? undefined,
    }));
    const manifest = MODULE_MANIFEST.map((m) => ({
      namespace: m.namespace,
      outFile: m.outFile,
      skipFunctions: m.skipFunctions ?? undefined,
    }));
    expect(manifest).toEqual(registry);
  });

  test("version index is derived from the registry, not hardcoded", () => {
    const tmp = mkdtempSync(resolve(tmpdir(), "api-targets-"));
    writeFileSync(resolve(tmp, "label_doc.json"), JSON.stringify({ elements: [], info: {} }));
    writeFileSync(resolve(tmp, "sprite_doc.json"), JSON.stringify({ elements: [], info: {} }));
    const registryPath = resolve(tmp, "api-targets.json");
    writeFileSync(
      registryPath,
      JSON.stringify({
        targets: [
          {
            id: "current",
            default: true,
            fixturesDir: ".",
            generatedDir: "generated",
            coreTypesImport: "../src/core-types",
            source: null,
            modules: [{ namespace: "label", fixture: "label_doc.json", outFile: "label.d.ts" }],
          },
          {
            id: "synthetic",
            default: false,
            fixturesDir: ".",
            generatedDir: "generated/versions/synthetic",
            coreTypesImport: "../../../src/core-types",
            source: null,
            modules: [
              { namespace: "label", fixture: "label_doc.json", outFile: "label.d.ts" },
              { namespace: "sprite", fixture: "sprite_doc.json", outFile: "sprite.d.ts" },
            ],
          },
        ],
      }),
    );
    const targets = loadApiTargets(registryPath);
    const versioned = targets
      .filter((t) => t.default !== true)
      .flatMap((t) => loadTargetModules(t, tmp).map((m) => ({ versionId: t.id, ...m })));
    expect(versioned.map((m) => `${m.versionId}/${m.outFile}`)).toEqual([
      "synthetic/label.d.ts",
      "synthetic/sprite.d.ts",
    ]);
    const index = generateVersionIndex("synthetic", versioned);
    expect(index).toBe('import "./label";\nimport "./sprite";\n\nexport {};\n');
  });

  test("missing fixture path fails with a useful error", () => {
    const tmp = mkdtempSync(resolve(tmpdir(), "api-targets-"));
    const registryPath = resolve(tmp, "api-targets.json");
    writeFileSync(
      registryPath,
      JSON.stringify({
        targets: [
          {
            id: "broken",
            default: true,
            fixturesDir: "fixtures",
            generatedDir: "generated",
            coreTypesImport: "../src/core-types",
            source: null,
            modules: [{ namespace: "nope", fixture: "does_not_exist.json", outFile: "nope.d.ts" }],
          },
        ],
      }),
    );
    const target = loadApiTargets(registryPath)[0];
    if (!target) throw new Error("no target");
    expect(() => loadTargetModules(target, tmp)).toThrow(/broken.*nope.*does_not_exist\.json/);
  });

  test("VERSIONED_MODULE_MANIFEST contains every complete committed demoted surface", () => {
    const demoted = loadApiTargets().filter(
      (target) => target.source == null && target.default !== true,
    );
    expect(demoted.length).toBeGreaterThan(0);
    expect(new Set(VERSIONED_MODULE_MANIFEST.map((entry) => entry.versionId))).toEqual(
      new Set(demoted.map((target) => target.id)),
    );
    // A declaring target contributes its editor modules to the same manifest,
    // flagged `editor` so the aggregate version index can leave them out.
    expect(VERSIONED_MODULE_MANIFEST).toHaveLength(
      demoted.reduce(
        (total, target) => total + target.modules.length + (target.editorModules?.length ?? 0),
        0,
      ),
    );
    expect(VERSIONED_MODULE_MANIFEST.filter((entry) => entry.editor === true)).toHaveLength(
      demoted.reduce((total, target) => total + (target.editorModules?.length ?? 0), 0),
    );
  });

  test("resolveTargetModules delegates to loadTargetModules for a null-source target", async () => {
    const target = loadApiTargets().find((t) => t.default === true);
    if (!target) throw new Error("no default target");
    expect(await resolveTargetModules(target)).toEqual(loadTargetModules(target));
  });

  test("resolveTargetModules resolves a ref-doc target from a cached zip, offline", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip();
    const target = loadApiTargets().find((t) => t.id === "defold-1.9.8");
    if (!target) throw new Error("no defold-1.9.8 target");
    const modules = await resolveTargetModules(target, {
      cacheDir,
      readZip: () => fakeZip,
      download: noDownload,
    });
    const label = modules.find((m) => m.namespace === "label");
    if (!label) throw new Error("no label module resolved");
    expect(() => JSON.parse(JSON.stringify(label.doc))).not.toThrow();
    const { contents } = generateModuleDeclaration(label);
    expect(contents).toContain("namespace label");
    expect(contents).toContain("get_text");
  });

  test("ref-doc target with a namespace absent from SYNC_MANIFEST throws", async () => {
    const { fakeZip, cacheDir, version } = labelRefDocZip();
    const tmp = mkdtempSync(resolve(tmpdir(), "api-targets-"));
    const registryPath = resolve(tmp, "api-targets.json");
    writeFileSync(
      registryPath,
      JSON.stringify({
        targets: [
          {
            id: "current",
            default: true,
            fixturesDir: "fixtures",
            generatedDir: "generated",
            coreTypesImport: "../src/core-types",
            source: null,
            modules: [{ namespace: "label", fixture: "label_doc.json", outFile: "label.d.ts" }],
          },
          {
            id: "ref-bogus",
            default: false,
            fixturesDir: "fixtures",
            generatedDir: "generated/versions/ref-bogus",
            coreTypesImport: "../../../src/core-types",
            source: { kind: "ref-doc", version },
            modules: [{ namespace: "nope", fixture: "nope.json", outFile: "nope.d.ts" }],
          },
        ],
      }),
    );
    const target = loadApiTargets(registryPath).find((t) => t.id === "ref-bogus");
    if (!target) throw new Error("no ref-bogus target");
    expect(
      resolveTargetModules(target, { cacheDir, readZip: () => fakeZip, download: noDownload }),
    ).rejects.toThrow(/ref-bogus.*nope/);
  });

  test("committed regen produces no generated/versions/defold-1.9.8 output", () => {
    expect(existsSync(resolve(GENERATED, "versions", "defold-1.9.8"))).toBe(false);
  });

  test("default target's luaStdlib carries the core five plus base, bit, and the sandboxed three", () => {
    const target = loadApiTargets().find((t) => t.default === true);
    if (!target) throw new Error("no default target");
    const namespaces = (target.luaStdlib ?? []).map((m) => m.namespace).sort();
    expect(namespaces).toEqual([
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
  });

  test("every luaStdlib fixture referenced by the default target exists on disk", () => {
    const target = loadApiTargets().find((t) => t.default === true);
    if (!target) throw new Error("no default target");
    for (const mod of target.luaStdlib ?? []) {
      expect(existsSync(resolve(PACKAGE_ROOT, target.fixturesDir, mod.fixture))).toBe(true);
    }
  });
});

describe("registry-declared editor modules", () => {
  // A target's editor document is declared, never inferred from a fixture that
  // happens to be on disk: absence is a registry statement, so a fixture deleted
  // by accident fails loudly instead of degrading to the default surface.
  const syntheticRegistry = (declaredFixture: string | null): string => {
    const tmp = mkdtempSync(resolve(tmpdir(), "editor-targets-"));
    const doc = JSON.stringify({ info: { namespace: "editor" }, elements: [] });
    writeFileSync(resolve(tmp, "label_doc.json"), JSON.stringify({ info: {}, elements: [] }));
    writeFileSync(resolve(tmp, "editor_doc.json"), doc);
    const declaring = {
      id: "declaring",
      default: true,
      fixturesDir: ".",
      generatedDir: "generated",
      coreTypesImport: "../src/core-types",
      source: null,
      modules: [{ namespace: "label", fixture: "label_doc.json", outFile: "label.d.ts" }],
      ...(declaredFixture === null
        ? {}
        : {
            editorModules: [
              { namespace: "editor", fixture: declaredFixture, outFile: "editor.d.ts" },
            ],
          }),
    };
    const silent = {
      id: "silent",
      default: false,
      fixturesDir: ".",
      generatedDir: "generated/versions/silent",
      coreTypesImport: "../../../src/core-types",
      source: null,
      modules: [{ namespace: "label", fixture: "label_doc.json", outFile: "label.d.ts" }],
    };
    const registryPath = resolve(tmp, "api-targets.json");
    writeFileSync(registryPath, JSON.stringify({ targets: [declaring, silent] }));
    return registryPath;
  };

  test("loadApiTargets accepts a declaring target beside one that declares no editor document", () => {
    const targets = loadApiTargets(syntheticRegistry("editor_doc.json"));
    expect(
      targets.find((t) => t.id === "declaring")?.editorModules?.map((m) => m.namespace),
    ).toEqual(["editor"]);
    expect(targets.find((t) => t.id === "silent")?.editorModules).toBeUndefined();
  });

  test("loadApiTargets rejects a declared editor fixture the target's fixturesDir does not hold", () => {
    expect(() => loadApiTargets(syntheticRegistry("editor_gone_doc.json"))).toThrow(
      /declaring.*editor.*editor_gone_doc\.json/,
    );
  });

  test("a committed target declares an editor surface exactly when it ships an editor document", () => {
    for (const target of committedTargets()) {
      const declared = target.editorModules ?? [];
      const hasDocument = existsSync(
        resolve(PACKAGE_ROOT, target.fixturesDir, EDITOR_DOCUMENT_FIXTURE),
      );
      expect({ id: target.id, declares: declared.length > 0 }).toEqual({
        id: target.id,
        declares: hasDocument,
      });
      for (const module of declared) {
        expect(existsSync(resolve(PACKAGE_ROOT, target.fixturesDir, module.fixture))).toBe(true);
      }
    }
  });

  test("every editor VM module a target declares names a namespace its own editor document has", () => {
    for (const target of declaringTargets()) {
      const { dotted, flat } = editorDocumentNamespaces(target);
      const segments = new Set([...dotted, ...flat]);
      for (const module of target.editorModules ?? []) {
        if (module.namespace === EDITOR_NAMESPACE) continue;
        const segment = firstSegment(module.namespace);
        expect({ id: target.id, segment, present: segments.has(segment) }).toEqual({
          id: target.id,
          segment,
          present: true,
        });
      }
    }
  });

  test("a target declares a VM module for every dotted editor namespace and skips only the flat ones", () => {
    for (const target of declaringTargets()) {
      const declared = target.editorModules ?? [];
      const { dotted, flat } = editorDocumentNamespaces(target);
      const vmSegments = declared
        .filter((m) => m.namespace !== EDITOR_NAMESPACE)
        .map((m) => firstSegment(m.namespace));
      const skipped = declared.find((m) => m.namespace === EDITOR_NAMESPACE)?.skipFunctions ?? [];

      // Set equality, not containment: a dropped `json` entry cannot be propped
      // up by its surviving `"json."` rule, and a namespace the release does not
      // ship cannot be declared.
      expect({ id: target.id, vm: [...new Set(vmSegments)].sort().join(" ") }).toEqual({
        id: target.id,
        vm: [...dotted].sort().join(" "),
      });

      // Each split-out namespace must also be withheld from the `editor` emit,
      // or it re-emits as `editor.json.*` alongside its own module.
      const unwithheld = [...dotted].filter((s) => !skipped.includes(`${s}.`)).sort();
      expect({ id: target.id, unwithheld }).toEqual({ id: target.id, unwithheld: [] });

      // A flat namespace is a bare global, hand-authored elsewhere: exact rule,
      // no VM module.
      const flatMishandled = [...flat]
        .filter((s) => !skipped.includes(s) || vmSegments.includes(s))
        .sort();
      expect({ id: target.id, flatMishandled }).toEqual({ id: target.id, flatMishandled: [] });
    }
  });
});
