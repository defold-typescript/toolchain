import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { synthesizeProseConstants } from "./prose-constants";
import {
  type ApiTarget,
  loadApiTargets,
  loadTargetModules,
  type ModuleManifestEntry,
  resolveTargetModules,
} from "./regen";
import { SYNC_MANIFEST, type ZipAccessor } from "./sync-api-docs";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const SEMANTIC_PREFIX = "graphics.SEMANTIC_TYPE_";
const MORPH = "graphics.SEMANTIC_TYPE_MORPH_TARGET_WEIGHTS";

interface DocElement {
  readonly type: string;
  readonly name: string;
}

function committedTargets(): readonly ApiTarget[] {
  return loadApiTargets().filter((target) => (target.source ?? null) === null);
}

function targetById(id: string): ApiTarget {
  const target = loadApiTargets().find((t) => t.id === id);
  if (!target) throw new Error(`no ${id} target`);
  return target;
}

function elementsOf(modules: readonly ModuleManifestEntry[], namespace: string): DocElement[] {
  const entry = modules.find((m) => m.namespace === namespace);
  if (!entry) throw new Error(`no ${namespace} module`);
  return (entry.doc as { elements: DocElement[] }).elements;
}

function semanticConstants(modules: readonly ModuleManifestEntry[]): string[] {
  return elementsOf(modules, "graphics")
    .filter((e) => e.type === "CONSTANT" && e.name.startsWith(SEMANTIC_PREFIX))
    .map((e) => e.name)
    .sort();
}

// The oracle is the raw evidence file, not a parse of its `<li>` structure.
function evidencedNames(target: ApiTarget): string[] {
  const path = resolve(PACKAGE_ROOT, target.fixturesDir, "material_doc.json");
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, "utf8");
  return [...new Set(raw.match(/graphics\.SEMANTIC_TYPE_\w+/g) ?? [])].sort();
}

// Oldest first, so each target's set can be compared with the next newer one.
function byVersion(targets: readonly ApiTarget[]): ApiTarget[] {
  const parts = (id: string) =>
    id
      .replace(/^defold-/, "")
      .split(".")
      .map(Number);
  return [...targets].sort((a, b) => {
    const pa = parts(a.id);
    const pb = parts(b.id);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const d = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (d !== 0) return d;
    }
    return 0;
  });
}

describe("synthesizeProseConstants", () => {
  test("each committed target's graphics module declares exactly the semantic types its material doc evidences", () => {
    for (const target of committedTargets()) {
      expect({ target: target.id, names: semanticConstants(loadTargetModules(target)) }).toEqual({
        target: target.id,
        names: evidencedNames(target),
      });
    }
  });

  test("1.12.4 declares none, 1.13.0 twelve without morph target weights, 1.13.1 all thirteen", () => {
    expect(semanticConstants(loadTargetModules(targetById("defold-1.12.4")))).toEqual([]);
    const v1130 = semanticConstants(loadTargetModules(targetById("defold-1.13.0")));
    expect(v1130).toHaveLength(12);
    expect(v1130).not.toContain(MORPH);
    const v1131 = semanticConstants(loadTargetModules(targetById("defold-1.13.1")));
    expect(v1131).toHaveLength(13);
    expect(v1131).toContain(MORPH);
  });

  test("an older target's set is a subset of the next newer one's", () => {
    const ordered = byVersion(committedTargets());
    for (let i = 0; i + 1 < ordered.length; i++) {
      const older = semanticConstants(loadTargetModules(ordered[i] as ApiTarget));
      const newer = new Set(semanticConstants(loadTargetModules(ordered[i + 1] as ApiTarget)));
      expect(older.filter((name) => !newer.has(name))).toEqual([]);
    }
  });

  test("a name the graphics doc already declares stays a single element", () => {
    const fixturesDir = resolve(PACKAGE_ROOT, targetById("defold-1.13.1").fixturesDir);
    const rawDoc = (namespace: string) =>
      JSON.parse(readFileSync(resolve(fixturesDir, `${namespace}_doc.json`), "utf8")) as {
        elements: DocElement[];
      };
    const upstream = rawDoc("graphics");
    const withUpstreamFix: ModuleManifestEntry[] = [
      {
        namespace: "graphics",
        outFile: "graphics.d.ts",
        doc: {
          ...upstream,
          elements: [
            ...upstream.elements,
            { type: "CONSTANT", name: "graphics.SEMANTIC_TYPE_COLOR" },
          ],
        },
      },
      { namespace: "material", outFile: "material.d.ts", doc: rawDoc("material") },
    ];
    const out = synthesizeProseConstants(withUpstreamFix);
    const colors = elementsOf(out, "graphics").filter(
      (e) => e.name === "graphics.SEMANTIC_TYPE_COLOR",
    );
    expect(colors).toHaveLength(1);
    expect(semanticConstants(out)).toHaveLength(13);
  });

  test("synthesis is idempotent and leaves the input doc untouched", () => {
    const target = targetById("defold-1.13.1");
    const once = loadTargetModules(target);
    const before = JSON.stringify(elementsOf(once, "graphics"));
    const twice = synthesizeProseConstants(once);
    expect(JSON.stringify(elementsOf(once, "graphics"))).toBe(before);
    expect(semanticConstants(twice)).toEqual(semanticConstants(once));
  });

  test("a module list with no material entry is returned unchanged", () => {
    const modules = loadTargetModules(targetById("defold-1.12.4"));
    expect(synthesizeProseConstants(modules)).toEqual(modules);
  });

  test("resolveTargetModules synthesizes them for a ref-doc target too", async () => {
    const version = "1.9.8";
    const fixturesDir = "fixtures/defold-1.13.1";
    const entries = new Map<string, string>();
    for (const namespace of ["graphics", "material"]) {
      const sync = SYNC_MANIFEST.find((e) => e.namespace === namespace);
      if (!sync) throw new Error(`no ${namespace} SYNC_MANIFEST entry`);
      entries.set(
        sync.zipEntry,
        readFileSync(resolve(PACKAGE_ROOT, fixturesDir, `${namespace}_doc.json`), "utf8"),
      );
    }
    const fakeZip: ZipAccessor = {
      has: (e) => entries.has(e),
      entries: () => [...entries.keys()],
      read: (e) => {
        const body = entries.get(e);
        if (body === undefined) throw new Error(`unexpected zip entry ${e}`);
        return body;
      },
    };
    const cacheDir = mkdtempSync(resolve(tmpdir(), "ref-doc-cache-"));
    mkdirSync(resolve(cacheDir, version), { recursive: true });
    writeFileSync(resolve(cacheDir, version, "ref-doc.zip"), "seeded");
    const target: ApiTarget = {
      id: `defold-${version}`,
      fixturesDir: `fixtures/defold-${version}`,
      generatedDir: `generated/versions/defold-${version}`,
      coreTypesImport: "./types",
      source: { kind: "ref-doc", version },
      modules: [
        { namespace: "graphics", fixture: "graphics_doc.json", outFile: "graphics.d.ts" },
        { namespace: "material", fixture: "material_doc.json", outFile: "material.d.ts" },
      ],
    };
    const modules = await resolveTargetModules(target, {
      cacheDir,
      readZip: () => fakeZip,
      download: async () => {
        throw new Error("download should not be called");
      },
    });
    const names = semanticConstants(modules);
    expect(names).toHaveLength(13);
    expect(names).toContain(MORPH);
  });
});
