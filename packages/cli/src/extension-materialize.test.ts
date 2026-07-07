import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { ExtensionDeclarations } from "./extension-declarations";
import type { EmittedExtension } from "./extension-emit";
import {
  ensureExtensionTypesReference,
  materializeExtensionDeclarations,
} from "./extension-materialize";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(path.join(os.tmpdir(), "defold-typescript-ext-materialize-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

function decl(namespace: string, contents: string): EmittedExtension {
  return { namespace, contents, dropped: [] };
}

function bundle(declarations: EmittedExtension[]): ExtensionDeclarations {
  return {
    url: `https://example.com/${declarations.map((d) => d.namespace).join("-") || "asset"}.zip`,
    provenance: "cache",
    assetOnly: declarations.length === 0,
    resolvedVersion: "sha256:stub",
    declarations,
    luaModules: [],
  };
}

const extensionsDir = (): string => path.join(cwd, ".defold-types", "extensions");

describe("materializeExtensionDeclarations", () => {
  test("writes each namespace verbatim, a sorted barrel, and a faux package.json", () => {
    const bundles = [
      bundle([decl("zeta", "declare namespace zeta {}\n")]),
      bundle([decl("alpha", "declare namespace alpha {}\n")]),
    ];

    const result = materializeExtensionDeclarations({ cwd, bundles });

    expect(result).toEqual({
      materializedDir: ".defold-types/extensions",
      namespaces: ["alpha", "zeta"],
    });

    const dir = extensionsDir();
    expect(readFileSync(path.join(dir, "zeta.d.ts"), "utf8")).toBe("declare namespace zeta {}\n");
    expect(readFileSync(path.join(dir, "alpha.d.ts"), "utf8")).toBe("declare namespace alpha {}\n");
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./alpha";\nimport "./zeta";\n\nexport {};\n',
    );

    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
      name: string;
      types: string;
    };
    expect(pkg.name).toBe("@defold-typescript/materialized-extensions");
    expect(pkg.types).toBe("index.d.ts");
  });

  test("a bundle carrying two declarations writes both, sorted in the barrel", () => {
    const bundles = [
      bundle([
        decl("beta", "declare namespace beta {}\n"),
        decl("acme", "declare namespace acme {}\n"),
      ]),
    ];

    const result = materializeExtensionDeclarations({ cwd, bundles });

    expect(result.namespaces).toEqual(["acme", "beta"]);
    const dir = extensionsDir();
    expect(existsSync(path.join(dir, "beta.d.ts"))).toBe(true);
    expect(existsSync(path.join(dir, "acme.d.ts"))).toBe(true);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./acme";\nimport "./beta";\n\nexport {};\n',
    );
  });

  test("an asset-only bundle contributes nothing and is not an error", () => {
    const bundles = [bundle([]), bundle([decl("real", "declare namespace real {}\n")])];

    const result = materializeExtensionDeclarations({ cwd, bundles });

    expect(result).toEqual({
      materializedDir: ".defold-types/extensions",
      namespaces: ["real"],
    });
    const dir = extensionsDir();
    expect(existsSync(path.join(dir, "real.d.ts"))).toBe(true);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./real";\n\nexport {};\n',
    );
  });

  test("all-asset-only (or empty) bundles write no dir and return nulls", () => {
    expect(materializeExtensionDeclarations({ cwd, bundles: [] })).toEqual({
      materializedDir: null,
      namespaces: [],
    });
    expect(existsSync(extensionsDir())).toBe(false);

    expect(materializeExtensionDeclarations({ cwd, bundles: [bundle([]), bundle([])] })).toEqual({
      materializedDir: null,
      namespaces: [],
    });
    expect(existsSync(extensionsDir())).toBe(false);
  });

  test("prunes a stale .d.ts left from a prior run", () => {
    materializeExtensionDeclarations({
      cwd,
      bundles: [
        bundle([
          decl("keep", "declare namespace keep {}\n"),
          decl("gone", "declare namespace gone {}\n"),
        ]),
      ],
    });

    const result = materializeExtensionDeclarations({
      cwd,
      bundles: [bundle([decl("keep", "declare namespace keep {}\n")])],
    });

    const dir = extensionsDir();
    expect(result.namespaces).toEqual(["keep"]);
    expect(existsSync(path.join(dir, "gone.d.ts"))).toBe(false);
    expect(existsSync(path.join(dir, "keep.d.ts"))).toBe(true);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./keep";\n\nexport {};\n',
    );
  });

  test("a later bundle's namespace wins on duplicate", () => {
    const bundles = [
      bundle([decl("dup", "declare namespace dup { const first = 1; }\n")]),
      bundle([decl("dup", "declare namespace dup { const second = 2; }\n")]),
    ];

    const result = materializeExtensionDeclarations({ cwd, bundles });

    expect(result.namespaces).toEqual(["dup"]);
    expect(readFileSync(path.join(extensionsDir(), "dup.d.ts"), "utf8")).toBe(
      "declare namespace dup { const second = 2; }\n",
    );
  });
});

describe("ensureExtensionTypesReference", () => {
  function writeTsconfig(value: unknown): void {
    writeFileSync(path.join(cwd, "tsconfig.json"), `${JSON.stringify(value, null, 2)}\n`);
  }

  function readTsconfig(): { compilerOptions: { types?: string[]; typeRoots?: string[] } } {
    return JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"));
  }

  test("adds extensions additively, preserving an engine surfaceId entry", () => {
    writeTsconfig({
      compilerOptions: { strict: true, typeRoots: [".defold-types"], types: ["defold-1.12.4"] },
      include: ["src/**/*.ts"],
    });

    ensureExtensionTypesReference(cwd, ".defold-types/extensions");

    const tsconfig = readTsconfig();
    expect(tsconfig.compilerOptions.types).toEqual(["defold-1.12.4", "extensions"]);
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
  });

  test("seeds types/typeRoots when absent", () => {
    writeTsconfig({ compilerOptions: { strict: true } });

    ensureExtensionTypesReference(cwd, ".defold-types/extensions");

    const tsconfig = readTsconfig();
    expect(tsconfig.compilerOptions.types).toEqual(["extensions"]);
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
  });

  test("is idempotent — a second call neither duplicates nor rewrites", () => {
    writeTsconfig({ compilerOptions: { types: ["defold-1.12.4"] } });

    ensureExtensionTypesReference(cwd, ".defold-types/extensions");
    const first = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");
    ensureExtensionTypesReference(cwd, ".defold-types/extensions");
    const second = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    expect(second).toBe(first);
    expect(readTsconfig().compilerOptions.types).toEqual(["defold-1.12.4", "extensions"]);
  });

  test("a null materializedDir is a no-op", () => {
    writeTsconfig({ compilerOptions: { types: ["defold-1.12.4"] } });
    const before = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    ensureExtensionTypesReference(cwd, null);

    expect(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")).toBe(before);
    expect(existsSync(path.join(cwd, ".gitignore"))).toBe(false);
  });

  test("ensures the .defold-types/ gitignore line", () => {
    writeTsconfig({ compilerOptions: {} });
    writeFileSync(path.join(cwd, ".gitignore"), "src/**/*.lua\n");

    ensureExtensionTypesReference(cwd, ".defold-types/extensions");

    const gitignore = readFileSync(path.join(cwd, ".gitignore"), "utf8");
    expect(gitignore).toContain(".defold-types/");
    expect(gitignore).toContain("src/**/*.lua");
  });
});
