import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  generateModuleDeclaration,
  generateVersionIndex,
  loadApiTargets,
  loadTargetModules,
  MODULE_MANIFEST,
  resolveTargetModules,
  VERSIONED_MODULE_MANIFEST,
} from "../scripts/regen";
import { SYNC_MANIFEST, type ZipAccessor } from "../scripts/sync-api-docs";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const GENERATED = resolve(PACKAGE_ROOT, "generated");

function labelRefDocZip(): { fakeZip: ZipAccessor; cacheDir: string; version: string } {
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

  test("VERSIONED_MODULE_MANIFEST is empty — every versioned surface is ref-doc-sourced", () => {
    expect(VERSIONED_MODULE_MANIFEST).toEqual([]);
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
});
