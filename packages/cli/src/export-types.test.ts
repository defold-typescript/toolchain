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
import { printCorpus } from "./library/print-corpus";
import {
  loadVendoredLibraryRegistry,
  loadVendoredNativeRegistry,
  resolveLibraryDataDir,
} from "./library-registry";
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

async function thrownMessage(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
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

// The declarations a Lua-module source installs, as `resolve` prints them, each
// under `<namespaces[module] ?? module>.d.ts`.
async function firstMultiFileLibrary(): Promise<{
  sourceId: string;
  files: Map<string, string>;
}> {
  const root = resolveLibraryDataDir();
  if (root === null) {
    throw new Error("the CLI selects no library data folder");
  }
  const corpus = await printCorpus(root);
  for (const library of loadVendoredLibraryRegistry(root)) {
    const files = new Map<string, string>();
    for (const module of library.modules) {
      const contents = corpus.get(module);
      if (contents !== undefined) {
        files.set(`${library.namespaces?.[module] ?? module}.d.ts`, contents);
      }
    }
    if (files.size > 1) {
      return { sourceId: library.sourceId, files };
    }
  }
  throw new Error("the corpus has no library whose modules span several files");
}

interface FixtureNative {
  readonly repo: string;
  readonly namespace: string;
  readonly declaration: string;
  readonly contents: string;
}

interface FixtureAuthored {
  readonly repo: string;
  readonly moduleId: string;
  readonly namespace: string;
  readonly contents: string;
}

// A corpus root in the committed registries' shape, read by the production
// loaders.
function writeCorpus(corpus: {
  readonly native?: readonly FixtureNative[];
  readonly authored?: readonly FixtureAuthored[];
}): string {
  const root = tmp();
  mkdirSync(join(root, "native"), { recursive: true });
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
  writeFileSync(join(root, "luals-targets.json"), JSON.stringify({ targets: [] }));
  writeFileSync(join(root, "script-api-targets.json"), JSON.stringify({ targets: [] }));
  const authored = corpus.authored ?? [];
  mkdirSync(join(root, "fixtures", "authored"), { recursive: true });
  writeFileSync(
    join(root, "authored-targets.json"),
    JSON.stringify({
      targets: authored.map(({ repo, moduleId, namespace }) => ({
        repo,
        ref: "1.0.0",
        authored: `fixtures/authored/${moduleId}.d.ts`,
        moduleId,
        namespace,
        apiDoc: `api-doc/${namespace}.json`,
        upstreamLua: [`fixtures/upstream-lua/${moduleId}.lua`],
      })),
    }),
  );
  for (const { moduleId, contents } of authored) {
    writeFileSync(join(root, "fixtures", "authored", `${moduleId}.d.ts`), contents);
  }
  return root;
}

describe("runExportTypes over the committed corpus", () => {
  test("a native target exports its curated declaration unchanged", async () => {
    const target = firstNativeTarget();
    const cwd = tmp();

    const result = await runExportTypes({ library: target.sourceId, cwd });

    const name = basename(target.declarationPath);
    expect(result).toEqual({ sourceId: target.sourceId, written: [`types/${name}`] });
    expect(filesUnder(cwd)).toEqual([`types/${name}`]);
    expect(readFileSync(join(cwd, "types", name), "utf8")).toBe(
      readFileSync(target.declarationPath, "utf8"),
    );
  });

  test("a library spanning several printed modules exports each one as resolve prints it", async () => {
    const { sourceId, files } = await firstMultiFileLibrary();
    const cwd = tmp();

    const result = await runExportTypes({ library: sourceId, cwd });

    const expected = [...files.keys()].map((name) => `types/${name}`).sort();
    expect(result.sourceId).toBe(sourceId);
    expect([...result.written].sort()).toEqual(expected);
    expect(filesUnder(cwd)).toEqual(expected);
    for (const [name, contents] of files) {
      expect(readFileSync(join(cwd, "types", name), "utf8")).toBe(contents);
    }
  });

  test("a dependency URL and the bare repo name export the same files", async () => {
    const target = firstNativeTarget();
    const byName = tmp();
    const byUrl = tmp();

    await runExportTypes({ library: target.sourceId, cwd: byName });
    await runExportTypes({
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

  test("the written folder reads back as shipped types resolve installs", async () => {
    const sourceIds = [firstNativeTarget().sourceId, (await firstMultiFileLibrary()).sourceId];
    for (const sourceId of sourceIds) {
      const cwd = tmp();
      await runExportTypes({ library: sourceId, cwd });

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
          declaration: "native/bad.d.ts",
          contents,
        },
      ],
    });
  }

  test("a declaration that does not compile throws its first message and writes nothing", async () => {
    const cwd = tmp();

    const message = await thrownMessage(() =>
      runExportTypes({ library: "defold-bad", cwd, libraryDataDir: badCorpus(BAD_ONE) }),
    );
    expect(message).toStartWith(`${CHECK_FAILURE}types/bad.d.ts(2,`);
    expect(message).toContain("'hash'");
    expect(message).not.toContain("more)");
    expect(readdirSync(cwd)).toEqual([]);
  });

  test("past one message the error counts the rest", async () => {
    const cwd = tmp();

    const message = await thrownMessage(() =>
      runExportTypes({ library: "defold-bad", cwd, libraryDataDir: badCorpus(BAD_TWO) }),
    );
    expect(message).toStartWith(`${CHECK_FAILURE}types/bad.d.ts(2,`);
    expect(message).toEndWith(" (+1 more)");
    expect(readdirSync(cwd)).toEqual([]);
  });

  test("a module-form file beside a global file throws naming the file resolve skips", async () => {
    const cwd = tmp();
    const libraryDataDir = writeCorpus({
      authored: [
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

    const message = await thrownMessage(() =>
      runExportTypes({ library: "pair", cwd, libraryDataDir }),
    );
    expect(message).toContain("types/pair.glob.d.ts");
    expect(message).not.toContain("types/pair.mod.d.ts");
    expect(readdirSync(cwd)).toEqual([]);
  });

  test("two curated files with one name throw and write nothing", async () => {
    const cwd = tmp();
    const libraryDataDir = writeCorpus({
      native: [
        {
          repo: "https://github.com/owner/dup",
          namespace: "dup",
          declaration: "native/dup.d.ts",
          contents: "declare namespace dup {\n  const a: number;\n}\n",
        },
      ],
      authored: [
        {
          repo: "https://github.com/owner/dup",
          moduleId: "dup.dup",
          namespace: "dup",
          contents: 'declare module "dup.dup" {\n  export const b: number;\n}\n',
        },
      ],
    });

    await expect(runExportTypes({ library: "dup", cwd, libraryDataDir })).rejects.toThrow(
      "two curated files for dup are both named dup.d.ts",
    );
    expect(readdirSync(cwd)).toEqual([]);
  });

  test("with no @defold-typescript/types to check against it throws and writes nothing", async () => {
    const target = firstNativeTarget();
    const cwd = tmp();

    await expect(
      runExportTypes({ library: target.sourceId, cwd, typesRoot: null }),
    ).rejects.toThrow(
      `curated types for ${target.sourceId} were not exported: @defold-typescript/types could not be found to check them`,
    );
    expect(readdirSync(cwd)).toEqual([]);
  });

  test("an unknown library throws and writes nothing", async () => {
    const cwd = tmp();

    await expect(runExportTypes({ library: "Not-A-Library", cwd })).rejects.toThrow(
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
  function caseAliasFixture(): { cwd: string; libraryDataDir: string } {
    return {
      cwd: folderWith({
        "types/GLOB.d.ts": 'declare module "glob" {\n  export const x: number;\n}\n',
        "types/other.d.ts": OTHER,
      }),
      libraryDataDir: writeCorpus({
        native: [
          {
            repo: "https://github.com/owner/defold-glob",
            namespace: "glob",
            declaration: "native/glob.d.ts",
            contents: GLOB_CURATED,
          },
        ],
      }),
    };
  }

  test("a global file exported beside an existing module-form file is refused", async () => {
    const cwd = folderWith({
      "types/existing.d.ts": 'declare module "existing" {\n  export const x: number;\n}\n',
    });
    const before = snapshot(cwd);
    const libraryDataDir = writeCorpus({
      native: [
        {
          repo: "https://github.com/owner/defold-glob",
          namespace: "glob",
          declaration: "native/glob.d.ts",
          contents: "declare namespace glob {\n  const a: number;\n}\n",
        },
      ],
    });

    const message = await thrownMessage(() =>
      runExportTypes({ library: "defold-glob", cwd, libraryDataDir }),
    );
    expect(message).toContain("types/glob.d.ts");
    expect(message).not.toContain("types/existing.d.ts");
    expect(snapshot(cwd)).toEqual(before);
  });

  test("an existing global file that does not compile refuses the export", async () => {
    const cwd = folderWith({ "types/broken.d.ts": BROKEN, "types/glob.d.ts": "stale\n" });
    const libraryDataDir = writeCorpus({
      native: [
        {
          repo: "https://github.com/owner/defold-glob",
          namespace: "glob",
          declaration: "native/glob.d.ts",
          contents: "declare namespace glob {\n  const a: number;\n}\n",
        },
      ],
    });
    const before = snapshot(cwd);

    const message = await thrownMessage(() =>
      runExportTypes({ library: "defold-glob", cwd, libraryDataDir }),
    );
    expect(message).toStartWith(
      "curated types for defold-glob were not exported: types/ would not compile against @defold-typescript/types: types/broken.d.ts(2,",
    );
    expect(snapshot(cwd)).toEqual(before);
  });

  test("an existing file the selection drops is not checked", async () => {
    const cwd = folderWith({ "types/broken.d.ts": BROKEN });
    const libraryDataDir = writeCorpus({
      authored: [
        {
          repo: "https://github.com/owner/modlib",
          moduleId: "modlib",
          namespace: "modlib",
          contents: 'declare module "modlib" {\n  export const x: number;\n}\n',
        },
      ],
    });

    const result = await runExportTypes({ library: "modlib", cwd, libraryDataDir });

    expect(result).toEqual({ sourceId: "modlib", written: ["types/modlib.d.ts"] });
    expect(readFileSync(join(cwd, "types", "broken.d.ts"), "utf8")).toBe(BROKEN);
  });

  test("files outside the shipped surface are ignored", async () => {
    const target = firstNativeTarget();
    const outside = {
      "types/nested/broken.d.ts": BROKEN,
      "types/nested/mod.d.ts": 'declare module "mod" {\n  export const x: number;\n}\n',
      "types/helper.ts": 'declare module "helper" {\n  export const x: number;\n}\n',
    };
    const cwd = folderWith(outside);

    await runExportTypes({ library: target.sourceId, cwd });

    for (const [file, contents] of Object.entries(outside)) {
      expect(readFileSync(join(cwd, file), "utf8")).toBe(contents);
    }
  });

  test("a same-named file is overwritten and every other file is left alone", async () => {
    const target = firstNativeTarget();
    const name = basename(target.declarationPath);
    const cwd = tmp();
    mkdirSync(join(cwd, "types"));
    writeFileSync(join(cwd, "types", name), "stale\n");
    writeFileSync(join(cwd, "types", "other.d.ts"), "declare const other: number;\n");

    const { written } = await runExportTypes({ library: target.sourceId, cwd });

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
    async () => {
      const { cwd, libraryDataDir } = caseAliasFixture();

      const result = await runExportTypes({ library: "defold-glob", cwd, libraryDataDir });

      expect(result).toEqual({ sourceId: "defold-glob", written: ["types/GLOB.d.ts"] });
      expect(filesUnder(cwd)).toEqual(["types/GLOB.d.ts", "types/other.d.ts"]);
      expect(readFileSync(join(cwd, "types", "GLOB.d.ts"), "utf8")).toBe(GLOB_CURATED);
      expect(readFileSync(join(cwd, "types", "other.d.ts"), "utf8")).toBe(OTHER);
      expectReadsBackAsShipped(cwd, "defold-glob", result.written);
    },
  );

  test.skipIf(TMP_FOLDS_CASE)(
    "an existing file whose name differs only in case stays a separate file",
    async () => {
      const { cwd, libraryDataDir } = caseAliasFixture();
      const before = snapshot(cwd);

      const message = await thrownMessage(() =>
        runExportTypes({ library: "defold-glob", cwd, libraryDataDir }),
      );
      expect(message).toContain("resolve skips types/glob.d.ts");
      expect(snapshot(cwd)).toEqual(before);
    },
  );
});
