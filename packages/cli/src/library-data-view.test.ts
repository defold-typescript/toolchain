import { describe, expect, test } from "bun:test";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  DEFOLD_EXTENSIONS_FILE,
  EXTENSION_INDEX_SLOTS_FILE,
  type IndexSlotEntry,
  LibraryDataError,
  readIndexSlots,
  readLibraryData,
} from "./library/library-data";
import { printLibraryModules } from "./library/print-library";
import { writeLibraryTargets } from "./library-data-fixture";
import { assembleLibraryDataView } from "./library-data-view";

const COMMIT_A = "0123456789abcdef0123456789abcdef01234567";
const COMMIT_B = "fedcba9876543210fedcba9876543210fedcba98";
const CLI = "0.55.0";
const SLOT: IndexSlotEntry = { class: "native-0", evidence: "fixture" };

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "library-data-view-"));
}

const folderAt = (cacheDir: string, commit: string) =>
  join(cacheDir, "commits", commit, "data", CLI);

function writeLibrary(
  dataDir: string,
  library: string,
  moduleId: string,
  contents: string,
  indexSlots?: Record<string, IndexSlotEntry>,
): void {
  const authored = `fork/${moduleId}.d.ts`;
  mkdirSync(join(dataDir, library, "fork"), { recursive: true });
  writeFileSync(join(dataDir, library, authored), contents);
  writeLibraryTargets(dataDir, {
    forks: [
      {
        repo: `https://github.com/owner/${library}`,
        ref: "1.0.0",
        authored,
        moduleId,
        namespace: moduleId,
        apiDoc: `api-doc/${moduleId}.json`,
        upstreamLua: [`source/upstream/${moduleId}.lua`],
      },
    ],
    ...(indexSlots === undefined ? {} : { indexSlots }),
  });
}

function writeSharedSlots(dataDir: string, slots: Record<string, IndexSlotEntry>): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, EXTENSION_INDEX_SLOTS_FILE), JSON.stringify(slots));
}

// `monarch` and `druid` at both commits, each with bytes naming its commit, so a
// library read from the wrong commit prints the wrong declaration.
function writeTwoCommits(cacheDir: string): { a: string; b: string } {
  const a = folderAt(cacheDir, COMMIT_A);
  const b = folderAt(cacheDir, COMMIT_B);
  for (const [folder, tag] of [
    [a, "a"],
    [b, "b"],
  ] as const) {
    writeLibrary(
      folder,
      "monarch",
      "monarch.core",
      `declare module 'monarch.core' { /* ${tag} */ }\n`,
    );
    writeLibrary(folder, "druid", "druid.core", `declare module 'druid.core' { /* ${tag} */ }\n`);
  }
  return { a, b };
}

function assembled(result: { dir: string | null }): string {
  if (result.dir === null) {
    throw new Error("expected a view");
  }
  return result.dir;
}

describe("assembleLibraryDataView", () => {
  test("each library reads from its own commit through the real loaders", async () => {
    const cacheDir = tmp();
    const { a, b } = writeTwoCommits(cacheDir);

    const result = assembleLibraryDataView({
      cacheDir,
      libraries: [
        { name: "monarch", folderDir: a },
        { name: "druid", folderDir: b },
      ],
      shared: null,
    });
    const view = assembled(result);

    expect(result.missing).toEqual([]);
    expect(readLibraryData(view).map(({ dir }) => dir)).toEqual(["druid", "monarch"]);
    const { printed } = await printLibraryModules(view, ["monarch.core", "druid.core"], null);
    const fromA = await printLibraryModules(a, ["monarch.core"], null);
    const fromB = await printLibraryModules(b, ["druid.core"], null);
    expect(printed.map(({ contents }) => contents)).toEqual([
      fromA.printed[0]?.contents as string,
      fromB.printed[0]?.contents as string,
    ]);
    expect(printed[0]?.contents).toContain("/* a */");
    expect(printed[1]?.contents).toContain("/* b */");
  });

  test("the extension slots come from the shared folder, not a library's commit", () => {
    const cacheDir = tmp();
    const { a, b } = writeTwoCommits(cacheDir);
    writeSharedSlots(a, { "wrong/commit:param:x": SLOT });
    writeSharedSlots(b, { "right/commit:param:x": SLOT });

    const view = assembled(
      assembleLibraryDataView({
        cacheDir,
        libraries: [{ name: "monarch", folderDir: a }],
        shared: b,
      }),
    );

    expect(readIndexSlots(view)).toEqual({ "right/commit:param:x": SLOT });
  });

  test("with no shared source the file is absent and the read holds only library slots", () => {
    const cacheDir = tmp();
    const a = folderAt(cacheDir, COMMIT_A);
    writeLibrary(a, "monarch", "monarch.core", "declare module 'monarch.core' {}\n", {
      "monarch/core:param:x": SLOT,
    });
    writeSharedSlots(a, { "extension/page:param:x": SLOT });

    const view = assembled(
      assembleLibraryDataView({
        cacheDir,
        libraries: [{ name: "monarch", folderDir: a }],
        shared: null,
      }),
    );

    expect(existsSync(join(view, EXTENSION_INDEX_SLOTS_FILE))).toBe(false);
    expect(readIndexSlots(view)).toEqual({ "monarch/core:param:x": SLOT });
  });

  test("a shared folder without the file adds nothing", () => {
    const cacheDir = tmp();
    const { a, b } = writeTwoCommits(cacheDir);

    const view = assembled(
      assembleLibraryDataView({
        cacheDir,
        libraries: [{ name: "monarch", folderDir: a }],
        shared: b,
      }),
    );

    expect(readdirSync(view)).toEqual(["monarch"]);
  });

  test("the extension page map comes from the shared folder with the same bytes", () => {
    const cacheDir = tmp();
    const { a, b } = writeTwoCommits(cacheDir);
    writeFileSync(join(a, DEFOLD_EXTENSIONS_FILE), '{"libraries":["wrong commit"]}\n');
    writeFileSync(join(b, DEFOLD_EXTENSIONS_FILE), '{"libraries":["right commit"]}\n');

    const view = assembled(
      assembleLibraryDataView({
        cacheDir,
        libraries: [{ name: "monarch", folderDir: a }],
        shared: b,
      }),
    );

    expect(readFileSync(join(view, DEFOLD_EXTENSIONS_FILE), "utf8")).toBe(
      '{"libraries":["right commit"]}\n',
    );
  });

  test("other top-level files and libraries not asked for stay out", () => {
    const cacheDir = tmp();
    const { a, b } = writeTwoCommits(cacheDir);
    writeFileSync(join(a, "stray.json"), "{}");
    writeFileSync(join(b, "stray.json"), "{}");
    writeSharedSlots(b, {});
    writeFileSync(join(b, DEFOLD_EXTENSIONS_FILE), '{"libraries":[]}');

    const view = assembled(
      assembleLibraryDataView({
        cacheDir,
        libraries: [{ name: "monarch", folderDir: a }],
        shared: b,
      }),
    );

    expect(readdirSync(view).sort()).toEqual(
      [DEFOLD_EXTENSIONS_FILE, EXTENSION_INDEX_SLOTS_FILE, "monarch"].sort(),
    );
  });

  test.each([
    ["has no folder", () => {}],
    [
      "has a folder that is no library",
      (folder: string) => mkdirSync(join(folder, "absent"), { recursive: true }),
    ],
  ])("a library that %s at its commit is missing, and no view is written", (_name, arrange) => {
    const cacheDir = tmp();
    const { a, b } = writeTwoCommits(cacheDir);
    arrange(b);

    const result = assembleLibraryDataView({
      cacheDir,
      libraries: [
        { name: "monarch", folderDir: a },
        { name: "absent", folderDir: b },
      ],
      shared: null,
    });

    expect(result).toEqual({ dir: null, missing: ["absent"] });
    expect(existsSync(join(cacheDir, "views"))).toBe(false);
  });

  test("the same inputs in any order give the same path with no second write", () => {
    const cacheDir = tmp();
    const { a, b } = writeTwoCommits(cacheDir);
    const monarch = { name: "monarch", folderDir: a };
    const druid = { name: "druid", folderDir: b };

    const first = assembled(
      assembleLibraryDataView({ cacheDir, libraries: [monarch, druid], shared: null }),
    );
    const marker = join(first, "marker");
    writeFileSync(marker, "first");
    const second = assembled(
      assembleLibraryDataView({ cacheDir, libraries: [druid, monarch], shared: null }),
    );

    expect(dirname(first)).toBe(join(cacheDir, "views"));
    expect(second).toBe(first);
    expect(existsSync(marker)).toBe(true);
  });

  test("the key follows the commit of each library and of the shared folder", () => {
    const cacheDir = tmp();
    const { a, b } = writeTwoCommits(cacheDir);
    const view = (monarch: string, shared: string | null) =>
      assembled(
        assembleLibraryDataView({
          cacheDir,
          libraries: [{ name: "monarch", folderDir: monarch }],
          shared,
        }),
      );

    expect(new Set([view(a, null), view(b, null), view(a, a), view(a, b)]).size).toBe(4);
  });

  test("the key follows which shared files the shared folder holds", () => {
    const cacheDir = tmp();
    const { a, b } = writeTwoCommits(cacheDir);
    writeSharedSlots(b, {});
    const view = () =>
      assembled(
        assembleLibraryDataView({
          cacheDir,
          libraries: [{ name: "monarch", folderDir: a }],
          shared: b,
        }),
      );

    const before = view();
    writeFileSync(join(b, DEFOLD_EXTENSIONS_FILE), '{"libraries":[]}');
    const after = view();

    expect(after).not.toBe(before);
    expect(existsSync(join(after, DEFOLD_EXTENSIONS_FILE))).toBe(true);
  });

  test("the key follows the library's name", () => {
    const cacheDir = tmp();
    const { a } = writeTwoCommits(cacheDir);
    const view = (name: string) =>
      assembled(
        assembleLibraryDataView({ cacheDir, libraries: [{ name, folderDir: a }], shared: null }),
      );

    expect(view("monarch")).not.toBe(view("druid"));
  });

  test("the key does not depend on where the cache sits", () => {
    const key = () => {
      const cacheDir = tmp();
      const { a } = writeTwoCommits(cacheDir);
      const view = assembled(
        assembleLibraryDataView({
          cacheDir,
          libraries: [{ name: "monarch", folderDir: a }],
          shared: null,
        }),
      );
      return view.slice(cacheDir.length);
    };

    expect(key()).toBe(key());
  });

  test("a view folder that appears during the copy is used, and the stage goes", () => {
    const cacheDir = tmp();
    const { a } = writeTwoCommits(cacheDir);
    const options = {
      cacheDir,
      libraries: [{ name: "monarch", folderDir: a }],
      shared: null,
    };
    const view = assembled(assembleLibraryDataView(options));
    rmSync(view, { recursive: true });
    const racer = join(view, "racer");

    const result = assembleLibraryDataView({
      ...options,
      copy: (from, to) => {
        mkdirSync(view, { recursive: true });
        writeFileSync(racer, "first");
        cpSync(from, to, { recursive: true });
      },
    });

    expect(result).toEqual({ dir: view, missing: [] });
    expect(readdirSync(view)).toEqual(["racer"]);
    expect(readdirSync(dirname(view))).toEqual([view.slice(dirname(view).length + 1)]);
  });

  test("a copy that fails leaves no stage folder behind", () => {
    const cacheDir = tmp();
    const { a } = writeTwoCommits(cacheDir);

    expect(() =>
      assembleLibraryDataView({
        cacheDir,
        libraries: [{ name: "monarch", folderDir: a }],
        shared: null,
        copy: () => {
          throw new Error("disk full");
        },
      }),
    ).toThrow("disk full");

    expect(readdirSync(join(cacheDir, "views"))).toEqual([]);
  });

  test("two libraries naming one module across their commits fail the loader's check", () => {
    const cacheDir = tmp();
    const a = folderAt(cacheDir, COMMIT_A);
    const b = folderAt(cacheDir, COMMIT_B);
    writeLibrary(a, "monarch", "taken.core", "declare module 'taken.core' {}\n");
    writeLibrary(b, "druid", "taken.core", "declare module 'taken.core' {}\n");

    const view = assembled(
      assembleLibraryDataView({
        cacheDir,
        libraries: [
          { name: "monarch", folderDir: a },
          { name: "druid", folderDir: b },
        ],
        shared: null,
      }),
    );

    expect(() => readLibraryData(view)).toThrow(LibraryDataError);
  });
});
