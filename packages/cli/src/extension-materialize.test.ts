import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as ts from "typescript";
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
    manifestDirs: [],
    sceneSources: [],
    sceneReasons: [],
    sceneRefused: [],
    shipped: [],
  };
}

const extensionsDir = (): string => path.join(cwd, ".defold-types", "extensions");

function bundleAt(url: string, declarations: EmittedExtension[]): ExtensionDeclarations {
  return { ...bundle(declarations), url };
}

function barrelDiagnostics(usage: string): string[] {
  writeFileSync(path.join(cwd, "usage.ts"), usage);
  const options: ts.CompilerOptions = {
    noLib: true,
    strict: true,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const program = ts.createProgram(
    [path.join(extensionsDir(), "index.d.ts"), path.join(cwd, "usage.ts")],
    options,
    ts.createCompilerHost(options),
  );
  return [...program.getSemanticDiagnostics(), ...program.getSyntacticDiagnostics()].map((d) =>
    ts.flattenDiagnosticMessageText(d.messageText, "\n"),
  );
}

function declares(namespace: string, name: string): string {
  return `declare global { namespace ${namespace} { function ${name}(): void; } }\nexport {};\n`;
}

function declarationFiles(): string[] {
  return readdirSync(extensionsDir())
    .filter((file) => file.endsWith(".d.ts"))
    .sort();
}

describe("materializeExtensionDeclarations", () => {
  // The emitter spells the brand import relative to `packages/types/generated/`,
  // where the committed built-ins live. From `.defold-types/extensions/` that
  // specifier names nothing, and under the scaffold's `skipLibCheck` the brand
  // silently becomes `any` instead of erroring — so the surface has to name the
  // published subpath instead.
  test("retargets a declaration's core-type import to the published subpath", () => {
    const contents = [
      'import type { Opaque } from "../src/core-types";',
      "declare global {",
      "  namespace ext {",
      '    function get(): Opaque<"node">;',
      "  }",
      "}",
      "",
    ].join("\n");

    materializeExtensionDeclarations({ cwd, bundles: [bundle([decl("ext", contents)])] });

    const written = readFileSync(path.join(extensionsDir(), "ext.d.ts"), "utf8");
    expect(written).toContain('from "@defold-typescript/types/core-types"');
    expect(written).not.toContain("/src/core-types");
    expect(written).toBe(
      contents.replace('"../src/core-types"', '"@defold-typescript/types/core-types"'),
    );
  });

  test("writes everything but the core-type specifier byte-for-byte", () => {
    const header = [
      "/** @noSelfInFile */",
      'import type { Opaque } from "../src/core-types";',
      "",
      "declare global {",
      "  namespace ext {",
      "    /** Doc comment with a ../src/core-types mention in prose. */",
      '    function get(): Opaque<"node">;',
      "  }",
      "}",
      "",
    ].join("\n");
    const plain = "declare global {\n  namespace bare {\n    function go(): void;\n  }\n}\n";

    materializeExtensionDeclarations({
      cwd,
      bundles: [bundle([decl("ext", header), decl("bare", plain)])],
    });

    const dir = extensionsDir();
    expect(readFileSync(path.join(dir, "ext.d.ts"), "utf8")).toBe(
      header.replace('from "../src/core-types"', 'from "@defold-typescript/types/core-types"'),
    );
    expect(readFileSync(path.join(dir, "bare.d.ts"), "utf8")).toBe(plain);
    expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
      'import "./bare";\nimport "./ext";\n\nexport {};\n',
    );
  });

  test("writes each namespace verbatim, a sorted barrel, and a faux package.json", () => {
    const bundles = [
      bundle([decl("zeta", "declare namespace zeta {}\n")]),
      bundle([decl("alpha", "declare namespace alpha {}\n")]),
    ];

    const result = materializeExtensionDeclarations({ cwd, bundles });

    expect(result).toEqual({
      materializedDir: ".defold-types/extensions",
      namespaces: ["alpha", "zeta"],
      sharedNamespaces: [],
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
      sharedNamespaces: [],
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
      sharedNamespaces: [],
    });
    expect(existsSync(extensionsDir())).toBe(false);

    expect(materializeExtensionDeclarations({ cwd, bundles: [bundle([]), bundle([])] })).toEqual({
      materializedDir: null,
      namespaces: [],
      sharedNamespaces: [],
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

  test("an empty result prunes a previously-materialized dir instead of leaving it stale", () => {
    materializeExtensionDeclarations({
      cwd,
      bundles: [bundle([decl("gone", "declare namespace gone {}\n")])],
    });
    expect(existsSync(path.join(extensionsDir(), "gone.d.ts"))).toBe(true);

    const result = materializeExtensionDeclarations({ cwd, bundles: [bundle([])] });

    expect(result).toEqual({ materializedDir: null, namespaces: [], sharedNamespaces: [] });
    expect(existsSync(extensionsDir())).toBe(false);
  });

  test("two dependencies with one repo name keep both shipped sets", () => {
    const first = "export declare const first: number;\n";
    const second = "export declare const second: string;\n";
    const shippedBundle = (url: string, contents: string): ExtensionDeclarations => ({
      ...bundleAt(url, []),
      shipped: [{ entry: "lib-main/types/index.d.ts", contents }],
    });

    materializeExtensionDeclarations({
      cwd,
      bundles: [
        shippedBundle("https://github.com/a/lib/archive/main.zip", first),
        shippedBundle("https://github.com/b/lib/archive/main.zip", second),
      ],
    });

    expect(readFileSync(path.join(extensionsDir(), "shipped", "lib", "index.d.ts"), "utf8")).toBe(
      first,
    );
    expect(readFileSync(path.join(extensionsDir(), "shipped", "lib-2", "index.d.ts"), "utf8")).toBe(
      second,
    );
    const barrel = readFileSync(path.join(extensionsDir(), "index.d.ts"), "utf8");
    expect(barrel).toContain('import "./shipped/lib/index";');
    expect(barrel).toContain('import "./shipped/lib-2/index";');
  });

  describe("a namespace several declarations share", () => {
    const coreUrl = "https://github.com/defold/extension-firebase/archive/1.zip";
    const analyticsUrl = "https://github.com/defold/extension-firebase-analytics/archive/2.zip";
    const core =
      "declare global {\n  namespace firebase {\n    function initialize(): void;\n  }\n}\nexport {};\n";
    const analytics =
      "declare global {\n  namespace firebase {\n    namespace analytics {\n      function log(name: string): void;\n    }\n  }\n}\nexport {};\n";

    test("each dependency writes its own file and the barrel merges them", () => {
      const result = materializeExtensionDeclarations({
        cwd,
        bundles: [
          bundleAt(coreUrl, [decl("firebase", core)]),
          bundleAt(analyticsUrl, [decl("firebase", analytics)]),
        ],
      });

      const dir = extensionsDir();
      expect(result).toEqual({
        materializedDir: ".defold-types/extensions",
        namespaces: ["firebase"],
        sharedNamespaces: [{ namespace: "firebase", urls: [coreUrl, analyticsUrl] }],
      });
      expect(readFileSync(path.join(dir, "firebase.extension-firebase.d.ts"), "utf8")).toBe(core);
      expect(
        readFileSync(path.join(dir, "firebase.extension-firebase-analytics.d.ts"), "utf8"),
      ).toBe(analytics);
      expect(existsSync(path.join(dir, "firebase.d.ts"))).toBe(false);
      expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
        'import "./firebase.extension-firebase";\nimport "./firebase.extension-firebase-analytics";\n\nexport {};\n',
      );
      expect(barrelDiagnostics('firebase.initialize();\nfirebase.analytics.log("x");\n')).toEqual(
        [],
      );
    });

    test("one dependency declaring a namespace twice numbers its second file", () => {
      const result = materializeExtensionDeclarations({
        cwd,
        bundles: [bundleAt(coreUrl, [decl("firebase", core), decl("firebase", analytics)])],
      });

      const dir = extensionsDir();
      expect(result.sharedNamespaces).toEqual([{ namespace: "firebase", urls: [coreUrl] }]);
      expect(readFileSync(path.join(dir, "firebase.extension-firebase.d.ts"), "utf8")).toBe(core);
      expect(readFileSync(path.join(dir, "firebase.extension-firebase-2.d.ts"), "utf8")).toBe(
        analytics,
      );
      expect(existsSync(path.join(dir, "firebase.d.ts"))).toBe(false);
    });

    test("a namespace that loses its second dependency goes back to one file", () => {
      materializeExtensionDeclarations({
        cwd,
        bundles: [
          bundleAt(coreUrl, [decl("firebase", core)]),
          bundleAt(analyticsUrl, [decl("firebase", analytics)]),
        ],
      });

      const result = materializeExtensionDeclarations({
        cwd,
        bundles: [bundleAt(coreUrl, [decl("firebase", core)])],
      });

      const dir = extensionsDir();
      expect(result.sharedNamespaces).toEqual([]);
      expect(readFileSync(path.join(dir, "firebase.d.ts"), "utf8")).toBe(core);
      expect(existsSync(path.join(dir, "firebase.extension-firebase.d.ts"))).toBe(false);
      expect(existsSync(path.join(dir, "firebase.extension-firebase-analytics.d.ts"))).toBe(false);
      expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
        'import "./firebase";\n\nexport {};\n',
      );
    });

    test("a shared file never takes an unshared namespace's name", () => {
      const barUrl = "https://github.com/acme/bar/archive/1.zip";
      const bazUrl = "https://github.com/acme/baz/archive/1.zip";
      const quxUrl = "https://github.com/acme/qux/archive/1.zip";
      const fromBar = declares("foo", "fromBar");
      const fromBaz = declares("foo", "fromBaz");
      const nested = declares("foo.bar", "nested");

      const result = materializeExtensionDeclarations({
        cwd,
        bundles: [
          bundleAt(barUrl, [decl("foo", fromBar)]),
          bundleAt(bazUrl, [decl("foo", fromBaz)]),
          bundleAt(quxUrl, [decl("foo.bar", nested)]),
        ],
      });

      const dir = extensionsDir();
      expect(result.namespaces).toEqual(["foo", "foo.bar"]);
      expect(result.sharedNamespaces).toEqual([{ namespace: "foo", urls: [barUrl, bazUrl] }]);
      expect(readFileSync(path.join(dir, "foo.bar.d.ts"), "utf8")).toBe(nested);
      expect(readFileSync(path.join(dir, "foo.bar-2.d.ts"), "utf8")).toBe(fromBar);
      expect(readFileSync(path.join(dir, "foo.baz.d.ts"), "utf8")).toBe(fromBaz);
      expect(declarationFiles()).toEqual([
        "foo.bar-2.d.ts",
        "foo.bar.d.ts",
        "foo.baz.d.ts",
        "index.d.ts",
      ]);
      expect(barrelDiagnostics("foo.fromBar();\nfoo.fromBaz();\nfoo.bar.nested();\n")).toEqual([]);
    });

    test("a shared file never takes another shared namespace's name", () => {
      const fromBarBaz = declares("foo", "fromBarBaz");
      const fromOne = declares("foo", "fromOne");
      const fromBaz = declares("foo.bar", "fromBaz");
      const fromTwo = declares("foo.bar", "fromTwo");

      materializeExtensionDeclarations({
        cwd,
        bundles: [
          bundleAt("https://github.com/acme/bar.baz/archive/1.zip", [decl("foo", fromBarBaz)]),
          bundleAt("https://github.com/acme/one/archive/1.zip", [decl("foo", fromOne)]),
          bundleAt("https://github.com/acme/baz/archive/1.zip", [decl("foo.bar", fromBaz)]),
          bundleAt("https://github.com/acme/two/archive/1.zip", [decl("foo.bar", fromTwo)]),
        ],
      });

      const dir = extensionsDir();
      expect(readFileSync(path.join(dir, "foo.bar.baz.d.ts"), "utf8")).toBe(fromBarBaz);
      expect(readFileSync(path.join(dir, "foo.bar.baz-2.d.ts"), "utf8")).toBe(fromBaz);
      expect(
        barrelDiagnostics(
          "foo.fromBarBaz();\nfoo.fromOne();\nfoo.bar.fromBaz();\nfoo.bar.fromTwo();\n",
        ),
      ).toEqual([]);
    });
  });

  describe("file names that differ only in letter case", () => {
    const acme = (repo: string): string => `https://github.com/acme/${repo}/archive/1.zip`;

    test("an unshared namespace keeps its file beside a case twin", () => {
      const upper = declares("Foo", "upper");
      const lower = declares("foo", "lower");

      const result = materializeExtensionDeclarations({
        cwd,
        bundles: [
          bundleAt(acme("one"), [decl("Foo", upper)]),
          bundleAt(acme("two"), [decl("foo", lower)]),
        ],
      });

      const dir = extensionsDir();
      expect(result.namespaces).toEqual(["Foo", "foo"]);
      expect(result.sharedNamespaces).toEqual([]);
      expect(declarationFiles()).toEqual(["Foo.d.ts", "foo-2.d.ts", "index.d.ts"]);
      expect(readFileSync(path.join(dir, "Foo.d.ts"), "utf8")).toBe(upper);
      expect(readFileSync(path.join(dir, "foo-2.d.ts"), "utf8")).toBe(lower);
      expect(barrelDiagnostics("Foo.upper();\nfoo.lower();\n")).toEqual([]);
    });

    test("a shared file never takes an unshared namespace's name in another case", () => {
      const fromBar = declares("foo", "fromBar");
      const fromBaz = declares("foo", "fromBaz");
      const nested = declares("Foo.bar", "nested");

      const result = materializeExtensionDeclarations({
        cwd,
        bundles: [
          bundleAt(acme("bar"), [decl("foo", fromBar)]),
          bundleAt(acme("baz"), [decl("foo", fromBaz)]),
          bundleAt(acme("qux"), [decl("Foo.bar", nested)]),
        ],
      });

      const dir = extensionsDir();
      expect(result.namespaces).toEqual(["Foo.bar", "foo"]);
      expect(result.sharedNamespaces).toEqual([
        { namespace: "foo", urls: [acme("bar"), acme("baz")] },
      ]);
      expect(declarationFiles()).toEqual([
        "Foo.bar.d.ts",
        "foo.bar-2.d.ts",
        "foo.baz.d.ts",
        "index.d.ts",
      ]);
      expect(readFileSync(path.join(dir, "Foo.bar.d.ts"), "utf8")).toBe(nested);
      expect(readFileSync(path.join(dir, "foo.bar-2.d.ts"), "utf8")).toBe(fromBar);
      expect(readFileSync(path.join(dir, "foo.baz.d.ts"), "utf8")).toBe(fromBaz);
      expect(readFileSync(path.join(dir, "index.d.ts"), "utf8")).toBe(
        'import "./Foo.bar";\nimport "./foo.bar-2";\nimport "./foo.baz";\n\nexport {};\n',
      );
      expect(barrelDiagnostics("foo.fromBar();\nfoo.fromBaz();\nFoo.bar.nested();\n")).toEqual([]);
    });

    test("a shared file never takes another shared namespace's name in another case", () => {
      const upperBar = declares("Foo", "upperBar");
      const lowerBar = declares("foo", "lowerBar");
      const upperOne = declares("Foo", "upperOne");
      const lowerTwo = declares("foo", "lowerTwo");

      materializeExtensionDeclarations({
        cwd,
        bundles: [
          bundleAt(acme("bar"), [decl("Foo", upperBar), decl("foo", lowerBar)]),
          bundleAt(acme("one"), [decl("Foo", upperOne)]),
          bundleAt(acme("two"), [decl("foo", lowerTwo)]),
        ],
      });

      expect(declarationFiles()).toEqual([
        "Foo.bar.d.ts",
        "Foo.one.d.ts",
        "foo.bar-2.d.ts",
        "foo.two.d.ts",
        "index.d.ts",
      ]);
      expect(
        barrelDiagnostics("Foo.upperBar();\nFoo.upperOne();\nfoo.lowerBar();\nfoo.lowerTwo();\n"),
      ).toEqual([]);
    });
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

  test("a null materializedDir leaves a tsconfig carrying no extensions entry untouched", () => {
    writeTsconfig({ compilerOptions: { types: ["defold-1.12.4"] } });
    const before = readFileSync(path.join(cwd, "tsconfig.json"), "utf8");

    ensureExtensionTypesReference(cwd, null);

    expect(readFileSync(path.join(cwd, "tsconfig.json"), "utf8")).toBe(before);
    expect(existsSync(path.join(cwd, ".gitignore"))).toBe(false);
  });

  test("a null materializedDir drops the extensions entry, keeping siblings and typeRoots", () => {
    writeTsconfig({
      compilerOptions: {
        strict: true,
        typeRoots: [".defold-types"],
        types: ["defold-1.12.4", "extensions", "libraries@1.2.3"],
      },
      include: ["src/**/*.ts"],
    });

    ensureExtensionTypesReference(cwd, null);

    const tsconfig = readTsconfig();
    expect(tsconfig.compilerOptions.types).toEqual(["defold-1.12.4", "libraries@1.2.3"]);
    expect(tsconfig.compilerOptions.typeRoots).toEqual([".defold-types"]);
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
