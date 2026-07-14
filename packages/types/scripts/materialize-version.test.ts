import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  buildVersionedSurfaceFiles,
  materializeVersionedSurface,
  renderMaterializedKindIndex,
} from "./materialize-version";
import {
  type ApiTarget,
  generateModuleDeclaration,
  generateVersionIndex,
  loadApiTargets,
  resolveTargetModules,
} from "./regen";
import { SYNC_MANIFEST, type ZipAccessor } from "./sync-api-docs";

const LUA_STDLIB_LEAD =
  '/// <reference types="lua-types/5.1" />\n/// <reference types="lua-types/special/jit-only" />\n';

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

function labelRefDocZip(opts: { dropSetText?: boolean } = {}): {
  fakeZip: ZipAccessor;
  cacheDir: string;
} {
  const version = "1.9.8";
  const labelEntry = SYNC_MANIFEST.find((e) => e.namespace === "label");
  if (!labelEntry) throw new Error("no label SYNC_MANIFEST entry");
  const doc = JSON.parse(
    readFileSync(resolve(PACKAGE_ROOT, "fixtures", "label_doc.json"), "utf8"),
  ) as { elements: { name: string }[] };
  if (opts.dropSetText) {
    doc.elements = doc.elements.filter((e) => e.name !== "label.set_text");
  }
  const json = JSON.stringify(doc);
  const fakeZip: ZipAccessor = {
    has: (e) => e === labelEntry.zipEntry,
    entries: () => [labelEntry.zipEntry],
    read: (e) => {
      if (e !== labelEntry.zipEntry) throw new Error(`unexpected zip entry ${e}`);
      return json;
    },
  };
  const cacheDir = mkdtempSync(resolve(tmpdir(), "ref-doc-cache-"));
  mkdirSync(resolve(cacheDir, version), { recursive: true });
  writeFileSync(resolve(cacheDir, version, "ref-doc.zip"), "seeded");
  return { fakeZip, cacheDir };
}

const noDownload = async (): Promise<Uint8Array> => {
  throw new Error("download should not be called");
};

function defold198Target() {
  const target = loadApiTargets().find((t) => t.id === "defold-1.9.8");
  if (!target) throw new Error("no defold-1.9.8 target");
  return target;
}

const MULTI_KIND_NAMESPACES = ["gui", "render", "sprite"] as const;

// A fake zip serving a restricted-pair (gui, render) plus a universal module
// (sprite), keyed by each namespace's SYNC_MANIFEST zip entry, so an
// `excludeModules` filter can be observed dropping a single namespace.
function multiKindRefDocZip(): { fakeZip: ZipAccessor; cacheDir: string } {
  const version = "1.9.8";
  const docs: Record<string, string> = {};
  for (const namespace of MULTI_KIND_NAMESPACES) {
    const sync = SYNC_MANIFEST.find((e) => e.namespace === namespace);
    if (!sync) throw new Error(`no SYNC_MANIFEST entry for ${namespace}`);
    docs[sync.zipEntry] = readFileSync(
      resolve(PACKAGE_ROOT, "fixtures", `${namespace}_doc.json`),
      "utf8",
    );
  }
  const fakeZip: ZipAccessor = {
    has: (e) => e in docs,
    entries: () => Object.keys(docs),
    read: (e) => {
      const doc = docs[e];
      if (doc === undefined) throw new Error(`unexpected zip entry ${e}`);
      return doc;
    },
  };
  const cacheDir = mkdtempSync(resolve(tmpdir(), "ref-doc-cache-"));
  mkdirSync(resolve(cacheDir, version), { recursive: true });
  writeFileSync(resolve(cacheDir, version, "ref-doc.zip"), "seeded");
  return { fakeZip, cacheDir };
}

function multiKindTarget(): ApiTarget {
  return {
    id: "defold-1.9.8",
    default: false,
    fixturesDir: "fixtures",
    generatedDir: "generated",
    coreTypesImport: "../src/core-types",
    source: { kind: "ref-doc", version: "1.9.8" },
    modules: MULTI_KIND_NAMESPACES.map((namespace) => ({
      namespace,
      fixture: `${namespace}_doc.json`,
      outFile: `${namespace}.d.ts`,
    })),
  };
}

describe("renderMaterializedKindIndex", () => {
  test("gui-script imports the universal modules plus the restricted gui, never render", () => {
    const out = renderMaterializedKindIndex({
      kind: "gui-script",
      universalModules: ["go", "msg"],
      restrictedModule: "gui",
    });
    expect(out).toContain('import "../engine-globals";');
    expect(out).toContain('import "../go";');
    expect(out).toContain('import "../msg";');
    expect(out).toContain('import "../gui";');
    expect(out).not.toContain('import "../render";');
    expect(out).toContain('export { defineGuiScript } from "@defold-typescript/types/lifecycle";');
    expect(out).toContain(
      'export type { ScriptProperties, ScriptProperty } from "@defold-typescript/types/lifecycle";',
    );
  });

  test("script imports neither restricted namespace", () => {
    const out = renderMaterializedKindIndex({
      kind: "script",
      universalModules: ["go", "msg"],
      restrictedModule: null,
    });
    expect(out).not.toContain('import "../gui";');
    expect(out).not.toContain('import "../render";');
    expect(out).toContain('export { defineScript } from "@defold-typescript/types/lifecycle";');
  });

  test("render-script imports render and excludes gui", () => {
    const out = renderMaterializedKindIndex({
      kind: "render-script",
      universalModules: ["go"],
      restrictedModule: "render",
    });
    expect(out).toContain('import "../render";');
    expect(out).not.toContain('import "../gui";');
    expect(out).toContain(
      'export { defineRenderScript } from "@defold-typescript/types/lifecycle";',
    );
  });

  test("the Lua stdlib triple-slash references lead the output, before the first import", () => {
    const out = renderMaterializedKindIndex({
      kind: "script",
      universalModules: ["go"],
      restrictedModule: null,
    });
    expect(out.startsWith(LUA_STDLIB_LEAD)).toBe(true);
    expect(out.indexOf("///")).toBeLessThan(out.indexOf("import "));
  });

  test("an unknown kind throws", () => {
    expect(() =>
      renderMaterializedKindIndex({
        kind: "no-such-script",
        universalModules: ["go"],
        restrictedModule: null,
      }),
    ).toThrow();
  });
});

describe("materializeVersionedSurface", () => {
  test("writes a self-contained faux @types package from a cached ref-doc, offline", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip();
    const destDir = mkdtempSync(resolve(tmpdir(), "materialized-"));

    await materializeVersionedSurface(defold198Target(), {
      destDir,
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    });

    const label = readFileSync(resolve(destDir, "label.d.ts"), "utf8");
    expect(label).toContain("namespace label");
    expect(label).toContain("get_text");

    expect(readFileSync(resolve(destDir, "index.d.ts"), "utf8")).toBe(
      'import "./label";\n\nexport {};\n',
    );

    const pkg = JSON.parse(readFileSync(resolve(destDir, "package.json"), "utf8")) as {
      name: string;
      types: string;
    };
    expect(pkg.types).toBe("index.d.ts");
    expect(pkg.name).toContain("defold-1.9.8");
  });

  test("the materialized surface tracks the resolved doc, not the current fixture", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip({ dropSetText: true });
    const destDir = mkdtempSync(resolve(tmpdir(), "materialized-"));

    await materializeVersionedSurface(defold198Target(), {
      destDir,
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    });

    const label = readFileSync(resolve(destDir, "label.d.ts"), "utf8");
    expect(label).toContain("get_text");
    expect(label).not.toContain("set_text");
  });

  test("excludeModules drops the listed module's file and its index import", async () => {
    const { fakeZip, cacheDir } = multiKindRefDocZip();
    const destDir = mkdtempSync(resolve(tmpdir(), "materialized-"));

    await materializeVersionedSurface(multiKindTarget(), {
      destDir,
      excludeModules: ["gui"],
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    });

    expect(existsSync(resolve(destDir, "gui.d.ts"))).toBe(false);
    expect(existsSync(resolve(destDir, "render.d.ts"))).toBe(true);
    expect(existsSync(resolve(destDir, "sprite.d.ts"))).toBe(true);

    const index = readFileSync(resolve(destDir, "index.d.ts"), "utf8");
    expect(index).not.toContain('import "./gui";');
    expect(index).toContain('import "./render";');
    expect(index).toContain('import "./sprite";');
  });

  test("omitting excludeModules (or []) writes every module", async () => {
    const { fakeZip, cacheDir } = multiKindRefDocZip();
    const destDir = mkdtempSync(resolve(tmpdir(), "materialized-"));

    await materializeVersionedSurface(multiKindTarget(), {
      destDir,
      excludeModules: [],
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    });

    for (const namespace of MULTI_KIND_NAMESPACES) {
      expect(existsSync(resolve(destDir, `${namespace}.d.ts`))).toBe(true);
    }
    const index = readFileSync(resolve(destDir, "index.d.ts"), "utf8");
    for (const namespace of MULTI_KIND_NAMESPACES) {
      expect(index).toContain(`import "./${namespace}";`);
    }
  });
});

describe("buildVersionedSurfaceFiles", () => {
  test("returns one entry per module plus index.d.ts and package.json, and nothing else", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip();
    const target = defold198Target();
    const resolveOpts = { cacheDir, readZip: () => fakeZip, download: noDownload };

    const files = await buildVersionedSurfaceFiles(target, { resolveOpts });

    const modules = await resolveTargetModules(target, resolveOpts);
    const expectedPaths = [...modules.map((entry) => entry.outFile), "index.d.ts", "package.json"];
    expect(files.map((file) => file.path)).toEqual(expectedPaths);

    for (const entry of modules) {
      const file = files.find((f) => f.path === entry.outFile);
      expect(file?.contents).toBe(generateModuleDeclaration(entry).contents);
    }

    const versioned = modules.map((entry) => ({ ...entry, versionId: target.id }));
    expect(files.find((f) => f.path === "index.d.ts")?.contents).toBe(
      generateVersionIndex(target.id, versioned),
    );
  });

  test("the package.json entry parses to the materialized package name and types entrypoint", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip();
    const target = defold198Target();

    const files = await buildVersionedSurfaceFiles(target, {
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    });

    const pkgEntry = files.find((f) => f.path === "package.json");
    expect(pkgEntry).toBeDefined();
    expect(JSON.parse(pkgEntry?.contents ?? "")).toEqual({
      name: `@defold-typescript/materialized-${target.id}`,
      types: "index.d.ts",
    });
  });

  test("excludeModules omits the module's entry and its index import", async () => {
    const { fakeZip, cacheDir } = multiKindRefDocZip();

    const files = await buildVersionedSurfaceFiles(multiKindTarget(), {
      excludeModules: ["gui"],
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    });

    const paths = files.map((file) => file.path);
    expect(paths).not.toContain("gui.d.ts");
    expect(paths).toContain("render.d.ts");
    expect(paths).toContain("sprite.d.ts");

    const index = files.find((f) => f.path === "index.d.ts")?.contents ?? "";
    expect(index).not.toContain('import "./gui";');
    expect(index).toContain('import "./render";');
    expect(index).toContain('import "./sprite";');
  });

  test("entry order is modules in resolveTargetModules order, then index.d.ts, then package.json", async () => {
    const { fakeZip, cacheDir } = multiKindRefDocZip();
    const target = multiKindTarget();
    const resolveOpts = { cacheDir, readZip: () => fakeZip, download: noDownload };

    const files = await buildVersionedSurfaceFiles(target, { resolveOpts });

    const modules = await resolveTargetModules(target, resolveOpts);
    expect(files.map((file) => file.path)).toEqual([
      ...modules.map((entry) => entry.outFile),
      "index.d.ts",
      "package.json",
    ]);
  });

  test("materializeVersionedSurface writes exactly the files the builder returns", async () => {
    const { fakeZip, cacheDir } = multiKindRefDocZip();
    const target = multiKindTarget();
    const opts = {
      excludeModules: ["gui"],
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    };
    const destDir = mkdtempSync(resolve(tmpdir(), "materialized-"));

    const files = await buildVersionedSurfaceFiles(target, opts);
    await materializeVersionedSurface(target, { destDir, ...opts });

    expect(readdirSync(destDir).sort()).toEqual(files.map((file) => file.path).sort());
    for (const file of files) {
      expect(readFileSync(resolve(destDir, file.path), "utf8")).toBe(file.contents);
    }
  });
});
