import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "@defold-typescript/types/cli-runtime";
import { writeZipArchive } from "../../../types/test/zip-fixture";
import type { DownloadExtensionArchive } from "../extension-archive";
import { readLibraryData, readLibraryReviews } from "./library-data";
import { archiveFingerprint } from "./library-fingerprint";
import { reviewLibraries } from "./library-review";

const COMMIT_A = "0123456789abcdef0123456789abcdef01234567";
const COMMIT_B = "89abcdef0123456789abcdef0123456789abcdef";
const FIRST_URL = "https://github.com/owner/first/archive/1.0.0.zip";
const SECOND_URL = `https://github.com/owner/second/archive/${COMMIT_B}.zip`;

const moduleOf = (body: string): string =>
  `---@class first.options\nlocal M = {}\nfunction M.start() ${body} end\nreturn M\n`;

function archiveOf(lua: string, comment?: string): Uint8Array {
  return writeZipArchive(
    [
      { name: "repo-ref/game.project", text: "[library]\ninclude_dirs = mylib\n" },
      { name: "repo-ref/mylib/mylib.lua", text: lua },
    ],
    comment === undefined ? {} : { comment },
  );
}

describe("reviewLibraries", () => {
  let base: string;
  let dataDir: string;
  let cacheDir: string;
  let requested: string[];

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "library-review-"));
    dataDir = join(base, "data");
    cacheDir = join(base, "cache");
    requested = [];
    mkdirSync(dataDir);
    writeLibrary("github.com/owner/first", "https://github.com/owner/first", "1.0.0");
    writeLibrary("github.com/owner/second", "https://github.com/owner/second", COMMIT_B);
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  function writeLibrary(folder: string, repo: string, ref: string): void {
    mkdirSync(join(dataDir, folder), { recursive: true });
    writeFileSync(join(dataDir, folder, "library.json"), JSON.stringify({ repo }));
    writeFileSync(join(dataDir, folder, "reviewed.json"), JSON.stringify({ ref }));
  }

  const reviewedText = (folder: string): string =>
    readFileSync(join(dataDir, folder, "reviewed.json"), "utf8");

  function serving(archives: Readonly<Record<string, Uint8Array>>): DownloadExtensionArchive {
    return async (url) => {
      requested.push(url);
      const bytes = archives[url];
      if (bytes === undefined) throw new Error(`HTTP 404 for ${url}`);
      return { status: "ok", bytes };
    };
  }

  function fingerprintOf(bytes: Uint8Array) {
    const zipPath = join(base, "fingerprint.zip");
    writeFileSync(zipPath, bytes);
    return archiveFingerprint(readZip(zipPath));
  }

  const review = (archives: Readonly<Record<string, Uint8Array>>, names: readonly string[] = []) =>
    reviewLibraries(dataDir, names, { cacheDir, download: serving(archives) });

  const BOTH = {
    [FIRST_URL]: archiveOf(moduleOf("one"), COMMIT_A),
    [SECOND_URL]: archiveOf(moduleOf("two"), COMMIT_B),
  };

  test("fetches each library's pinned archive and records its review", async () => {
    const result = await review(BOTH);

    expect(requested.sort()).toEqual([FIRST_URL, SECOND_URL].sort());
    expect(result).toEqual({
      reviewed: [
        { library: "github.com/owner/first", commit: COMMIT_A, added: true },
        { library: "github.com/owner/second", commit: COMMIT_B, added: true },
      ],
      failed: [],
    });
    expect(JSON.parse(reviewedText("github.com/owner/first"))).toEqual({
      ref: "1.0.0",
      reviews: [{ ...fingerprintOf(BOTH[FIRST_URL] as Uint8Array), commits: [COMMIT_A] }],
    });
    expect(readLibraryReviews(dataDir, "github.com/owner/second")).toEqual([
      { ...fingerprintOf(BOTH[SECOND_URL] as Uint8Array), commits: [COMMIT_B] },
    ]);
    expect(readLibraryData(dataDir).map(({ ref }) => ref)).toEqual(["1.0.0", COMMIT_B]);
  });

  test("a second run changes no bytes and reports nothing added", async () => {
    await review(BOTH);
    const first = reviewedText("github.com/owner/first");
    const second = reviewedText("github.com/owner/second");

    const result = await review(BOTH);

    expect(reviewedText("github.com/owner/first")).toBe(first);
    expect(reviewedText("github.com/owner/second")).toBe(second);
    expect(result.reviewed.map(({ added }) => added)).toEqual([false, false]);
  });

  test("changed archive contents keep the ref and the earlier review", async () => {
    await review(BOTH);
    const earlier = readLibraryReviews(dataDir, "github.com/owner/first") ?? [];
    const moved = archiveOf(moduleOf("three"), COMMIT_B);

    await review({ ...BOTH, [FIRST_URL]: moved }, ["owner/first"]);

    expect(JSON.parse(reviewedText("github.com/owner/first"))).toEqual({
      ref: "1.0.0",
      reviews: [...earlier, { ...fingerprintOf(moved), commits: [COMMIT_B] }],
    });
  });

  test("an archive with no commit records its hashes under no commit", async () => {
    const bytes = archiveOf(moduleOf("one"));

    const result = await review({ [FIRST_URL]: bytes }, ["owner/first"]);

    expect(result.reviewed).toEqual([
      { library: "github.com/owner/first", commit: null, added: true },
    ]);
    expect(readLibraryReviews(dataDir, "github.com/owner/first")).toEqual([
      { ...fingerprintOf(bytes), commits: [] },
    ]);
  });

  test("a named library is the only one touched", async () => {
    const untouched = reviewedText("github.com/owner/second");

    const result = await review(BOTH, ["owner/first"]);

    expect(requested).toEqual([FIRST_URL]);
    expect(result.reviewed.map(({ library }) => library)).toEqual(["github.com/owner/first"]);
    expect(reviewedText("github.com/owner/second")).toBe(untouched);
  });

  test("a typed name selects the library whose name ends in it", async () => {
    const result = await review(BOTH, ["first"]);

    expect(requested).toEqual([FIRST_URL]);
    expect(result.reviewed.map(({ library }) => library)).toEqual(["github.com/owner/first"]);
  });

  test("a typed name two hosts' libraries end in fails before any download, naming both", async () => {
    writeLibrary("codeberg.org/owner/first", "https://codeberg.org/owner/first", "1.0.0");

    await expect(review(BOTH, ["first"])).rejects.toThrow(
      "first names more than one library: codeberg.org/owner/first, github.com/owner/first",
    );
    expect(requested).toEqual([]);
  });

  test("a name no library ends in fails, naming it", async () => {
    await expect(review(BOTH, ["nolib"])).rejects.toThrow(`no library nolib in ${dataDir}`);
  });

  test("an unknown name fails before any download, naming it", async () => {
    await expect(review(BOTH, ["owner/first", "nope"])).rejects.toThrow("nope");

    expect(requested).toEqual([]);
    expect(readLibraryReviews(dataDir, "github.com/owner/first")).toBeNull();
  });

  test("a failed download is reported by name and the other libraries are written", async () => {
    const untouched = reviewedText("github.com/owner/first");

    const result = await review({ [SECOND_URL]: BOTH[SECOND_URL] as Uint8Array });

    expect(result.reviewed).toEqual([
      { library: "github.com/owner/second", commit: COMMIT_B, added: true },
    ]);
    expect(result.failed).toEqual([
      { library: "github.com/owner/first", message: expect.stringContaining("HTTP 404") },
    ]);
    expect(reviewedText("github.com/owner/first")).toBe(untouched);
    expect(readLibraryReviews(dataDir, "github.com/owner/second")).toHaveLength(1);
  });

  describe("with the archive already cached and the record restored", () => {
    const FIRST_RECORD = JSON.stringify({ ref: "1.0.0" });
    const restoreFirst = (): void =>
      writeFileSync(join(dataDir, "github.com/owner/first", "reviewed.json"), FIRST_RECORD);

    test("a failed download fails that library, records nothing and runs the others", async () => {
      await review(BOTH, ["owner/first"]);
      restoreFirst();
      const download: DownloadExtensionArchive = async (url) => {
        if (url === FIRST_URL) throw new Error("HTTP 503");
        return { status: "ok", bytes: BOTH[SECOND_URL] as Uint8Array };
      };

      const result = await reviewLibraries(dataDir, [], { cacheDir, download });

      expect(result.failed).toEqual([{ library: "github.com/owner/first", message: "HTTP 503" }]);
      expect(reviewedText("github.com/owner/first")).toBe(FIRST_RECORD);
      expect(result.reviewed).toEqual([
        { library: "github.com/owner/second", commit: COMMIT_B, added: true },
      ]);
      expect(readLibraryReviews(dataDir, "github.com/owner/second")).toHaveLength(1);
    });

    test("an answer of not modified reviews the cached bytes", async () => {
      const bytes = BOTH[FIRST_URL] as Uint8Array;
      const download: DownloadExtensionArchive = async (_url, etag) =>
        etag === "v1" ? { status: "not-modified" } : { status: "ok", bytes, etag: "v1" };
      const run = () => reviewLibraries(dataDir, ["owner/first"], { cacheDir, download });
      await run();
      restoreFirst();

      const restored = await run();
      expect(restored.reviewed).toEqual([
        { library: "github.com/owner/first", commit: COMMIT_A, added: true },
      ]);
      expect(restored.failed).toEqual([]);
      const recorded = reviewedText("github.com/owner/first");
      expect(JSON.parse(recorded).reviews).toEqual([
        { ...fingerprintOf(bytes), commits: [COMMIT_A] },
      ]);

      const repeat = await run();
      expect(repeat.reviewed).toEqual([
        { library: "github.com/owner/first", commit: COMMIT_A, added: false },
      ]);
      expect(repeat.failed).toEqual([]);
      expect(reviewedText("github.com/owner/first")).toBe(recorded);
    });
  });

  test("a folder without library.json is skipped", async () => {
    mkdirSync(join(dataDir, "not-a-library"));

    const result = await review(BOTH);

    expect(result.reviewed.map(({ library }) => library)).toEqual([
      "github.com/owner/first",
      "github.com/owner/second",
    ]);
    expect(result.failed).toEqual([]);
  });
});
