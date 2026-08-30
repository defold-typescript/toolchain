import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { completionProxy, type PluginFactory } from "./completion-harness";
import { DEFOLD_COMPLETION_SOURCE } from "./scene-completions";

const PKG_DIR = resolve(import.meta.dir, "..");

function build(cwd: string): void {
  const proc = Bun.spawnSync(["bun", "run", "build"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (proc.exitCode !== 0) {
    throw new Error(`bun run build failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
}

function packedPaths(cwd: string): string[] {
  const proc = Bun.spawnSync(["bun", "pm", "pack", "--dry-run"], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = proc.stdout.toString();
  if (proc.exitCode !== 0) {
    throw new Error(`bun pm pack --dry-run failed in ${cwd}:\n${proc.stderr.toString()}`);
  }
  return stdout
    .split("\n")
    .map((line) => line.match(/^packed\s+\S+\s+(.+)$/)?.[1])
    .filter((path): path is string => path !== undefined);
}

function relativeImportSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const pattern = /^(?:import|export)\b[^\n;]*?\bfrom\s*["'](\.\.?\/[^"']*)["']/gm;
  return [...source.matchAll(pattern)]
    .map((match) => match[1])
    .filter((specifier): specifier is string => specifier !== undefined);
}

describe("@defold-typescript/tstl-plugin publish surface", () => {
  build(PKG_DIR);
  const paths = packedPaths(PKG_DIR);

  test("ships the built dist surface", () => {
    expect(paths).toContain("package.json");
    expect(paths).toContain("dist/index.js");
    expect(paths).toContain("dist/index.d.ts");
  });

  test("excludes tests, snapshots, and dev scripts", () => {
    for (const path of paths) {
      expect(path).not.toMatch(/^scripts\//);
      expect(path).not.toMatch(/\.test\.ts$/);
      expect(path).not.toMatch(/(^|\/)__snapshots__\//);
    }
  });

  test("ships the src target the bun export condition resolves to", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    const bunEntry = (manifest.exports["."].bun as string).replace(/^\.\//, "");
    // A bun consumer of the published package loads this file directly; if it
    // is not packed, `import "@defold-typescript/tstl-plugin"` fails under bun.
    expect(paths).toContain(bunEntry);
  });

  test("manifest points main/types at dist and keeps the bun src condition", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.main).toMatch(/^\.\/dist\//);
    expect(manifest.types).toMatch(/^\.\/dist\//);
    expect(manifest.exports["."].bun).toBe("./src/index.ts");
  });

  test("manifest opts into public publish access", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.publishConfig?.access).toBe("public");
  });

  test("ships a README and LICENSE", () => {
    expect(paths).toContain("README.md");
    expect(paths).toContain("LICENSE");
  });

  test("declares the MIT license", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    expect(manifest.license).toBe("MIT");
  });

  test("built entry has no extensionless relative imports", () => {
    for (const specifier of relativeImportSpecifiers(resolve(PKG_DIR, "dist/index.js"))) {
      expect(specifier).toMatch(/\.js$/);
    }
  });
});

// `bun`'s own `createRequire` honours the `bun` export condition and lands on
// `src/index.ts`, so the resolution tsserver performs can only be observed from
// a real node process. The probe drives `ts.sys.require` — the exact loader
// `Project#enableProxy` is handed — against a consumer-shaped `node_modules`,
// because that path resolves through `main` under Node10 rules and never reads
// the `exports` map.
const NODE_ENTRY_PROBE = `
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createRequire } = require("node:module");

const pkgDir = process.env.PLUGIN_PKG_DIR;
const req = createRequire(pkgDir + "/package.json");
const manifest = req("./package.json");
const ts = require(process.env.PLUGIN_TYPESCRIPT_DIR);

const consumer = fs.mkdtempSync(path.join(os.tmpdir(), "tstl-plugin-consumer-"));
const scope = path.join(consumer, "node_modules", manifest.name.split("/")[0]);
fs.mkdirSync(scope, { recursive: true });
fs.symlinkSync(pkgDir, path.join(consumer, "node_modules", manifest.name), "dir");

const report = {};
const shapeOf = (load) => {
  try {
    const value = load();
    if (typeof value !== "function") return typeof value;
    return typeof value({ typescript: ts }).create === "function" ? "factory" : "function";
  } catch (error) {
    return "threw " + (error.code || error.message);
  }
};

const loaded = ts.sys.require(consumer, manifest.name);
report.resolvedFrom = loaded.modulePath === undefined ? "unresolved" : path.basename(loaded.modulePath);
report.byTsserver = loaded.error ? "threw " + (loaded.error.code || loaded.error.message) : shapeOf(() => loaded.module);
report.byMain = shapeOf(() => req(manifest.main));
import(manifest.name)
  .then((mod) => {
    report.imported = shapeOf(() => mod.default);
  })
  .catch((error) => {
    report.imported = "threw " + (error.code || error.message);
  })
  .finally(() => {
    fs.rmSync(consumer, { recursive: true, force: true });
    process.stdout.write(JSON.stringify(report));
  });
`;

function nodeEntryProbe(): Record<string, string> {
  const proc = Bun.spawnSync(["node", "-e", NODE_ENTRY_PROBE], {
    cwd: PKG_DIR,
    env: {
      ...process.env,
      PLUGIN_PKG_DIR: PKG_DIR,
      PLUGIN_TYPESCRIPT_DIR: resolve(PKG_DIR, "node_modules/typescript"),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = proc.stdout.toString();
  if (proc.exitCode !== 0 || stdout === "") {
    throw new Error(`node entry probe failed:\n${proc.stderr.toString()}${stdout}`);
  }
  return JSON.parse(stdout) as Record<string, string>;
}

const ADDRESS_SOURCE = 'msg.post("#", "hello");\n';
const FRAGMENT_POSITION = ADDRESS_SOURCE.indexOf('"#"') + 2;

describe("@defold-typescript/tstl-plugin require-shaped entry", () => {
  build(PKG_DIR);
  const probe = nodeEntryProbe();

  test("the loader tsserver uses reaches a callable factory", () => {
    expect(probe.resolvedFrom).toBe("index.cjs");
    expect(probe.byTsserver).toBe("factory");
  });

  test("requiring the manifest main directly yields a callable factory", () => {
    expect(probe.byMain).toBe("factory");
  });

  test("importing the package still yields the factory as its default export", () => {
    expect(probe.imported).toBe("factory");
  });

  test("built entries carry no build-machine path into their resolution base", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    for (const entry of [manifest.main as string, manifest.exports["."].import as string]) {
      const source = readFileSync(resolve(PKG_DIR, entry), "utf8");
      // A bundler that folds `import.meta.url` into the builder's own absolute
      // path leaves `createRequire` resolving against a directory no consumer
      // has: the URL parameter table never loads and every completion silently
      // returns the base result.
      expect(source).not.toContain(PKG_DIR);
    }
  });
});

describe("@defold-typescript/tstl-plugin contributed entry through the built plugin", () => {
  build(PKG_DIR);

  test("the entry tsserver loads contributes scene completions", async () => {
    const manifest = await Bun.file(resolve(PKG_DIR, "package.json")).json();
    const requireFromPkg = createRequire(resolve(PKG_DIR, "package.json"));
    const factory = requireFromPkg(manifest.main as string) as PluginFactory;
    const service = completionProxy({
      source: ADDRESS_SOURCE,
      base: undefined,
      init: factory,
    });
    const result = service.getCompletionsAtPosition("main.ts", FRAGMENT_POSITION, undefined);
    const contributed = (result?.entries ?? []).filter(
      (entry) => entry.source === DEFOLD_COMPLETION_SOURCE,
    );
    expect(contributed.map((entry) => entry.name)).toEqual(["board", "hud"]);
  });
});
