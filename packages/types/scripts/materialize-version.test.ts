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
  CORE_TYPES_REEXPORT,
  materializeVersionedSurface,
  renderMaterializedKindIndex,
} from "./materialize-version";
import {
  type ApiTarget,
  generateBuiltinMessagesDeclaration,
  generateModuleDeclaration,
  generateVersionIndex,
  loadApiTargets,
  loadSrcAugmentations,
  MESSAGES_MANIFEST,
  resolveTargetModules,
  SRC_AUGMENTATION_MODULES,
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

// The surface-root files a materialized surface carries beside its modules,
// derived from the production sets rather than restated here.
const SURFACE_ROOT_PATHS = [
  ...SRC_AUGMENTATION_MODULES.map((name) => `${name}.d.ts`),
  "core-types.d.ts",
  MESSAGES_MANIFEST.outFile,
];

// The bare names the aggregate index imports after the modules, in emit order.
const SURFACE_EXTRA_IMPORTS = [
  MESSAGES_MANIFEST.outFile.replace(/\.d\.ts$/, ""),
  ...SRC_AUGMENTATION_MODULES,
];

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
      `${['import "./label";', ...SURFACE_EXTRA_IMPORTS.map((n) => `import "./${n}";`)].join(
        "\n",
      )}\n\nexport {};\n`,
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
  test("returns one entry per module and augmentation plus index.d.ts and package.json, and nothing else", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip();
    const target = defold198Target();
    const resolveOpts = { cacheDir, readZip: () => fakeZip, download: noDownload };

    const files = await buildVersionedSurfaceFiles(target, { resolveOpts });

    const modules = await resolveTargetModules(target, resolveOpts);
    const expectedPaths = [
      ...modules.map((entry) => entry.outFile),
      ...SURFACE_ROOT_PATHS,
      "index.d.ts",
      "package.json",
    ];
    expect(files.map((file) => file.path)).toEqual(expectedPaths);

    for (const entry of modules) {
      const file = files.find((f) => f.path === entry.outFile);
      expect(file?.contents).toBe(
        generateModuleDeclaration({ ...entry, importsFrom: "./core-types" }).contents,
      );
    }

    const versioned = modules.map((entry) => ({ ...entry, versionId: target.id }));
    expect(files.find((f) => f.path === "index.d.ts")?.contents).toBe(
      generateVersionIndex(target.id, versioned, SURFACE_EXTRA_IMPORTS),
    );
  });

  test("generateModuleDeclaration wraps a declare module when moduleId is set, declare global otherwise", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip();
    const target = defold198Target();
    const resolveOpts = { cacheDir, readZip: () => fakeZip, download: noDownload };
    const entry = (await resolveTargetModules(target, resolveOpts))[0];
    expect(entry).toBeDefined();
    if (!entry) return;

    const ambient = generateModuleDeclaration(entry).contents;
    expect(ambient).toContain("declare global {");
    expect(ambient).not.toContain("declare module");

    const moduleForm = generateModuleDeclaration({ ...entry, moduleId: "sample.mod" }).contents;
    expect(moduleForm).toContain("declare module 'sample.mod' {");
    expect(moduleForm).not.toContain("declare global");
    expect(moduleForm.split("\n")[0]).toBe("/** @noSelfInFile */");
    expect(moduleForm.split("\n")[1]).toBe("/** @noResolution */");
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

  test("entry order is modules in resolveTargetModules order, then augmentations, then index.d.ts, then package.json", async () => {
    const { fakeZip, cacheDir } = multiKindRefDocZip();
    const target = multiKindTarget();
    const resolveOpts = { cacheDir, readZip: () => fakeZip, download: noDownload };

    const files = await buildVersionedSurfaceFiles(target, { resolveOpts });

    const modules = await resolveTargetModules(target, resolveOpts);
    expect(files.map((file) => file.path)).toEqual([
      ...modules.map((entry) => entry.outFile),
      ...SURFACE_ROOT_PATHS,
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

function committedTarget(id: string): ApiTarget {
  const target = loadApiTargets().find((t) => t.id === id);
  if (!target) throw new Error(`no ${id} target`);
  return target;
}

describe("buildVersionedSurfaceFiles src augmentation carry", () => {
  test("SRC_AUGMENTATION_MODULES is the kind manifest's src set, not a second list", () => {
    const scriptKind = readFileSync(
      resolve(PACKAGE_ROOT, "generated", "kinds", "script.d.ts"),
      "utf8",
    );
    const fromKindIndex = [...scriptKind.matchAll(/^import "\.\.\/\.\.\/src\/([^"]+)";$/gm)]
      .map((match) => match[1] ?? "")
      .sort();
    expect(fromKindIndex.length).toBeGreaterThan(0);
    expect([...SRC_AUGMENTATION_MODULES].sort()).toEqual(fromKindIndex);
  });

  test("carries every src augmentation the kind manifest names", async () => {
    const files = await buildVersionedSurfaceFiles(committedTarget("defold-1.12.4"));

    for (const name of SRC_AUGMENTATION_MODULES) {
      const file = files.find((f) => f.path === `${name}.d.ts`);
      expect(`${name}: ${file === undefined ? "absent" : "present"}`).toBe(`${name}: present`);
      expect(file?.contents).toBe(
        readFileSync(resolve(PACKAGE_ROOT, "src", `${name}.d.ts`), "utf8"),
      );
    }
    expect(files.find((f) => f.path === "core-types.d.ts")?.contents).toBe(CORE_TYPES_REEXPORT);
  });

  test("the aggregate index imports each augmentation", async () => {
    const target = committedTarget("defold-1.12.4");
    const files = await buildVersionedSurfaceFiles(target);
    const index = files.find((f) => f.path === "index.d.ts")?.contents ?? "";

    for (const name of SRC_AUGMENTATION_MODULES) {
      expect(index).toContain(`import "./${name}";`);
    }
    for (const module of target.modules) {
      expect(index).toContain(`import "./${module.outFile.replace(/\.d\.ts$/, "")}";`);
    }
    // `core-types` is type-only and carries no side effect, exactly as on the
    // packaged path.
    expect(index).not.toContain('import "./core-types";');
  });

  test("an added augmentation reaches the surface with no second edit", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip();
    const extra = { path: "synthetic-augmentation.d.ts", contents: "export {};\n" };

    const files = await buildVersionedSurfaceFiles(defold198Target(), {
      augmentations: [...loadSrcAugmentations(), extra],
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    });

    expect(files.find((f) => f.path === extra.path)?.contents).toBe(extra.contents);
    expect(files.find((f) => f.path === "index.d.ts")?.contents).toContain(
      'import "./synthetic-augmentation";',
    );
  });

  test("excludeModules drops an augmentation by bare name", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip();

    const files = await buildVersionedSurfaceFiles(defold198Target(), {
      excludeModules: ["vmath-overloads"],
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    });

    expect(files.map((f) => f.path)).not.toContain("vmath-overloads.d.ts");
    expect(files.map((f) => f.path)).toContain("go-overloads.d.ts");
    const index = files.find((f) => f.path === "index.d.ts")?.contents ?? "";
    expect(index).not.toContain('import "./vmath-overloads";');
    expect(index).toContain('import "./go-overloads";');
  });

  test("a ref-doc-sourced target carries them too", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip();

    const files = await buildVersionedSurfaceFiles(defold198Target(), {
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    });

    const paths = files.map((f) => f.path);
    for (const name of SRC_AUGMENTATION_MODULES) {
      expect(paths).toContain(`${name}.d.ts`);
    }
    expect(paths).toContain("core-types.d.ts");
  });

  test("carries the generated builtin-messages module", async () => {
    const files = await buildVersionedSurfaceFiles(committedTarget("defold-1.12.4"));

    const file = files.find((f) => f.path === "builtin-messages.d.ts");
    expect(file === undefined ? "absent" : "present").toBe("present");
    expect(file?.contents).toBe(
      generateBuiltinMessagesDeclaration(MESSAGES_MANIFEST, { importsFrom: "./core-types" }),
    );
  });

  test("the aggregate index imports the generated builtin-messages module", async () => {
    const files = await buildVersionedSurfaceFiles(committedTarget("defold-1.12.4"));
    const index = files.find((f) => f.path === "index.d.ts")?.contents ?? "";

    expect(index).toContain('import "./builtin-messages";');
  });

  test("excludeModules drops builtin-messages by bare name", async () => {
    const { fakeZip, cacheDir } = labelRefDocZip();

    const files = await buildVersionedSurfaceFiles(defold198Target(), {
      excludeModules: ["builtin-messages"],
      resolveOpts: { cacheDir, readZip: () => fakeZip, download: noDownload },
    });

    expect(files.map((f) => f.path)).not.toContain("builtin-messages.d.ts");
    const index = files.find((f) => f.path === "index.d.ts")?.contents ?? "";
    expect(index).not.toContain('import "./builtin-messages";');
  });

  test("no emitted declaration names a path outside the surface", async () => {
    // `defold-1.13.0` spells its brand import as the in-repo
    // `../../../src/core-types` and declares editor VM modules one directory
    // down, so both the retarget and its depth rule are exercised.
    const files = await buildVersionedSurfaceFiles(committedTarget("defold-1.13.0"));

    let checked = 0;
    let nested = 0;
    for (const file of files) {
      if (!file.path.endsWith(".d.ts")) continue;
      expect(`${file.path} must not escape the surface: ${file.contents}`).not.toContain("../../");
      if (file.path === "core-types.d.ts") continue;
      const depth = file.path.split("/").length - 1;
      const expected = depth === 0 ? "./core-types" : "../core-types";
      for (const match of file.contents.matchAll(/from "([^"]+)"/g)) {
        const specifier = match[1] ?? "";
        if (!specifier.endsWith("core-types")) continue;
        expect(`${file.path} -> ${specifier}`).toBe(`${file.path} -> ${expected}`);
        checked++;
        if (depth > 0) nested++;
      }
    }
    expect(checked).toBeGreaterThan(0);
    expect(nested).toBeGreaterThan(0);
  });
});
