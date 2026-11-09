import { describe, expect, test } from "bun:test";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { writeZipArchive } from "../../types/test/zip-fixture";
import type { DownloadExtensionArchive } from "./extension-archive";
import {
  DEFOLD_EXTENSIONS_FILE,
  EXTENSION_INDEX_SLOTS_FILE,
  readLibraryData,
} from "./library/library-data";
import { fetchNewestLibraryData, libraryDataCommitUrl } from "./library-data-archive";
import { writeLibraryTargets } from "./library-data-fixture";
import { frozenLibraryData, selectLibraryPins } from "./library-data-pins";
import type { LibraryDataPins } from "./project-lock";

const MAIN_URL = "https://example.test/library-data/archive/refs/heads/main.zip";
const CLI = "0.55.0";
const ONE = "1".repeat(40);
const TWO = "2".repeat(40);
const THREE = "3".repeat(40);

const urlOf = (name: string) => `https://github.com/owner/${name}/archive/main.zip`;
const MONARCH = urlOf("monarch");
const DRUID = urlOf("druid");

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "library-data-pins-"));
}

// A library's declaration, or that and the module it names when two must clash.
type Library = string | { readonly text: string; readonly moduleId: string };

interface DataOptions {
  readonly slots?: string;
  readonly folder?: string;
  // Written over what `libraries` produces, by path below the version folder.
  readonly files?: Readonly<Record<string, string>>;
}

function writeData(
  libraries: Readonly<Record<string, Library>>,
  slots?: string,
  files: Readonly<Record<string, string>> = {},
): string {
  const root = tmp();
  writeLibraryTargets(root, {
    forks: Object.entries(libraries).map(([name, library]) => {
      const { text, moduleId } =
        typeof library === "string"
          ? { text: library, moduleId: `${name.split("/").pop()}.core` }
          : library;
      mkdirSync(join(root, name, "fork"), { recursive: true });
      writeFileSync(join(root, name, "fork", "library.d.ts"), text);
      return {
        repo: `https://github.com/${name}`,
        ref: "1.0.0",
        authored: "fork/library.d.ts",
        moduleId,
        namespace: moduleId,
        apiDoc: `api-doc/${moduleId}.json`,
        upstreamLua: [`source/upstream/${moduleId}.lua`],
      };
    }),
  });
  if (slots !== undefined) {
    writeFileSync(join(root, EXTENSION_INDEX_SLOTS_FILE), slots);
  }
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

// The data repo at one commit, packed the way GitHub packs it.
function dataAt(
  commit: string,
  libraries: Readonly<Record<string, Library>>,
  { slots, folder = "0.55.0", files: overrides }: DataOptions = {},
): Uint8Array {
  const root = writeData(libraries, slots, overrides);
  const files = (readdirSync(root, { recursive: true }) as string[]).filter((path) =>
    statSync(join(root, path)).isFile(),
  );
  return writeZipArchive(
    files.map((path) => ({
      name: `library-data-${commit}/data/${folder}/${path.replace(/\\/g, "/")}`,
      text: readFileSync(join(root, path), "utf8"),
    })),
    { comment: commit },
  );
}

// `commits` answers a commit's own URL; anything else, or a null main, fails the way
// a dropped connection does.
function serving(
  main: Uint8Array | null,
  commits: Readonly<Record<string, Uint8Array>> = {},
): { download: DownloadExtensionArchive; requests: string[] } {
  const requests: string[] = [];
  const byUrl = new Map(
    Object.entries(commits).map(([commit, bytes]) => [
      libraryDataCommitUrl(commit, MAIN_URL),
      bytes,
    ]),
  );
  if (main !== null) {
    byUrl.set(MAIN_URL, main);
  }
  return {
    requests,
    download: async (url) => {
      requests.push(url);
      const bytes = byUrl.get(url);
      if (bytes === undefined) {
        throw new Error("network down");
      }
      return { status: "ok", bytes };
    },
  };
}

interface Run {
  readonly cacheDir?: string;
  readonly urls?: readonly string[];
  readonly knownUrls?: readonly string[];
  readonly pins?: LibraryDataPins | null;
  readonly update?: true | readonly string[];
}

function select(download: DownloadExtensionArchive, run: Run = {}) {
  return selectLibraryPins({
    mainUrl: MAIN_URL,
    cacheDir: run.cacheDir ?? tmp(),
    cliVersion: CLI,
    urls: run.urls ?? [MONARCH],
    knownUrls: run.knownUrls ?? run.urls ?? [MONARCH],
    pins: run.pins ?? null,
    ...(run.update === undefined ? {} : { update: run.update }),
    download,
  });
}

const pinsAt = (commit: string, libraries: Readonly<Record<string, string>>): LibraryDataPins => ({
  shared: commit,
  libraries,
});

const printedIn = (dir: string | null, name: string) =>
  readFileSync(join(dir as string, name, "fork", "library.d.ts"), "utf8");

// Main's archive cached under `cacheDir`, so a failing request serves it stale.
async function cacheMain(cacheDir: string, bytes: Uint8Array): Promise<void> {
  await fetchNewestLibraryData({
    mainUrl: MAIN_URL,
    cacheDir,
    cliVersion: CLI,
    download: serving(bytes).download,
  });
}

describe("a dependency with no pin", () => {
  test("a new URL main covers pins at main, silently", async () => {
    const { dir, pins, notices, warning } = await select(
      serving(dataAt(TWO, { "owner/monarch": "two" })).download,
      { pins: pinsAt(TWO, {}), knownUrls: [] },
    );

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO }));
    expect(notices).toEqual([]);
    expect(warning).toBeUndefined();
    expect(printedIn(dir, "owner/monarch")).toBe("two");
  });

  test("a URL already in the lock that main now covers pins at main with a notice", async () => {
    const { pins, notices } = await select(
      serving(dataAt(TWO, { "owner/monarch": "two" })).download,
      {
        pins: pinsAt(TWO, {}),
        knownUrls: [MONARCH],
      },
    );

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO }));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("monarch");
    expect(notices[0]).toContain(TWO);
  });

  test("main not covering it records nothing and says nothing", async () => {
    const { pins, notices, warning } = await select(
      serving(dataAt(TWO, { "owner/druid": "two" })).download,
      { pins: pinsAt(TWO, {}), knownUrls: [] },
    );

    expect(pins).toEqual(pinsAt(TWO, {}));
    expect(notices).toEqual([]);
    expect(warning).toBeUndefined();
  });

  test("an unavailable main leaves a URL already in the lock with nothing, silently", async () => {
    const { dir, pins, notices, warning } = await select(serving(null).download);

    expect(dir).toBeNull();
    expect(pins).toBeNull();
    expect(notices).toEqual([]);
    expect(warning).toBeUndefined();
  });

  test("an unavailable main warns about a new URL", async () => {
    const { dir, pins, warning } = await select(serving(null).download, { knownUrls: [] });

    expect(dir).toBeNull();
    expect(pins).toBeNull();
    expect(warning).toContain(MAIN_URL);
  });

  test("a stale main records with its warning on a first run", async () => {
    const cacheDir = tmp();
    await cacheMain(cacheDir, dataAt(TWO, { "owner/monarch": "two" }));

    const { dir, pins, warning } = await select(serving(null).download, { cacheDir });

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO }));
    expect(printedIn(dir, "owner/monarch")).toBe("two");
    expect(warning).toContain(MAIN_URL);
  });
});

describe("a pinned library with a fresh main", () => {
  const SAME = { [TWO]: dataAt(TWO, { "owner/monarch": "same" }) };

  test.each<[string, true | undefined]>([
    ["plain", undefined],
    ["--update", true],
  ])("the same folder bytes hold silently: %s", async (_label, update) => {
    const { dir, pins, notices } = await select(
      serving(dataAt(THREE, { "owner/monarch": "same" }), SAME).download,
      { pins: pinsAt(TWO, { "owner/monarch": TWO }), ...(update === undefined ? {} : { update }) },
    );

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO }));
    expect(notices).toEqual([]);
    expect(printedIn(dir, "owner/monarch")).toBe("same");
  });

  test("a changed folder holds, with one notice naming every such library", async () => {
    const { dir, pins, notices } = await select(
      serving(dataAt(THREE, { "owner/monarch": "newer", "owner/druid": "newer" }), {
        [TWO]: dataAt(TWO, { "owner/monarch": "two", "owner/druid": "two" }),
      }).download,
      { urls: [MONARCH, DRUID], pins: pinsAt(TWO, { "owner/monarch": TWO, "owner/druid": TWO }) },
    );

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO, "owner/druid": TWO }));
    expect(printedIn(dir, "owner/monarch")).toBe("two");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("monarch");
    expect(notices[0]).toContain("druid");
    expect(notices[0]).toContain("resolve --update");
  });

  test("--update moves a changed folder to main", async () => {
    const { dir, pins, notices } = await select(
      serving(dataAt(THREE, { "owner/monarch": "newer" }), {
        [TWO]: dataAt(TWO, { "owner/monarch": "two" }),
      }).download,
      { pins: pinsAt(TWO, { "owner/monarch": TWO }), update: true },
    );

    expect(pins?.libraries).toEqual({ "owner/monarch": THREE });
    expect(printedIn(dir, "owner/monarch")).toBe("newer");
    expect(notices.join()).toContain("monarch");
    expect(notices.join()).not.toContain("resolve --update");
  });

  describe("a newest commit that differs from the pin", () => {
    const REVIEW = {
      version: 1,
      commits: ["a".repeat(40)],
      api: "api",
      doc: "doc",
      source: "source",
      members: {},
    };
    const reviewedAs = (ref: string, reviews: readonly unknown[]) => ({
      "owner/monarch/reviewed.json": JSON.stringify({ ref, reviews }),
    });
    const PINNED = {
      [TWO]: dataAt(TWO, { "owner/monarch": "same" }, { files: reviewedAs("1.0.0", []) }),
    };
    const pinned = pinsAt(TWO, { "owner/monarch": TWO });
    const newestWith = (files: Readonly<Record<string, string>>) =>
      serving(dataAt(THREE, { "owner/monarch": "same" }, { files }), PINNED).download;

    test("only in reviews, a plain run holds the pin and says nothing", async () => {
      const { pins, notices } = await select(newestWith(reviewedAs("1.0.0", [REVIEW])), {
        pins: pinned,
      });

      expect(pins).toEqual(pinned);
      expect(notices).toEqual([]);
    });

    test("only in reviews, --update moves the pin and names the library", async () => {
      const { pins, notices } = await select(newestWith(reviewedAs("1.0.0", [REVIEW])), {
        pins: pinned,
        update: true,
      });

      expect(pins?.libraries).toEqual({ "owner/monarch": THREE });
      expect(notices.join()).toContain("monarch");
    });

    test("only in reviews, --update of another library holds the pin and says nothing", async () => {
      const { pins, notices } = await select(newestWith(reviewedAs("1.0.0", [REVIEW])), {
        pins: pinned,
        update: ["owner/druid"],
      });

      expect(pins).toEqual(pinned);
      expect(notices).toEqual([]);
    });

    test.each<[string, Readonly<Record<string, string>>]>([
      ["reviews and ref", reviewedAs("2.0.0", [REVIEW])],
      ["a source file", { "owner/monarch/source/upstream/monarch.core.lua": "return {}" }],
    ])("in %s, a plain run holds the pin and names the library", async (_label, files) => {
      const { pins, notices } = await select(newestWith(files), { pins: pinned });

      expect(pins).toEqual(pinned);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toContain("monarch");
      expect(notices[0]).toContain("resolve --update");
    });
  });

  test("main dropping it holds, in the one notice", async () => {
    const { dir, pins, notices } = await select(
      serving(dataAt(THREE, { "owner/other": "x", "owner/druid": "newer" }), {
        [TWO]: dataAt(TWO, { "owner/monarch": "two", "owner/druid": "two" }),
      }).download,
      { urls: [MONARCH, DRUID], pins: pinsAt(TWO, { "owner/monarch": TWO, "owner/druid": TWO }) },
    );

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO, "owner/druid": TWO }));
    expect(printedIn(dir, "owner/monarch")).toBe("two");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("monarch");
    expect(notices[0]).toContain("druid");
  });

  test("main dropping it holds under --update, with a notice", async () => {
    const { pins, notices } = await select(
      serving(dataAt(THREE, { "owner/other": "x" }), {
        [TWO]: dataAt(TWO, { "owner/monarch": "two" }),
      }).download,
      { pins: pinsAt(TWO, { "owner/monarch": TWO }), update: true },
    );

    expect(pins?.libraries).toEqual({ "owner/monarch": TWO });
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("monarch");
    expect(notices[0]).not.toContain("resolve --update");
  });

  test("a different version folder moves to main, naming the folder", async () => {
    const { dir, pins, notices } = await select(
      serving(dataAt(THREE, { "owner/monarch": "same" }), {
        [TWO]: dataAt(TWO, { "owner/monarch": "same" }, { folder: "0.54.0" }),
      }).download,
      { pins: pinsAt(TWO, { "owner/monarch": TWO }) },
    );

    expect(pins?.libraries).toEqual({ "owner/monarch": THREE });
    expect(printedIn(dir, "owner/monarch")).toBe("same");
    expect(notices.join()).toContain("0.55.0");
  });

  test("a different version folder main does not cover drops the pin with a notice", async () => {
    const { pins, notices } = await select(
      serving(dataAt(THREE, { "owner/other": "x" }), {
        [TWO]: dataAt(TWO, { "owner/monarch": "same" }, { folder: "0.54.0" }),
      }).download,
      { pins: pinsAt(TWO, { "owner/monarch": TWO }) },
    );

    expect(pins?.libraries).toEqual({});
    expect(notices.join()).toContain("monarch");
    expect(notices.join()).toContain("0.55.0");
  });

  test.each<[string, Readonly<Record<string, Uint8Array>>]>([
    [
      "no folder for this CLI",
      { [TWO]: dataAt(TWO, { "owner/monarch": "two" }, { folder: "0.99.0" }) },
    ],
    ["no folder for the library", { [TWO]: dataAt(TWO, { "owner/druid": "two" }) }],
    ["a failed fetch", {}],
  ])("a commit with %s moves to main, naming the commit", async (_label, commits) => {
    const { dir, pins, notices } = await select(
      serving(dataAt(THREE, { "owner/monarch": "newer" }), commits).download,
      { pins: pinsAt(THREE, { "owner/monarch": TWO }) },
    );

    expect(pins?.libraries).toEqual({ "owner/monarch": THREE });
    expect(printedIn(dir, "owner/monarch")).toBe("newer");
    expect(notices.join()).toContain(TWO);
  });

  test("an unreadable commit main does not cover drops the pin with a notice", async () => {
    const { pins, notices } = await select(
      serving(dataAt(THREE, { "owner/other": "x" })).download,
      {
        pins: pinsAt(THREE, { "owner/monarch": TWO }),
      },
    );

    expect(pins?.libraries).toEqual({});
    expect(notices.join()).toContain(TWO);
    expect(notices.join()).toContain("monarch");
  });
});

describe("a pinned folder that cannot be hashed", () => {
  test.skipIf(process.platform === "win32")("counts as changed", async () => {
    const cacheDir = tmp();
    const pinned = pinsAt(TWO, { "owner/monarch": TWO });
    const commits = { [TWO]: dataAt(TWO, { "owner/monarch": "same" }) };
    const main = dataAt(THREE, { "owner/monarch": "same" });
    await select(serving(main, commits).download, { cacheDir, pins: pinned });
    symlinkSync(
      join(cacheDir, "absent"),
      join(cacheDir, "commits", TWO, "data", "0.55.0", "owner/monarch", "dangling"),
    );

    const { pins } = await select(serving(main, commits).download, {
      cacheDir,
      pins: pinned,
      update: true,
    });

    expect(pins?.libraries).toEqual({ "owner/monarch": THREE });
  });
});

describe("a pinned library with a stale or unreachable main", () => {
  const AT_TWO = { [TWO]: dataAt(TWO, { "owner/monarch": "two" }) };

  async function staleCache(): Promise<string> {
    const cacheDir = tmp();
    await cacheMain(cacheDir, dataAt(THREE, { "owner/monarch": "newer" }));
    return cacheDir;
  }

  const MAINS: readonly [string, () => Promise<string>][] = [
    ["stale", staleCache],
    ["unreachable", async () => tmp()],
  ];

  test.each(MAINS)("a readable commit holds silently: %s", async (_label, cache) => {
    const { dir, pins, notices, warning } = await select(serving(null, AT_TWO).download, {
      cacheDir: await cache(),
      pins: pinsAt(TWO, { "owner/monarch": TWO }),
    });

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO }));
    expect(printedIn(dir, "owner/monarch")).toBe("two");
    expect(notices).toEqual([]);
    expect(warning).toBeUndefined();
  });

  test.each(MAINS)("--update holds and warns, naming main: %s", async (_label, cache) => {
    const { dir, pins, warning } = await select(serving(null, AT_TWO).download, {
      cacheDir: await cache(),
      pins: pinsAt(TWO, { "owner/monarch": TWO }),
      update: true,
    });

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO }));
    expect(printedIn(dir, "owner/monarch")).toBe("two");
    expect(warning).toContain(MAIN_URL);
  });

  test.each(
    MAINS,
  )("an unreadable commit gives no data and moves nothing: %s", async (_l, cache) => {
    const pinned = pinsAt(TWO, { "owner/monarch": TWO, "owner/druid": ONE });

    const { dir, pins, notices, warning } = await select(serving(null, AT_TWO).download, {
      cacheDir: await cache(),
      urls: [MONARCH, DRUID],
      pins: pinned,
    });

    expect(dir).toBeNull();
    expect(pins).toEqual(pinned);
    expect(notices).toEqual([]);
    expect(warning).toContain(ONE);
  });

  test("an unreadable shared pin gives no data and moves nothing", async () => {
    const pinned = pinsAt(ONE, { "owner/monarch": TWO });

    const { dir, pins, warning } = await select(serving(null, AT_TWO).download, { pins: pinned });

    expect(dir).toBeNull();
    expect(pins).toEqual(pinned);
    expect(warning).toContain(ONE);
  });
});

describe("the pins a run keeps", () => {
  test("update by name moves only that library, leaving the other and the shared pin", async () => {
    const { dir, pins } = await select(
      serving(
        dataAt(THREE, { "owner/monarch": "newer", "owner/druid": "newer" }, { slots: "{}\n" }),
        {
          [TWO]: dataAt(
            TWO,
            { "owner/monarch": "two", "owner/druid": "two" },
            { slots: '{"a":1}\n' },
          ),
        },
      ).download,
      {
        urls: [MONARCH, DRUID],
        pins: pinsAt(TWO, { "owner/monarch": TWO, "owner/druid": TWO }),
        update: ["owner/monarch"],
      },
    );

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": THREE, "owner/druid": TWO }));
    expect(printedIn(dir, "owner/monarch")).toBe("newer");
    expect(printedIn(dir, "owner/druid")).toBe("two");
  });

  test("a library moving keeps the other's folder bytes", async () => {
    const commits = { [TWO]: dataAt(TWO, { "owner/monarch": "two", "owner/druid": "kept" }) };
    const pinned = pinsAt(TWO, { "owner/monarch": TWO, "owner/druid": TWO });
    const urls = [MONARCH, DRUID];

    const held = await select(
      serving(dataAt(TWO, { "owner/monarch": "two", "owner/druid": "kept" })).download,
      {
        urls,
        pins: pinned,
      },
    );
    const moved = await select(
      serving(dataAt(THREE, { "owner/monarch": "newer", "owner/druid": "changed" }), commits)
        .download,
      { urls, pins: pinned, update: ["owner/monarch"] },
    );

    expect(printedIn(moved.dir, "owner/monarch")).toBe("newer");
    expect(printedIn(moved.dir, "owner/druid")).toBe(printedIn(held.dir, "owner/druid"));
  });

  test("a pin for a library no longer declared is pruned, fetching nothing for it", async () => {
    const { download, requests } = serving(dataAt(TWO, { "owner/monarch": "two" }));

    const { dir, pins } = await select(download, {
      pins: pinsAt(TWO, { "owner/monarch": TWO, "owner/druid": ONE }),
    });

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO }));
    expect(requests).toEqual([MAIN_URL]);
    expect(readLibraryData(dir as string).map(({ dir: name }) => name)).toEqual(["owner/monarch"]);
  });

  test("a data merge touching only unused libraries changes no pin", async () => {
    const { pins, notices } = await select(
      serving(dataAt(THREE, { "owner/monarch": "same", "owner/other": "new" }), {
        [TWO]: dataAt(TWO, { "owner/monarch": "same", "owner/other": "old" }),
      }).download,
      { pins: pinsAt(TWO, { "owner/monarch": TWO }) },
    );

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO }));
    expect(notices).toEqual([]);
  });

  test("a first run records each used library and the shared pin at main", async () => {
    const { pins, notices } = await select(
      serving(dataAt(TWO, { "owner/monarch": "two", "owner/druid": "two", "owner/other": "two" }))
        .download,
      { urls: [MONARCH, DRUID], knownUrls: [] },
    );

    expect(pins).toEqual(pinsAt(TWO, { "owner/monarch": TWO, "owner/druid": TWO }));
    expect(notices).toEqual([]);
  });

  test("main and each distinct pinned commit are read once", async () => {
    const { download, requests } = serving(
      dataAt(THREE, { "owner/monarch": "new", "owner/druid": "new" }),
      {
        [TWO]: dataAt(TWO, { "owner/monarch": "two", "owner/druid": "two" }),
      },
    );

    await select(download, {
      urls: [MONARCH, DRUID],
      pins: pinsAt(TWO, { "owner/monarch": TWO, "owner/druid": TWO }),
    });

    expect(requests.sort()).toEqual([libraryDataCommitUrl(TWO, MAIN_URL), MAIN_URL].sort());
  });
});

describe("the shared pin", () => {
  const SLOTS = '{"old":{}}\n';
  const NEWER = '{"new":{}}\n';
  const held = { [TWO]: dataAt(TWO, { "owner/monarch": "same" }, { slots: SLOTS }) };
  const newer = dataAt(THREE, { "owner/monarch": "same" }, { slots: NEWER });
  const slotsIn = (dir: string | null) =>
    readFileSync(join(dir as string, EXTENSION_INDEX_SLOTS_FILE), "utf8");

  test("a plain run never moves it for a change, and says nothing", async () => {
    const { dir, pins, notices } = await select(serving(newer, held).download, {
      pins: pinsAt(TWO, { "owner/monarch": TWO }),
    });

    expect(pins?.shared).toBe(TWO);
    expect(slotsIn(dir)).toBe(SLOTS);
    expect(notices).toEqual([]);
  });

  test("update with no names moves it when the file differs, saying nothing", async () => {
    const { dir, pins, notices } = await select(serving(newer, held).download, {
      pins: pinsAt(TWO, { "owner/monarch": TWO }),
      update: true,
    });

    expect(pins?.shared).toBe(THREE);
    expect(slotsIn(dir)).toBe(NEWER);
    expect(notices).toEqual([]);
  });

  test("update with no names moves it when only the extension page map differs", async () => {
    const pagesAt = (commit: string, pages: string) =>
      dataAt(
        commit,
        { "owner/monarch": "same" },
        { slots: SLOTS, files: { [DEFOLD_EXTENSIONS_FILE]: pages } },
      );
    const { dir, pins } = await select(
      serving(pagesAt(THREE, '{"libraries":["new"]}'), {
        [TWO]: pagesAt(TWO, '{"libraries":["old"]}'),
      }).download,
      { pins: pinsAt(TWO, { "owner/monarch": TWO }), update: true },
    );

    expect(pins?.shared).toBe(THREE);
    expect(readFileSync(join(dir as string, DEFOLD_EXTENSIONS_FILE), "utf8")).toBe(
      '{"libraries":["new"]}',
    );
  });

  test("update with no names holds it when the file is the same", async () => {
    const { pins } = await select(
      serving(dataAt(THREE, { "owner/monarch": "same" }, { slots: SLOTS }), held).download,
      { pins: pinsAt(TWO, { "owner/monarch": TWO }), update: true },
    );

    expect(pins?.shared).toBe(TWO);
  });

  test("update by name leaves it", async () => {
    const { pins } = await select(serving(newer, held).download, {
      pins: pinsAt(TWO, { "owner/monarch": TWO }),
      update: ["owner/monarch"],
    });

    expect(pins?.shared).toBe(TWO);
  });

  test("a version folder change moves it silently", async () => {
    const { pins, notices } = await select(
      serving(newer, {
        [TWO]: dataAt(TWO, { "owner/other": "x" }, { slots: SLOTS, folder: "0.54.0" }),
      }).download,
      { urls: [DRUID], pins: pinsAt(TWO, {}) },
    );

    expect(pins?.shared).toBe(THREE);
    expect(notices).toEqual([]);
  });

  test("an unreadable commit moves it silently", async () => {
    const { pins, notices } = await select(serving(newer).download, {
      urls: [DRUID],
      pins: pinsAt(TWO, {}),
    });

    expect(pins?.shared).toBe(THREE);
    expect(notices).toEqual([]);
  });
});

describe("pins keyed by library name", () => {
  const FORK = "https://github.com/someone/boom/archive/main.zip";

  test("a fork keeps the pin of the library it reads, and a pin keyed by a bare repo drops", async () => {
    const { pins } = await select(
      serving(dataAt(THREE, { "britzl/boom": "newer" }), {
        [TWO]: dataAt(TWO, { "britzl/boom": "two" }),
      }).download,
      { urls: [FORK], pins: pinsAt(TWO, { "britzl/boom": TWO, boom: ONE }) },
    );

    expect(pins?.libraries).toEqual({ "britzl/boom": TWO });
  });
});

describe("pins that do not load together", () => {
  const CLASH = { text: "clash", moduleId: "clash" };
  const commits = {
    [ONE]: dataAt(ONE, { "owner/monarch": CLASH, "owner/druid": "one" }),
    [TWO]: dataAt(TWO, { "owner/monarch": "two", "owner/druid": CLASH }),
  };
  const pinned = pinsAt(ONE, { "owner/monarch": ONE, "owner/druid": TWO });
  const urls = [MONARCH, DRUID];

  test("with a fresh main, every used library and the shared pin move to it", async () => {
    const { dir, pins, notices } = await select(
      serving(dataAt(THREE, { "owner/monarch": "newer", "owner/druid": "newer" }), commits)
        .download,
      { urls, pins: pinned },
    );

    expect(pins).toEqual(pinsAt(THREE, { "owner/monarch": THREE, "owner/druid": THREE }));
    expect(printedIn(dir, "owner/monarch")).toBe("newer");
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("clash");
    expect(notices[0]).toContain(THREE);
  });

  test("with main unreachable, the run has no data and warns", async () => {
    const { dir, pins, notices, warning } = await select(serving(null, commits).download, {
      urls,
      pins: pinned,
    });

    expect(dir).toBeNull();
    expect(pins).toEqual(pinned);
    expect(notices).toEqual([]);
    expect(warning).toContain("clash");
    expect(warning).toContain(MAIN_URL);
  });
});

describe("the folder a run reads", () => {
  const libraries = { "owner/monarch": "one" };
  const sharedAt = (commit: string): LibraryDataPins => ({
    shared: commit,
    libraries: { "owner/monarch": commit },
  });
  const rootOf = (cacheDir: string, commit: string) => join(cacheDir, "commits", commit, "data");

  test("a plain run names the newest commit it read, ahead of an older pin", async () => {
    const cacheDir = tmp();

    const { dataRoot, folder } = await select(
      serving(dataAt(TWO, libraries), { [ONE]: dataAt(ONE, libraries) }).download,
      { cacheDir, pins: sharedAt(ONE) },
    );

    expect(dataRoot).toBe(rootOf(cacheDir, TWO));
    expect(folder).toBe("0.55.0");
  });

  test("with main unreachable it names the shared pin's commit", async () => {
    const cacheDir = tmp();

    const { dataRoot, folder } = await select(
      serving(null, { [ONE]: dataAt(ONE, libraries) }).download,
      { cacheDir, pins: sharedAt(ONE) },
    );

    expect(dataRoot).toBe(rootOf(cacheDir, ONE));
    expect(folder).toBe("0.55.0");
  });

  test("a frozen run names the shared pin's commit and never asks for main", async () => {
    const cacheDir = tmp();
    const { download, requests } = serving(dataAt(TWO, libraries), {
      [ONE]: dataAt(ONE, libraries),
    });

    const { dataRoot, folder } = await frozenLibraryData(
      { mainUrl: MAIN_URL, cacheDir, cliVersion: CLI, download },
      sharedAt(ONE),
      [MONARCH],
    );

    expect(dataRoot).toBe(rootOf(cacheDir, ONE));
    expect(folder).toBe("0.55.0");
    expect(requests).toEqual([libraryDataCommitUrl(ONE, MAIN_URL)]);
  });

  test("a run with nothing to read names no folder", async () => {
    const selection = await select(serving(null).download);

    expect(selection.dir).toBeNull();
    expect(selection.dataRoot).toBeUndefined();
    expect(selection.folder).toBeUndefined();
  });
});
