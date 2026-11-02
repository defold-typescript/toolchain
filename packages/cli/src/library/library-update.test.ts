import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeZipArchive } from "../../../types/test/zip-fixture";
import type { DownloadExtensionArchive } from "../extension-archive";
import { LibraryDataError, readLibraryData, readLibraryReviews } from "./library-data";
import { reviewLibraries } from "./library-review";
import { type UpdateForge, updateLibraries } from "./library-update";

const PIN_COMMIT = "a".repeat(40);
const NEW_COMMIT = "b".repeat(40);
const LATER_COMMIT = "c".repeat(40);
const ARCHIVE_COMMIT = "f".repeat(40);

const moduleOf = (params: string): string =>
  `---@class mylib.options\nlocal M = {}\nfunction M.start(${params}) end\nreturn M\n`;

function archiveOf(lua: string, comment?: string): Uint8Array {
  return writeZipArchive(
    [
      { name: "repo-ref/game.project", text: "[library]\ninclude_dirs = mylib\n" },
      { name: "repo-ref/mylib/mylib.lua", text: lua },
    ],
    comment === undefined ? {} : { comment },
  );
}

const SAME = moduleOf("a");
const CHANGED = moduleOf("a, b");

interface Upstream {
  readonly tags?: ReadonlyArray<{ name: string; sha: string; date: string }>;
  readonly head?: string;
}

describe("updateLibraries", () => {
  let base: string;
  let dataDir: string;
  let cacheDir: string;
  let downloaded: string[];
  let forgeReads: string[];

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), "library-update-"));
    dataDir = join(base, "data");
    cacheDir = join(base, "cache");
    downloaded = [];
    forgeReads = [];
    mkdirSync(dataDir);
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  const repoOf = (folder: string): string => `https://github.com/owner/${folder}`;
  const urlOf = (folder: string, ref: string): string => `${repoOf(folder)}/archive/${ref}.zip`;
  const reviewedText = (folder: string): string =>
    readFileSync(join(dataDir, folder, "reviewed.json"), "utf8");

  function serving(archives: Readonly<Record<string, Uint8Array>>): DownloadExtensionArchive {
    return async (url) => {
      downloaded.push(url);
      const bytes = archives[url];
      if (bytes === undefined) throw new Error(`HTTP 404 for ${url}`);
      return { status: "ok", bytes };
    };
  }

  function writeLibrary(folder: string, ref: string, follows?: string): void {
    mkdirSync(join(dataDir, folder));
    writeFileSync(
      join(dataDir, folder, "library.json"),
      JSON.stringify({ repo: repoOf(folder), ...(follows === undefined ? {} : { follows }) }),
    );
    writeFileSync(join(dataDir, folder, "reviewed.json"), JSON.stringify({ ref }));
  }

  // The pin's review comes from production, so no test authors a hash.
  async function pinLibrary(folder: string, ref: string, follows?: string): Promise<void> {
    writeLibrary(folder, ref, follows);
    const result = await reviewLibraries(dataDir, [folder], {
      cacheDir,
      download: serving({ [urlOf(folder, ref)]: archiveOf(SAME, PIN_COMMIT) }),
    });
    expect(result.failed).toEqual([]);
    downloaded = [];
  }

  function forgeOf(upstream: Readonly<Record<string, Upstream>>): (repo: string) => UpdateForge {
    const of = (repo: string): Upstream => {
      const found = upstream[repo];
      if (found === undefined) throw new Error(`GET ${repo} responded 404`);
      return found;
    };
    return () => ({
      listTags: async (repo) => {
        forgeReads.push(`tags ${repo}`);
        return (of(repo).tags ?? []).map(({ name, sha }) => ({ name, sha }));
      },
      readCommit: async (repo, sha) => {
        forgeReads.push(`commit ${sha}`);
        const tag = (of(repo).tags ?? []).find((candidate) => candidate.sha === sha);
        if (tag === undefined) throw new Error(`no commit ${sha}`);
        return { sha, date: tag.date };
      },
      readRepo: async (repo) => {
        forgeReads.push(`repo ${repo}`);
        of(repo);
        return { defaultBranch: "main" };
      },
      headCommit: async (repo, branch) => {
        forgeReads.push(`head ${branch}`);
        const { head } = of(repo);
        if (head === undefined) throw new Error(`no branch ${branch}`);
        return head;
      },
    });
  }

  const update = (
    upstream: Readonly<Record<string, Upstream>>,
    archives: Readonly<Record<string, Uint8Array>> = {},
    names: readonly string[] = [],
  ) =>
    updateLibraries(dataDir, names, {
      cacheDir,
      download: serving(archives),
      forge: forgeOf(upstream),
    });

  const PIN_TAG = { name: "v1", sha: PIN_COMMIT, date: "2026-01-01T00:00:00Z" };
  const NEW_TAG = { name: "v2", sha: NEW_COMMIT, date: "2026-02-01T00:00:00Z" };
  const LATER_TAG = { name: "v3", sha: LATER_COMMIT, date: "2026-03-01T00:00:00Z" };

  describe("a tag-pinned library", () => {
    beforeEach(() => pinLibrary("tagged", "v1"));

    const upstream = { [repoOf("tagged")]: { tags: [PIN_TAG, NEW_TAG] } };

    test("a newer tag with reviewed hashes adds the forge's commit and keeps the ref", async () => {
      const result = await update(upstream, {
        [urlOf("tagged", "v2")]: archiveOf(SAME, ARCHIVE_COMMIT),
      });

      expect(result).toEqual({
        updated: [{ library: "tagged", status: "recorded", recorded: [NEW_COMMIT], differs: [] }],
        failed: [],
      });
      expect(readLibraryReviews(dataDir, "tagged")?.map(({ commits }) => commits)).toEqual([
        [PIN_COMMIT, NEW_COMMIT],
      ]);
      expect(readLibraryData(dataDir).map(({ ref }) => ref)).toEqual(["v1"]);
    });

    test("a second run downloads nothing and writes nothing", async () => {
      const archives = { [urlOf("tagged", "v2")]: archiveOf(SAME) };
      await update(upstream, archives);
      const recorded = reviewedText("tagged");
      downloaded = [];

      const result = await update(upstream, archives);

      expect(downloaded).toEqual([]);
      expect(reviewedText("tagged")).toBe(recorded);
      expect(result.updated).toEqual([
        { library: "tagged", status: "current", recorded: [], differs: [] },
      ]);
    });

    test("a newer tag with a changed member reads differs and writes nothing", async () => {
      const before = reviewedText("tagged");

      const result = await update(upstream, { [urlOf("tagged", "v2")]: archiveOf(CHANGED) });

      expect(result.updated).toEqual([
        { library: "tagged", status: "differs", recorded: [], differs: [NEW_COMMIT] },
      ]);
      expect(reviewedText("tagged")).toBe(before);
    });

    test("a change only to a function body differs, since its source hash moved", async () => {
      const bodyEdit = SAME.replace(") end", ") return 1 end");

      const result = await update(upstream, { [urlOf("tagged", "v2")]: archiveOf(bodyEdit) });

      expect(result.updated[0]?.differs).toEqual([NEW_COMMIT]);
    });

    test("candidates are walked oldest first, listing what recorded and what differs", async () => {
      const result = await update(
        { [repoOf("tagged")]: { tags: [LATER_TAG, PIN_TAG, NEW_TAG] } },
        {
          [urlOf("tagged", "v2")]: archiveOf(SAME),
          [urlOf("tagged", "v3")]: archiveOf(CHANGED),
        },
      );

      expect(downloaded).toEqual([urlOf("tagged", "v2"), urlOf("tagged", "v3")]);
      expect(result.updated).toEqual([
        { library: "tagged", status: "differs", recorded: [NEW_COMMIT], differs: [LATER_COMMIT] },
      ]);
      expect(readLibraryReviews(dataDir, "tagged")?.map(({ commits }) => commits)).toEqual([
        [PIN_COMMIT, NEW_COMMIT],
      ]);
    });

    test("tags from another series or dated before the pin are not candidates", async () => {
      const result = await update({
        [repoOf("tagged")]: {
          tags: [
            PIN_TAG,
            { name: "editor.9", sha: NEW_COMMIT, date: "2026-02-01T00:00:00Z" },
            { name: "v0", sha: LATER_COMMIT, date: "2025-01-01T00:00:00Z" },
          ],
        },
      });

      expect(downloaded).toEqual([]);
      expect(result.updated).toEqual([
        { library: "tagged", status: "current", recorded: [], differs: [] },
      ]);
    });

    test("two tags on one commit are one candidate", async () => {
      const result = await update(
        {
          [repoOf("tagged")]: {
            tags: [PIN_TAG, NEW_TAG, { ...NEW_TAG, name: "v2.0" }],
          },
        },
        {
          [urlOf("tagged", "v2")]: archiveOf(CHANGED),
          [urlOf("tagged", "v2.0")]: archiveOf(CHANGED),
        },
      );

      expect(downloaded).toHaveLength(1);
      expect(result.updated[0]?.differs).toEqual([NEW_COMMIT]);
    });

    test("a pinned tag upstream no longer lists fails the library", async () => {
      const result = await update({ [repoOf("tagged")]: { tags: [NEW_TAG] } });

      expect(result.updated).toEqual([]);
      expect(result.failed).toEqual([
        { library: "tagged", message: expect.stringContaining("v1") },
      ]);
      expect(downloaded).toEqual([]);
    });

    test("a failed download after a match writes nothing for the library", async () => {
      const before = reviewedText("tagged");

      const result = await update(
        { [repoOf("tagged")]: { tags: [PIN_TAG, NEW_TAG, LATER_TAG] } },
        { [urlOf("tagged", "v2")]: archiveOf(SAME) },
      );

      expect(result.updated).toEqual([]);
      expect(result.failed).toEqual([
        { library: "tagged", message: expect.stringContaining("HTTP 404") },
      ]);
      expect(reviewedText("tagged")).toBe(before);
    });

    test("a failed download fails the library even with a cached copy", async () => {
      await update(upstream, { [urlOf("tagged", "v2")]: archiveOf(CHANGED) });

      const result = await update(upstream, {});

      expect(result.failed).toEqual([
        { library: "tagged", message: expect.stringContaining("HTTP 404") },
      ]);
    });
  });

  describe("what a library follows", () => {
    test("a commit pin with no follows takes its default branch's head as the candidate", async () => {
      await pinLibrary("branched", PIN_COMMIT);

      const result = await update(
        { [repoOf("branched")]: { head: NEW_COMMIT } },
        { [urlOf("branched", NEW_COMMIT)]: archiveOf(SAME) },
      );

      expect(forgeReads).toEqual([`repo ${repoOf("branched")}`, "head main"]);
      expect(result.updated).toEqual([
        { library: "branched", status: "recorded", recorded: [NEW_COMMIT], differs: [] },
      ]);
      expect(readLibraryData(dataDir).map(({ ref }) => ref)).toEqual([PIN_COMMIT]);
    });

    test("a branch head that is the pin is current, reviewed or not", async () => {
      writeLibrary("branched", PIN_COMMIT);

      const result = await update({ [repoOf("branched")]: { head: PIN_COMMIT } });

      expect(downloaded).toEqual([]);
      expect(result.updated).toEqual([
        { library: "branched", status: "current", recorded: [], differs: [] },
      ]);
    });

    test("follows none is held, with no request", async () => {
      await pinLibrary("held", "v1", "none");

      const result = await update({});

      expect(forgeReads).toEqual([]);
      expect(downloaded).toEqual([]);
      expect(result).toEqual({
        updated: [{ library: "held", status: "held", recorded: [], differs: [] }],
        failed: [],
      });
    });

    test("an explicit follows wins over what the ref would default to", async () => {
      await pinLibrary("branched", "v1", "branch");

      const result = await update(
        { [repoOf("branched")]: { head: NEW_COMMIT } },
        { [urlOf("branched", NEW_COMMIT)]: archiveOf(SAME) },
      );

      expect(forgeReads).toEqual([`repo ${repoOf("branched")}`, "head main"]);
      expect(result.updated[0]?.recorded).toEqual([NEW_COMMIT]);
    });

    test("a follows outside the set throws naming the file", () => {
      writeLibrary("odd", "v1", "sometimes");

      expect(() => readLibraryData(dataDir)).toThrow(LibraryDataError);
      expect(() => readLibraryData(dataDir)).toThrow("odd/library.json");
    });

    test("follows reads its default from the ref, and an explicit value as written", () => {
      writeLibrary("explicit", PIN_COMMIT, "tags");
      writeLibrary("sha", PIN_COMMIT);
      writeLibrary("tag", "v1");

      expect(readLibraryData(dataDir).map(({ dir, follows }) => [dir, follows])).toEqual([
        ["explicit", "tags"],
        ["sha", "branch"],
        ["tag", "tags"],
      ]);
    });
  });

  describe("across libraries", () => {
    test("a forge failure is reported by name and the next library is still updated", async () => {
      await pinLibrary("first", "v1");
      await pinLibrary("second", "v1");
      const firstBefore = reviewedText("first");

      const result = await update(
        { [repoOf("second")]: { tags: [PIN_TAG, NEW_TAG] } },
        { [urlOf("second", "v2")]: archiveOf(SAME) },
      );

      expect(result.failed).toEqual([
        { library: "first", message: expect.stringContaining("404") },
      ]);
      expect(result.updated).toEqual([
        { library: "second", status: "recorded", recorded: [NEW_COMMIT], differs: [] },
      ]);
      expect(reviewedText("first")).toBe(firstBefore);
    });

    test("a named library is the only one read", async () => {
      await pinLibrary("first", "v1", "none");
      await pinLibrary("second", "v1", "none");

      const result = await update({}, {}, ["second"]);

      expect(result.updated.map(({ library }) => library)).toEqual(["second"]);
    });

    test("an unknown name throws before any request", async () => {
      await pinLibrary("first", "v1");

      await expect(update({}, {}, ["nope"])).rejects.toThrow("nope");

      expect(forgeReads).toEqual([]);
      expect(downloaded).toEqual([]);
    });
  });
});
