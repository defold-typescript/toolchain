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
import { basename, join, relative, sep } from "node:path";
import { resolveTypesPackageRoot } from "./api-registry";
import { runExportTypes } from "./export-types";
import { loadVendoredLibraryRegistry, loadVendoredNativeRegistry } from "./library-registry";
import {
  checkShippedDeclarations,
  locateShippedDeclarations,
  selectShippedDeclarations,
} from "./shipped-declarations";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "export-types-"));
}

function typesRoot(): string {
  const root = resolveTypesPackageRoot();
  if (root === null) {
    throw new Error("@defold-typescript/types is not resolvable from the CLI package");
  }
  return root;
}

// Every file under `dir`, relative to it with `/` separators, so a nested or
// misplaced write shows up beside the expected ones.
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

function thrownMessage(run: () => unknown): string {
  try {
    run();
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
  throw new Error("expected the call to throw");
}

function firstNativeTarget() {
  const target = loadVendoredNativeRegistry()[0];
  if (target === undefined) {
    throw new Error("the committed corpus has no native target");
  }
  return target;
}

// A curated native that declares only its module, and one that also declares the
// deprecated global a release shipped: `resolve` classifies the two forms apart.
function nativeTargetsByForm() {
  const targets = loadVendoredNativeRegistry();
  const aliased = (target: (typeof targets)[number]): boolean =>
    /^declare const /m.test(readFileSync(target.declarationPath, "utf8"));
  const moduleOnly = targets.find((target) => !aliased(target));
  const withAlias = targets.find(aliased);
  if (moduleOnly === undefined || withAlias === undefined) {
    throw new Error("the committed corpus lacks a module-only or an aliased native target");
  }
  return [moduleOnly, withAlias];
}

// The committed files a Lua-module source installs, keyed the way `resolve`
// reads them: `generated/<generatedStems[module] ?? module>.d.ts`.
function firstMultiFileLibrary(): { sourceId: string; files: string[] } {
  const { registry, generatedDir } = loadVendoredLibraryRegistry();
  if (generatedDir === null) {
    throw new Error("the committed corpus has no generated folder");
  }
  for (const library of registry) {
    const files = [
      ...new Set(
        library.modules.map((module) =>
          join(generatedDir, `${library.generatedStems?.[module] ?? module}.d.ts`),
        ),
      ),
    ].sort();
    if (files.length > 1) {
      return { sourceId: library.sourceId, files };
    }
  }
  throw new Error("the committed corpus has no library whose modules span several files");
}

interface FixtureNative {
  readonly repo: string;
  readonly namespace: string;
  readonly declaration: string;
  readonly contents: string;
}

interface FixtureLuals {
  readonly repo: string;
  readonly moduleId: string;
  readonly namespace: string;
  readonly contents: string;
}

// A corpus root in the committed registries' shape, read by the production
// loaders.
function writeCorpus(corpus: {
  readonly native?: readonly FixtureNative[];
  readonly luals?: readonly FixtureLuals[];
}): string {
  const root = tmp();
  mkdirSync(join(root, "generated", "native"), { recursive: true });
  writeFileSync(join(root, "library-classification.json"), JSON.stringify({ dirs: [] }));
  writeFileSync(join(root, "library-targets.json"), JSON.stringify({ targets: [] }));
  const native = corpus.native ?? [];
  writeFileSync(
    join(root, "native-targets.json"),
    JSON.stringify({
      targets: native.map(({ repo, namespace, declaration }) => ({
        repo,
        namespace,
        manifestDir: namespace,
        declaration,
      })),
    }),
  );
  for (const { declaration, contents } of native) {
    writeFileSync(join(root, declaration), contents);
  }
  const luals = corpus.luals ?? [];
  writeFileSync(
    join(root, "luals-targets.json"),
    JSON.stringify({
      targets: luals.map(({ repo, moduleId, namespace }) => ({ repo, moduleId, namespace })),
    }),
  );
  for (const { namespace, contents } of luals) {
    writeFileSync(join(root, "generated", `${namespace}.d.ts`), contents);
  }
  return root;
}

describe("runExportTypes over the committed corpus", () => {
  test("a native target exports its curated declaration unchanged, with or without an alias", () => {
    for (const target of nativeTargetsByForm()) {
      const cwd = tmp();

      const result = runExportTypes({ library: target.sourceId, cwd });

      const name = basename(target.declarationPath);
      expect(result).toEqual({ sourceId: target.sourceId, written: [`types/${name}`] });
      expect(filesUnder(cwd)).toEqual([`types/${name}`]);
      expect(readFileSync(join(cwd, "types", name), "utf8")).toBe(
        readFileSync(target.declarationPath, "utf8"),
      );
    }
  });

  test("a library spanning several committed files exports each one unchanged", () => {
    const { sourceId, files } = firstMultiFileLibrary();
    const cwd = tmp();

    const result = runExportTypes({ library: sourceId, cwd });

    const expected = files.map((file) => `types/${basename(file)}`).sort();
    expect(result.sourceId).toBe(sourceId);
    expect([...result.written].sort()).toEqual(expected);
    expect(filesUnder(cwd)).toEqual(expected);
    for (const file of files) {
      expect(readFileSync(join(cwd, "types", basename(file)), "utf8")).toBe(
        readFileSync(file, "utf8"),
      );
    }
  });

  test("a dependency URL and the bare repo name export the same files", () => {
    const target = firstNativeTarget();
    const byName = tmp();
    const byUrl = tmp();

    runExportTypes({ library: target.sourceId, cwd: byName });
    runExportTypes({
      library: `https://github.com/owner/${target.sourceId}/archive/refs/tags/v1.0.0.zip`,
      cwd: byUrl,
    });

    expect(filesUnder(byUrl)).toEqual(filesUnder(byName));
    for (const file of filesUnder(byName)) {
      expect(readFileSync(join(byUrl, file), "utf8")).toBe(
        readFileSync(join(byName, file), "utf8"),
      );
    }
  });

  test("the written folder reads back as shipped types resolve installs", () => {
    const sourceIds = [
      ...nativeTargetsByForm().map((target) => target.sourceId),
      firstMultiFileLibrary().sourceId,
    ];
    for (const sourceId of sourceIds) {
      const cwd = tmp();
      runExportTypes({ library: sourceId, cwd });

      const entries = filesUnder(cwd).map((file) => `${sourceId}-main/${file}`);
      const located = locateShippedDeclarations(entries);
      expect(located).toEqual([...entries].sort());
      const files = located.map((entry) => ({
        entry,
        contents: readFileSync(join(cwd, entry.slice(`${sourceId}-main/`.length)), "utf8"),
      }));
      expect(selectShippedDeclarations(files)).toEqual(files);
      const messages = [...checkShippedDeclarations(files, typesRoot()).values()].flat();
      expect(messages).toEqual([]);
    }
  });
});

describe("runExportTypes refusals", () => {
  const BAD_ONE = "declare namespace bad {\n  const h: hash;\n}\n";
  const BAD_TWO = "declare namespace bad {\n  const h: hash;\n  const g: hash;\n}\n";
  const CHECK_FAILURE =
    "curated types for defold-bad were not exported: types/ would not compile against @defold-typescript/types: ";

  function badCorpus(contents: string): string {
    return writeCorpus({
      native: [
        {
          repo: "https://github.com/owner/defold-bad",
          namespace: "bad",
          declaration: "generated/native/bad.d.ts",
          contents,
        },
      ],
    });
  }

  test("a declaration that does not compile throws its first message and writes nothing", () => {
    const cwd = tmp();

    const message = thrownMessage(() =>
      runExportTypes({ library: "defold-bad", cwd, libraryTypesRoot: badCorpus(BAD_ONE) }),
    );
    expect(message).toStartWith(`${CHECK_FAILURE}types/bad.d.ts(2,`);
    expect(message).toContain("'hash'");
    expect(message).not.toContain("more)");
    expect(readdirSync(cwd)).toEqual([]);
  });

  test("past one message the error counts the rest", () => {
    const cwd = tmp();

    const message = thrownMessage(() =>
      runExportTypes({ library: "defold-bad", cwd, libraryTypesRoot: badCorpus(BAD_TWO) }),
    );
    expect(message).toStartWith(`${CHECK_FAILURE}types/bad.d.ts(2,`);
    expect(message).toEndWith(" (+1 more)");
    expect(readdirSync(cwd)).toEqual([]);
  });

  test("a module-form file beside a global file throws naming the file resolve skips", () => {
    const cwd = tmp();
    const libraryTypesRoot = writeCorpus({
      luals: [
        {
          repo: "https://github.com/owner/pair",
          moduleId: "pair.mod",
          namespace: "pair.mod",
          contents: 'declare module "pair.mod" {\n  export const x: number;\n}\n',
        },
        {
          repo: "https://github.com/owner/pair",
          moduleId: "pair.glob",
          namespace: "pair.glob",
          contents: "declare const pairglob: number;\n",
        },
      ],
    });

    const message = thrownMessage(() => runExportTypes({ library: "pair", cwd, libraryTypesRoot }));
    expect(message).toContain("types/pair.glob.d.ts");
    expect(message).not.toContain("types/pair.mod.d.ts");
    expect(readdirSync(cwd)).toEqual([]);
  });

  test("two curated files with one name throw and write nothing", () => {
    const cwd = tmp();
    const libraryTypesRoot = writeCorpus({
      native: [
        {
          repo: "https://github.com/owner/dup",
          namespace: "dup",
          declaration: "generated/native/dup.d.ts",
          contents: "declare namespace dup {\n  const a: number;\n}\n",
        },
      ],
      luals: [
        {
          repo: "https://github.com/owner/dup",
          moduleId: "dup.dup",
          namespace: "dup",
          contents: 'declare module "dup.dup" {\n  export const b: number;\n}\n',
        },
      ],
    });

    expect(() => runExportTypes({ library: "dup", cwd, libraryTypesRoot })).toThrow(
      "two curated files for dup are both named dup.d.ts",
    );
    expect(readdirSync(cwd)).toEqual([]);
  });

  test("with no @defold-typescript/types to check against it throws and writes nothing", () => {
    const target = firstNativeTarget();
    const cwd = tmp();

    expect(() => runExportTypes({ library: target.sourceId, cwd, typesRoot: null })).toThrow(
      `curated types for ${target.sourceId} were not exported: @defold-typescript/types could not be found to check them`,
    );
    expect(readdirSync(cwd)).toEqual([]);
  });

  test("an unknown library throws and writes nothing", () => {
    const cwd = tmp();

    expect(() => runExportTypes({ library: "Not-A-Library", cwd })).toThrow(
      'no curated types for "Not-A-Library"',
    );
    expect(readdirSync(cwd)).toEqual([]);
  });
});

describe("runExportTypes over an existing types folder", () => {
  const BROKEN = "declare namespace broken {\n  const h: hash;\n}\n";

  // Each file under `dir` with its contents, so a refusal that writes anything
  // or changes a byte shows up as a difference.
  function snapshot(dir: string): Record<string, string> {
    return Object.fromEntries(
      filesUnder(dir).map((file) => [file, readFileSync(join(dir, file), "utf8")]),
    );
  }

  function folderWith(files: Record<string, string>): string {
    const cwd = tmp();
    for (const [file, contents] of Object.entries(files)) {
      mkdirSync(join(cwd, file, ".."), { recursive: true });
      writeFileSync(join(cwd, file), contents);
    }
    return cwd;
  }

  // Whether the folder the tests write to treats names differing only in case
  // as one file, observed rather than assumed from the platform: macOS and
  // Windows runners fold case by default, ubuntu does not.
  const TMP_FOLDS_CASE = (() => {
    const dir = tmp();
    writeFileSync(join(dir, "CASE"), "");
    return existsSync(join(dir, "case"));
  })();

  // Reads `cwd` back the way `resolve` reads a release archive of it: every
  // `written` file survives the selection, and the folder compiles.
  function expectReadsBackAsShipped(cwd: string, sourceId: string, written: readonly string[]) {
    const wrapper = `${sourceId}-main/`;
    const located = locateShippedDeclarations(filesUnder(cwd).map((file) => `${wrapper}${file}`));
    const files = located.map((entry) => ({
      entry,
      contents: readFileSync(join(cwd, entry.slice(wrapper.length)), "utf8"),
    }));
    const selected = selectShippedDeclarations(files);
    const kept = selected.map(({ entry }) => entry);
    for (const entry of written) {
      expect(kept).toContain(`${wrapper}${entry}`);
    }
    const messages = [...checkShippedDeclarations(selected, typesRoot()).values()].flat();
    expect(messages).toEqual([]);
  }

  const GLOB_CURATED = "declare namespace glob {\n  const a: number;\n}\n";
  const OTHER = "declare const other: number;\n";

  // A curated global `glob.d.ts` against a folder holding a module-form
  // `GLOB.d.ts` and a global `other.d.ts`.
  function caseAliasFixture(): { cwd: string; libraryTypesRoot: string } {
    return {
      cwd: folderWith({
        "types/GLOB.d.ts": 'declare module "glob" {\n  export const x: number;\n}\n',
        "types/other.d.ts": OTHER,
      }),
      libraryTypesRoot: writeCorpus({
        native: [
          {
            repo: "https://github.com/owner/defold-glob",
            namespace: "glob",
            declaration: "generated/native/glob.d.ts",
            contents: GLOB_CURATED,
          },
        ],
      }),
    };
  }

  test("a global file exported beside an existing module-form file is refused", () => {
    const cwd = folderWith({
      "types/existing.d.ts": 'declare module "existing" {\n  export const x: number;\n}\n',
    });
    const before = snapshot(cwd);
    const libraryTypesRoot = writeCorpus({
      native: [
        {
          repo: "https://github.com/owner/defold-glob",
          namespace: "glob",
          declaration: "generated/native/glob.d.ts",
          contents: "declare namespace glob {\n  const a: number;\n}\n",
        },
      ],
    });

    const message = thrownMessage(() =>
      runExportTypes({ library: "defold-glob", cwd, libraryTypesRoot }),
    );
    expect(message).toContain("types/glob.d.ts");
    expect(message).not.toContain("types/existing.d.ts");
    expect(snapshot(cwd)).toEqual(before);
  });

  test("an existing global file that does not compile refuses the export", () => {
    const target = firstNativeTarget();
    const cwd = folderWith({
      "types/broken.d.ts": BROKEN,
      [`types/${basename(target.declarationPath)}`]: "stale\n",
    });
    const before = snapshot(cwd);

    const message = thrownMessage(() => runExportTypes({ library: target.sourceId, cwd }));
    expect(message).toStartWith(
      `curated types for ${target.sourceId} were not exported: types/ would not compile against @defold-typescript/types: types/broken.d.ts(2,`,
    );
    expect(snapshot(cwd)).toEqual(before);
  });

  test("an existing file the selection drops is not checked", () => {
    const cwd = folderWith({ "types/broken.d.ts": BROKEN });
    const libraryTypesRoot = writeCorpus({
      luals: [
        {
          repo: "https://github.com/owner/modlib",
          moduleId: "modlib",
          namespace: "modlib",
          contents: 'declare module "modlib" {\n  export const x: number;\n}\n',
        },
      ],
    });

    const result = runExportTypes({ library: "modlib", cwd, libraryTypesRoot });

    expect(result).toEqual({ sourceId: "modlib", written: ["types/modlib.d.ts"] });
    expect(readFileSync(join(cwd, "types", "broken.d.ts"), "utf8")).toBe(BROKEN);
  });

  test("files outside the shipped surface are ignored", () => {
    const target = firstNativeTarget();
    const outside = {
      "types/nested/broken.d.ts": BROKEN,
      "types/nested/mod.d.ts": 'declare module "mod" {\n  export const x: number;\n}\n',
      "types/helper.ts": 'declare module "helper" {\n  export const x: number;\n}\n',
    };
    const cwd = folderWith(outside);

    runExportTypes({ library: target.sourceId, cwd });

    for (const [file, contents] of Object.entries(outside)) {
      expect(readFileSync(join(cwd, file), "utf8")).toBe(contents);
    }
  });

  test("a same-named file is overwritten and every other file is left alone", () => {
    const target = firstNativeTarget();
    const name = basename(target.declarationPath);
    const cwd = tmp();
    mkdirSync(join(cwd, "types"));
    writeFileSync(join(cwd, "types", name), "stale\n");
    writeFileSync(join(cwd, "types", "other.d.ts"), "declare const other: number;\n");

    const { written } = runExportTypes({ library: target.sourceId, cwd });

    expect(readFileSync(join(cwd, "types", name), "utf8")).toBe(
      readFileSync(target.declarationPath, "utf8"),
    );
    expect(readFileSync(join(cwd, "types", "other.d.ts"), "utf8")).toBe(
      "declare const other: number;\n",
    );
    expectReadsBackAsShipped(cwd, target.sourceId, written);
  });

  test.skipIf(!TMP_FOLDS_CASE)(
    "an existing file whose name differs only in case is the file the export replaces",
    () => {
      const { cwd, libraryTypesRoot } = caseAliasFixture();

      const result = runExportTypes({ library: "defold-glob", cwd, libraryTypesRoot });

      expect(result).toEqual({ sourceId: "defold-glob", written: ["types/GLOB.d.ts"] });
      expect(filesUnder(cwd)).toEqual(["types/GLOB.d.ts", "types/other.d.ts"]);
      expect(readFileSync(join(cwd, "types", "GLOB.d.ts"), "utf8")).toBe(GLOB_CURATED);
      expect(readFileSync(join(cwd, "types", "other.d.ts"), "utf8")).toBe(OTHER);
      expectReadsBackAsShipped(cwd, "defold-glob", result.written);
    },
  );

  test.skipIf(TMP_FOLDS_CASE)(
    "an existing file whose name differs only in case stays a separate file",
    () => {
      const { cwd, libraryTypesRoot } = caseAliasFixture();
      const before = snapshot(cwd);

      const message = thrownMessage(() =>
        runExportTypes({ library: "defold-glob", cwd, libraryTypesRoot }),
      );
      expect(message).toContain("resolve skips types/glob.d.ts");
      expect(snapshot(cwd)).toEqual(before);
    },
  );
});
