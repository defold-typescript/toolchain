import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, posix, win32 } from "node:path";
import { writeZipArchive } from "../../../types/test/zip-fixture";
import { type DownloadExtensionArchive, resolveExtensionArchive } from "../extension-archive";
import { dataFolderDigest } from "../library-data-archive";
import { LibraryDataError, readLibraryData, readLibraryReviews } from "./library-data";
import { FINGERPRINT_VERSION } from "./library-fingerprint";
import { reviewLibraries } from "./library-review";
import { reportedLibraryPath, type UpdateForge, updateLibraries } from "./library-update";
import { listTargetFixtures } from "./sync-luals-types";

const PIN_COMMIT = "a".repeat(40);
const NEW_COMMIT = "b".repeat(40);
const LATER_COMMIT = "c".repeat(40);
const ARCHIVE_COMMIT = "f".repeat(40);

const moduleOf = (params: string): string =>
  `---@class mylib.options\nlocal M = {}\nfunction M.start(${params}) end\nreturn M\n`;

function archiveOfFiles(files: Readonly<Record<string, string>>, comment?: string): Uint8Array {
  return writeZipArchive(
    [
      { name: "repo-ref/game.project", text: "[library]\ninclude_dirs = mylib\n" },
      ...Object.entries(files).map(([path, text]) => ({ name: `repo-ref/${path}`, text })),
    ],
    comment === undefined ? {} : { comment },
  );
}

const archiveOf = (lua: string, comment?: string): Uint8Array =>
  archiveOfFiles({ "mylib/mylib.lua": lua }, comment);

const SAME = moduleOf("a");
const TWO_FUNCTIONS = `${SAME.replace("return M\n", "")}function M.stop() end\nreturn M\n`;
const CHANGED = moduleOf("a, b");
const NO_MEMBERS = { added: [], removed: [], changed: [] };

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

  const repoOf = (folder: string): string => `https://github.com/${folder}`;
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
    mkdirSync(join(dataDir, folder), { recursive: true });
    writeFileSync(
      join(dataDir, folder, "library.json"),
      JSON.stringify({ repo: repoOf(folder), ...(follows === undefined ? {} : { follows }) }),
    );
    writeFileSync(join(dataDir, folder, "reviewed.json"), JSON.stringify({ ref }));
  }

  // The pin's review comes from production, so no test authors a hash.
  async function pinLibrary(
    folder: string,
    ref: string,
    follows?: string,
    lua: string = SAME,
  ): Promise<void> {
    writeLibrary(folder, ref, follows);
    const result = await reviewLibraries(dataDir, [folder], {
      cacheDir,
      download: serving({ [urlOf(folder, ref)]: archiveOf(lua, PIN_COMMIT) }),
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
    beforeEach(() => pinLibrary("owner/tagged", "v1"));

    const upstream = { [repoOf("owner/tagged")]: { tags: [PIN_TAG, NEW_TAG] } };

    test("a newer tag with reviewed hashes adds the forge's commit and keeps the ref", async () => {
      const result = await update(upstream, {
        [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(SAME, ARCHIVE_COMMIT),
      });

      expect(result).toEqual({
        updated: [
          {
            library: "owner/tagged",
            status: "recorded",
            recorded: [NEW_COMMIT],
            differs: [],
            written: ["reviewed.json"],
          },
        ],
        failed: [],
      });
      expect(readLibraryReviews(dataDir, "owner/tagged")?.map(({ commits }) => commits)).toEqual([
        [PIN_COMMIT, NEW_COMMIT],
      ]);
      expect(readLibraryData(dataDir).map(({ ref }) => ref)).toEqual(["v1"]);
    });

    test("a second run downloads nothing and writes nothing", async () => {
      const archives = { [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(SAME) };
      await update(upstream, archives);
      const recorded = reviewedText("owner/tagged");
      downloaded = [];

      const result = await update(upstream, archives);

      expect(downloaded).toEqual([]);
      expect(reviewedText("owner/tagged")).toBe(recorded);
      expect(result.updated).toEqual([
        { library: "owner/tagged", status: "current", recorded: [], differs: [], written: [] },
      ]);
    });

    test("a newer tag with a changed member moves the pin and records its review", async () => {
      const result = await update(upstream, {
        [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(CHANGED),
      });

      expect(result.updated).toEqual([
        {
          library: "owner/tagged",
          status: "regenerated",
          recorded: [],
          differs: [NEW_COMMIT],
          written: ["reviewed.json"],
          ref: "v2",
          change: "changed",
          members: { ...NO_MEMBERS, changed: ["mylib/mylib.lua#start"] },
        },
      ]);
      expect(readLibraryData(dataDir).map(({ ref }) => ref)).toEqual(["v2"]);
      expect(readLibraryReviews(dataDir, "owner/tagged")?.map(({ commits }) => commits)).toEqual([
        [PIN_COMMIT],
        [NEW_COMMIT],
      ]);
    });

    test("a change only to a function body differs, since its source hash moved", async () => {
      const bodyEdit = SAME.replace(") end", ") return 1 end");

      const result = await update(upstream, {
        [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(bodyEdit),
      });

      expect(result.updated[0]?.differs).toEqual([NEW_COMMIT]);
      expect(result.updated[0]?.status).toBe("regenerated");
    });

    test("candidates are walked oldest first, listing what recorded and what differs", async () => {
      const result = await update(
        { [repoOf("owner/tagged")]: { tags: [LATER_TAG, PIN_TAG, NEW_TAG] } },
        {
          [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(SAME),
          [urlOf("owner/tagged", LATER_COMMIT)]: archiveOf(CHANGED),
        },
      );

      expect(downloaded).toEqual([
        urlOf("owner/tagged", NEW_COMMIT),
        urlOf("owner/tagged", LATER_COMMIT),
      ]);
      expect(result.updated[0]).toMatchObject({
        status: "regenerated",
        recorded: [NEW_COMMIT],
        differs: [LATER_COMMIT],
        ref: "v3",
      });
      expect(readLibraryReviews(dataDir, "owner/tagged")?.map(({ commits }) => commits)).toEqual([
        [PIN_COMMIT, NEW_COMMIT],
        [LATER_COMMIT],
      ]);
    });

    test("tags from another series or dated before the pin are not candidates", async () => {
      const result = await update({
        [repoOf("owner/tagged")]: {
          tags: [
            PIN_TAG,
            { name: "editor.9", sha: NEW_COMMIT, date: "2026-02-01T00:00:00Z" },
            { name: "v0", sha: LATER_COMMIT, date: "2025-01-01T00:00:00Z" },
          ],
        },
      });

      expect(downloaded).toEqual([]);
      expect(result.updated).toEqual([
        { library: "owner/tagged", status: "current", recorded: [], differs: [], written: [] },
      ]);
    });

    test("two tags on one commit are one candidate", async () => {
      const result = await update(
        {
          [repoOf("owner/tagged")]: {
            tags: [PIN_TAG, NEW_TAG, { ...NEW_TAG, name: "v2.0" }],
          },
        },
        { [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(CHANGED) },
      );

      expect(downloaded).toHaveLength(1);
      expect(result.updated[0]?.differs).toEqual([NEW_COMMIT]);
    });

    test("a tag that serves reviewed bytes does not vouch for a commit that differs", async () => {
      const result = await update(upstream, {
        [urlOf("owner/tagged", "v2")]: archiveOf(SAME),
        [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(CHANGED),
      });

      expect(result.updated[0]).toMatchObject({ status: "regenerated", differs: [NEW_COMMIT] });
      expect(downloaded).toEqual([urlOf("owner/tagged", NEW_COMMIT)]);
    });

    test("a commit archive that names no commit still records the forge's commit", async () => {
      const result = await update(upstream, {
        [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(SAME),
      });

      expect(result.updated).toEqual([
        {
          library: "owner/tagged",
          status: "recorded",
          recorded: [NEW_COMMIT],
          differs: [],
          written: ["reviewed.json"],
        },
      ]);
      expect(readLibraryReviews(dataDir, "owner/tagged")?.map(({ commits }) => commits)).toEqual([
        [PIN_COMMIT, NEW_COMMIT],
      ]);
      expect(readLibraryData(dataDir).map(({ ref }) => ref)).toEqual(["v1"]);
    });

    test("a pinned tag upstream no longer lists fails the library", async () => {
      const result = await update({ [repoOf("owner/tagged")]: { tags: [NEW_TAG] } });

      expect(result.updated).toEqual([]);
      expect(result.failed).toEqual([
        { library: "owner/tagged", message: expect.stringContaining("v1") },
      ]);
      expect(downloaded).toEqual([]);
    });

    test("a failed download after a match writes nothing for the library", async () => {
      const before = reviewedText("owner/tagged");

      const result = await update(
        { [repoOf("owner/tagged")]: { tags: [PIN_TAG, NEW_TAG, LATER_TAG] } },
        { [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(SAME) },
      );

      expect(result.updated).toEqual([]);
      expect(result.failed).toEqual([
        { library: "owner/tagged", message: expect.stringContaining("HTTP 404") },
      ]);
      expect(reviewedText("owner/tagged")).toBe(before);
    });

    test("a failed download fails the library even with a cached copy", async () => {
      await resolveExtensionArchive(
        { index: 0, url: urlOf("owner/tagged", NEW_COMMIT) },
        {
          cacheDir,
          download: serving({ [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(CHANGED) }),
        },
      );

      const result = await update(upstream, {});

      expect(result.failed).toEqual([
        { library: "owner/tagged", message: expect.stringContaining("HTTP 404") },
      ]);
    });
  });

  describe("what a library follows", () => {
    test("a commit pin with no follows takes its default branch's head as the candidate", async () => {
      await pinLibrary("owner/branched", PIN_COMMIT);

      const result = await update(
        { [repoOf("owner/branched")]: { head: NEW_COMMIT } },
        { [urlOf("owner/branched", NEW_COMMIT)]: archiveOf(SAME) },
      );

      expect(forgeReads).toEqual([`repo ${repoOf("owner/branched")}`, "head main"]);
      expect(result.updated).toEqual([
        {
          library: "owner/branched",
          status: "recorded",
          recorded: [NEW_COMMIT],
          differs: [],
          written: ["reviewed.json"],
        },
      ]);
      expect(readLibraryData(dataDir).map(({ ref }) => ref)).toEqual([PIN_COMMIT]);
    });

    test("a branch head that is the pin is current, reviewed or not", async () => {
      writeLibrary("owner/branched", PIN_COMMIT);

      const result = await update({ [repoOf("owner/branched")]: { head: PIN_COMMIT } });

      expect(downloaded).toEqual([]);
      expect(result.updated).toEqual([
        { library: "owner/branched", status: "current", recorded: [], differs: [], written: [] },
      ]);
    });

    test("follows none is held, with no request", async () => {
      await pinLibrary("owner/held", "v1", "none");

      const result = await update({});

      expect(forgeReads).toEqual([]);
      expect(downloaded).toEqual([]);
      expect(result).toEqual({
        updated: [
          { library: "owner/held", status: "held", recorded: [], differs: [], written: [] },
        ],
        failed: [],
      });
    });

    test("an explicit follows wins over what the ref would default to", async () => {
      await pinLibrary("owner/branched", "v1", "branch");

      const result = await update(
        { [repoOf("owner/branched")]: { head: NEW_COMMIT } },
        { [urlOf("owner/branched", NEW_COMMIT)]: archiveOf(SAME) },
      );

      expect(forgeReads).toEqual([`repo ${repoOf("owner/branched")}`, "head main"]);
      expect(result.updated[0]?.recorded).toEqual([NEW_COMMIT]);
    });

    test("a follows outside the set throws naming the file", () => {
      writeLibrary("owner/odd", "v1", "sometimes");

      expect(() => readLibraryData(dataDir)).toThrow(LibraryDataError);
      expect(() => readLibraryData(dataDir)).toThrow("owner/odd/library.json");
    });

    test("follows reads its default from the ref, and an explicit value as written", () => {
      writeLibrary("owner/explicit", PIN_COMMIT, "tags");
      writeLibrary("owner/sha", PIN_COMMIT);
      writeLibrary("owner/tag", "v1");

      expect(readLibraryData(dataDir).map(({ dir, follows }) => [dir, follows])).toEqual([
        ["owner/explicit", "tags"],
        ["owner/sha", "branch"],
        ["owner/tag", "tags"],
      ]);
    });
  });

  describe("regenerating a library", () => {
    const TWO_TAGS = { tags: [PIN_TAG, NEW_TAG] };
    const file = (folder: string, path: string): string => join(dataDir, folder, path);

    function writeDataFile(folder: string, path: string, text: string): void {
      const target = file(folder, path);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, text);
    }

    function extendLibrary(folder: string, fields: Readonly<Record<string, unknown>>): void {
      writeFileSync(
        file(folder, "library.json"),
        JSON.stringify({ repo: repoOf(folder), ...fields }),
      );
    }

    const FORK = {
      authored: "fork/mylib.d.ts",
      moduleId: "mylib.mylib",
      namespace: "mylib.mylib",
      apiDoc: "api-doc/mylib.json",
      upstreamLua: ["source/upstream/mylib/mylib.lua"],
    };
    const LUALS_RECIPE = {
      luals: [
        {
          sourceGlobs: ["mylib/**/*.lua"],
          moduleId: "mylib.mylib",
          namespace: "mylib",
          ignore: ["**/test/**"],
        },
      ],
    };

    async function pinLuals(folder: string, lua: string = SAME): Promise<void> {
      await pinLibrary(folder, "v1", undefined, lua);
      writeDataFile(folder, "recipe.json", JSON.stringify(LUALS_RECIPE));
      writeDataFile(folder, "source/mylib/mylib/mylib.lua", lua);
      writeDataFile(folder, "source/mylib/mylib/old.lua", "return {}\n");
    }

    test("a luals library's source folder matches the candidate's selection", async () => {
      await pinLuals("owner/luals");

      const result = await update(
        { [repoOf("owner/luals")]: TWO_TAGS },
        {
          [urlOf("owner/luals", NEW_COMMIT)]: archiveOfFiles({
            "mylib/mylib.lua": CHANGED,
            "mylib/added.lua": "return 1\n",
            "mylib/test/skipped.lua": "return 2\n",
            "outside/other.lua": "return 3\n",
          }),
        },
      );

      expect(result.failed).toEqual([]);
      const [library] = readLibraryData(dataDir);
      expect(library?.ref).toBe("v2");
      const [target] = library?.luals ?? [];
      expect(target === undefined ? [] : listTargetFixtures(dataDir, target)).toEqual([
        "mylib/added.lua",
        "mylib/mylib.lua",
      ]);
      expect(readFileSync(file("owner/luals", "source/mylib/mylib/mylib.lua"), "utf8")).toBe(
        CHANGED,
      );
      expect(result.updated[0]?.written).toEqual([
        "source/mylib/mylib/added.lua",
        "source/mylib/mylib/mylib.lua",
        "reviewed.json",
      ]);
    });

    test("a script_api library's source file holds the candidate's bytes", async () => {
      const bytes = "- name: mylib\r\n  type: table\r\n";
      await pinLibrary("owner/scripted", "v1");
      writeDataFile(
        "owner/scripted",
        "recipe.json",
        JSON.stringify({
          scriptApi: [
            {
              scriptApi: "mylib/mylib.script_api",
              moduleId: "mylib.mylib",
              namespace: "mylib",
              apiDoc: "api-doc/mylib.json",
            },
          ],
        }),
      );

      const result = await update(
        { [repoOf("owner/scripted")]: TWO_TAGS },
        {
          [urlOf("owner/scripted", NEW_COMMIT)]: archiveOfFiles({
            "mylib/mylib.lua": SAME,
            "mylib/mylib.script_api": bytes,
          }),
        },
      );

      expect(result.failed).toEqual([]);
      const [target] = readLibraryData(dataDir)[0]?.scriptApi ?? [];
      expect(readFileSync(join(dataDir, target?.sourceFile ?? ""), "utf8")).toBe(bytes);
      expect(result.updated[0]?.written).toEqual([
        "source/mylib.mylib.script_api",
        "reviewed.json",
      ]);
    });

    test("a script_api file the candidate no longer holds fails the library", async () => {
      await pinLibrary("owner/scripted", "v1");
      writeDataFile(
        "owner/scripted",
        "recipe.json",
        JSON.stringify({
          scriptApi: [
            {
              scriptApi: "mylib/mylib.script_api",
              moduleId: "mylib.mylib",
              namespace: "mylib",
              apiDoc: "api-doc/mylib.json",
            },
          ],
        }),
      );
      const before = dataFolderDigest(join(dataDir, "owner/scripted"));

      const result = await update(
        { [repoOf("owner/scripted")]: TWO_TAGS },
        { [urlOf("owner/scripted", NEW_COMMIT)]: archiveOf(CHANGED) },
      );

      expect(result.failed).toEqual([
        { library: "owner/scripted", message: "mylib/mylib.script_api is gone from v2" },
      ]);
      expect(dataFolderDigest(join(dataDir, "owner/scripted"))).toBe(before);
    });

    test("a fork's upstream files move and its declarations stay", async () => {
      await pinLibrary("owner/forked", "v1");
      extendLibrary("owner/forked", { forks: [FORK] });
      writeDataFile("owner/forked", "source/upstream/mylib/mylib.lua", SAME);
      writeDataFile("owner/forked", "fork/mylib.d.ts", "export {};\n");
      writeDataFile("owner/forked", "usage/mylib.ts", "export {};\n");
      const library = readFileSync(file("owner/forked", "library.json"), "utf8");

      const result = await update(
        { [repoOf("owner/forked")]: TWO_TAGS },
        { [urlOf("owner/forked", NEW_COMMIT)]: archiveOf(CHANGED) },
      );

      expect(result.failed).toEqual([]);
      expect(readFileSync(file("owner/forked", "source/upstream/mylib/mylib.lua"), "utf8")).toBe(
        CHANGED,
      );
      expect(readFileSync(file("owner/forked", "fork/mylib.d.ts"), "utf8")).toBe("export {};\n");
      expect(readFileSync(file("owner/forked", "usage/mylib.ts"), "utf8")).toBe("export {};\n");
      expect(readFileSync(file("owner/forked", "library.json"), "utf8")).toBe(library);
      expect(result.updated[0]?.written).toEqual([
        "source/upstream/mylib/mylib.lua",
        "reviewed.json",
      ]);
    });

    test("a native upstream file the candidate no longer holds leaves the folder as it was", async () => {
      await pinLibrary("owner/native", "v1");
      extendLibrary("owner/native", {
        native: {
          namespace: "mylib",
          manifestDir: "mylib/native",
          declaration: "fork/mylib.d.ts",
          upstreamSource: "source/upstream/mylib/src/ext.cpp",
        },
      });
      writeDataFile("owner/native", "source/upstream/mylib/mylib.lua", SAME);
      writeDataFile("owner/native", "source/upstream/mylib/src/ext.cpp", "// pinned\n");
      writeDataFile("owner/native", "fork/mylib.d.ts", "export {};\n");
      const before = dataFolderDigest(join(dataDir, "owner/native"));

      const result = await update(
        { [repoOf("owner/native")]: TWO_TAGS },
        { [urlOf("owner/native", NEW_COMMIT)]: archiveOf(CHANGED) },
      );

      expect(result.updated).toEqual([]);
      expect(result.failed).toEqual([
        { library: "owner/native", message: "mylib/src/ext.cpp is gone from v2" },
      ]);
      expect(dataFolderDigest(join(dataDir, "owner/native"))).toBe(before);
    });

    test("a failed read in one lane leaves another lane's files as they were", async () => {
      await pinLuals("owner/both");
      extendLibrary("owner/both", { forks: [{ ...FORK, moduleId: "mylib.fork" }] });
      writeDataFile("owner/both", "source/upstream/mylib/gone.lua", SAME);
      const before = dataFolderDigest(join(dataDir, "owner/both"));

      const result = await update(
        { [repoOf("owner/both")]: TWO_TAGS },
        { [urlOf("owner/both", NEW_COMMIT)]: archiveOf(CHANGED) },
      );

      expect(result.failed).toEqual([
        { library: "owner/both", message: "mylib/gone.lua is gone from v2" },
      ]);
      expect(dataFolderDigest(join(dataDir, "owner/both"))).toBe(before);
    });

    test("an entry that leaves its folder fails the library and is not written", async () => {
      await pinLuals("owner/escaping");
      const before = dataFolderDigest(join(dataDir, "owner/escaping"));

      const result = await update(
        { [repoOf("owner/escaping")]: TWO_TAGS },
        {
          [urlOf("owner/escaping", NEW_COMMIT)]: archiveOfFiles({
            "mylib/mylib.lua": CHANGED,
            "mylib/../../../../evil.lua": "return 1\n",
          }),
        },
      );

      expect(result.failed).toEqual([
        {
          library: "owner/escaping",
          message: expect.stringContaining("leaves the library's folder"),
        },
      ]);
      expect(dataFolderDigest(join(dataDir, "owner/escaping"))).toBe(before);
      expect(existsSync(join(base, "evil.lua"))).toBe(false);
      expect(existsSync(join(dataDir, "evil.lua"))).toBe(false);
    });

    test("only the newest differing tag is regenerated", async () => {
      await pinLibrary("owner/tagged", "v1");

      const result = await update(
        { [repoOf("owner/tagged")]: { tags: [PIN_TAG, NEW_TAG, LATER_TAG] } },
        {
          [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(CHANGED),
          [urlOf("owner/tagged", LATER_COMMIT)]: archiveOf(moduleOf("a, b, c")),
        },
      );

      expect(result.updated[0]).toMatchObject({
        status: "regenerated",
        differs: [NEW_COMMIT, LATER_COMMIT],
        ref: "v3",
      });
      expect(readLibraryData(dataDir).map(({ ref }) => ref)).toEqual(["v3"]);
      const commits = readLibraryReviews(dataDir, "owner/tagged")?.flatMap(
        (review) => review.commits,
      );
      expect(commits).toEqual([PIN_COMMIT, LATER_COMMIT]);
    });

    test("a followed branch pins the commit", async () => {
      await pinLibrary("owner/branched", PIN_COMMIT);

      const result = await update(
        { [repoOf("owner/branched")]: { head: NEW_COMMIT } },
        { [urlOf("owner/branched", NEW_COMMIT)]: archiveOf(CHANGED) },
      );

      expect(result.updated[0]?.ref).toBe(NEW_COMMIT);
      expect(readLibraryData(dataDir).map(({ ref }) => ref)).toEqual([NEW_COMMIT]);
    });

    test("a restored pin compares with its own review, not the last one", async () => {
      await pinLuals("owner/restored", TWO_FUNCTIONS);
      await update(
        { [repoOf("owner/restored")]: TWO_TAGS },
        { [urlOf("owner/restored", NEW_COMMIT)]: archiveOf(SAME) },
      );
      const moved = JSON.parse(reviewedText("owner/restored")) as Record<string, unknown>;
      writeFileSync(
        file("owner/restored", "reviewed.json"),
        JSON.stringify({ ...moved, ref: "v1" }),
      );
      writeDataFile("owner/restored", "source/mylib/mylib/mylib.lua", TWO_FUNCTIONS);

      const restored = await reviewLibraries(dataDir, ["owner/restored"], {
        cacheDir,
        download: serving({
          [urlOf("owner/restored", "v1")]: archiveOf(TWO_FUNCTIONS, PIN_COMMIT),
        }),
      });

      expect(restored).toEqual({
        reviewed: [{ library: "owner/restored", commit: PIN_COMMIT, added: false }],
        failed: [],
      });
      expect(readLibraryReviews(dataDir, "owner/restored")?.map(({ commits }) => commits)).toEqual([
        [PIN_COMMIT],
        [NEW_COMMIT],
      ]);

      const result = await update(
        { [repoOf("owner/restored")]: { tags: [PIN_TAG, NEW_TAG, LATER_TAG] } },
        {
          [urlOf("owner/restored", LATER_COMMIT)]: archiveOf(
            SAME.replace(") end", ") return 1 end"),
          ),
        },
      );

      expect(result.failed).toEqual([]);
      expect(result.updated[0]).toMatchObject({
        change: "changed",
        members: { ...NO_MEMBERS, removed: ["mylib/mylib.lua#stop"] },
        ref: "v3",
      });
    });

    test("a run after a regeneration reads current and downloads nothing", async () => {
      await pinLibrary("owner/tagged", "v1");
      const upstream = { [repoOf("owner/tagged")]: TWO_TAGS };
      const archives = { [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(CHANGED) };
      await update(upstream, archives);
      const recorded = reviewedText("owner/tagged");
      downloaded = [];

      const result = await update(upstream, archives);

      expect(downloaded).toEqual([]);
      expect(reviewedText("owner/tagged")).toBe(recorded);
      expect(result.updated).toEqual([
        { library: "owner/tagged", status: "current", recorded: [], differs: [], written: [] },
      ]);
    });
  });

  describe("classifying a change", () => {
    async function classified(lua: string, pinned: string = SAME) {
      await pinLibrary("owner/tagged", "v1", undefined, pinned);
      const result = await update(
        { [repoOf("owner/tagged")]: { tags: [PIN_TAG, NEW_TAG] } },
        { [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(lua) },
      );
      expect(result.failed).toEqual([]);
      return result.updated[0];
    }

    test("a doc comment edit keeps every member", async () => {
      const entry = await classified(SAME.replace("function", "--- Starts it.\nfunction"));

      expect(entry?.change).toBe("kept");
      expect(entry?.members).toEqual(NO_MEMBERS);
    });

    test("a function body edit with the same parameters keeps every member", async () => {
      const entry = await classified(SAME.replace(") end", ") return 1 end"));

      expect(entry?.change).toBe("kept");
      expect(entry?.members).toEqual(NO_MEMBERS);
    });

    test("a new function only adds", async () => {
      const entry = await classified(TWO_FUNCTIONS);

      expect(entry?.change).toBe("added");
      expect(entry?.members).toEqual({ ...NO_MEMBERS, added: ["mylib/mylib.lua#stop"] });
    });

    test("a removed function is a change that names it", async () => {
      const entry = await classified(SAME, TWO_FUNCTIONS);

      expect(entry?.change).toBe("changed");
      expect(entry?.members).toEqual({ ...NO_MEMBERS, removed: ["mylib/mylib.lua#stop"] });
    });

    test("a changed parameter list is a change that names it", async () => {
      const entry = await classified(CHANGED);

      expect(entry?.change).toBe("changed");
      expect(entry?.members).toEqual({ ...NO_MEMBERS, changed: ["mylib/mylib.lua#start"] });
    });

    test("a moved annotation is a change", async () => {
      const pinned = `---@class mylib.first\n---@class mylib.second\n${SAME}`;
      const moved = `---@class mylib.second\n---@class mylib.first\n${SAME}`;

      const entry = await classified(moved, pinned);

      expect(entry?.change).toBe("changed");
      expect(entry?.members).toEqual({
        ...NO_MEMBERS,
        changed: ["mylib/mylib.lua#@annotations"],
      });
    });

    test("a changed whole file is a change that names it", async () => {
      writeLibrary("owner/tagged", "v1");
      const pinned = archiveOfFiles(
        { "mylib/mylib.lua": SAME, "mylib/ext.cpp": "// one\n" },
        PIN_COMMIT,
      );
      const reviewed = await reviewLibraries(dataDir, ["owner/tagged"], {
        cacheDir,
        download: serving({ [urlOf("owner/tagged", "v1")]: pinned }),
      });
      expect(reviewed.failed).toEqual([]);

      const result = await update(
        { [repoOf("owner/tagged")]: { tags: [PIN_TAG, NEW_TAG] } },
        {
          [urlOf("owner/tagged", NEW_COMMIT)]: archiveOfFiles({
            "mylib/mylib.lua": SAME,
            "mylib/ext.cpp": "// two\n",
          }),
        },
      );

      expect(result.updated[0]?.change).toBe("changed");
      expect(result.updated[0]?.members).toEqual({
        ...NO_MEMBERS,
        changed: ["mylib/ext.cpp"],
      });
    });

    test("a library with no reviews is a change with nothing to name", async () => {
      writeLibrary("owner/tagged", "v1");

      const result = await update(
        { [repoOf("owner/tagged")]: { tags: [PIN_TAG, NEW_TAG] } },
        { [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(SAME) },
      );

      expect(result.updated[0]?.change).toBe("changed");
      expect(result.updated[0]?.members).toEqual(NO_MEMBERS);
    });

    test("a review of another fingerprint version compares with nothing", async () => {
      await pinLibrary("owner/tagged", "v1");
      const reviewed = JSON.parse(reviewedText("owner/tagged")) as {
        reviews: { version: number }[];
      };
      for (const review of reviewed.reviews) review.version = FINGERPRINT_VERSION + 1;
      writeFileSync(join(dataDir, "owner/tagged", "reviewed.json"), JSON.stringify(reviewed));

      const result = await update(
        { [repoOf("owner/tagged")]: { tags: [PIN_TAG, NEW_TAG] } },
        { [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(SAME.replace(") end", ") return 1 end")) },
      );

      expect(result.updated[0]?.change).toBe("changed");
      expect(result.updated[0]?.members).toEqual(NO_MEMBERS);
    });

    test("a change compares with the review of the pin's commit", async () => {
      await pinLibrary("owner/tagged", "v1");
      await update(
        { [repoOf("owner/tagged")]: { tags: [PIN_TAG, NEW_TAG] } },
        { [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(CHANGED) },
      );

      const result = await update(
        { [repoOf("owner/tagged")]: { tags: [PIN_TAG, NEW_TAG, LATER_TAG] } },
        {
          [urlOf("owner/tagged", LATER_COMMIT)]: archiveOf(
            CHANGED.replace(") end", ") return 1 end"),
          ),
        },
      );

      expect(result.updated[0]?.change).toBe("kept");
    });

    test("a pinned tag that now names an unreviewed commit compares with nothing", async () => {
      await pinLibrary("owner/tagged", "v1");

      const result = await update(
        { [repoOf("owner/tagged")]: { tags: [{ ...PIN_TAG, sha: ARCHIVE_COMMIT }, NEW_TAG] } },
        { [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(SAME.replace(") end", ") return 1 end")) },
      );

      expect(result.updated[0]?.change).toBe("changed");
      expect(result.updated[0]?.members).toEqual(NO_MEMBERS);
    });

    test("a pin two reviews list compares with nothing", async () => {
      await pinLibrary("owner/tagged", "v1");
      const conflicting = await reviewLibraries(dataDir, ["owner/tagged"], {
        cacheDir: join(base, "second-cache"),
        download: serving({ [urlOf("owner/tagged", "v1")]: archiveOf(CHANGED, PIN_COMMIT) }),
      });
      expect(conflicting.failed).toEqual([]);
      expect(readLibraryReviews(dataDir, "owner/tagged")?.map(({ commits }) => commits)).toEqual([
        [PIN_COMMIT],
        [PIN_COMMIT],
      ]);

      const result = await update(
        { [repoOf("owner/tagged")]: { tags: [PIN_TAG, NEW_TAG] } },
        { [urlOf("owner/tagged", NEW_COMMIT)]: archiveOf(SAME.replace(") end", ") return 1 end")) },
      );

      expect(result.updated[0]?.change).toBe("changed");
      expect(result.updated[0]?.members).toEqual(NO_MEMBERS);
    });

    test("a followed branch compares with the review of its pinned commit", async () => {
      await pinLibrary("owner/branched", PIN_COMMIT);

      const result = await update(
        { [repoOf("owner/branched")]: { head: NEW_COMMIT } },
        {
          [urlOf("owner/branched", NEW_COMMIT)]: archiveOf(SAME.replace(") end", ") return 1 end")),
        },
      );

      expect(result.updated[0]?.change).toBe("kept");
    });
  });

  describe("across libraries", () => {
    test("a forge failure is reported by name and the next library is still updated", async () => {
      await pinLibrary("owner/first", "v1");
      await pinLibrary("owner/second", "v1");
      const firstBefore = reviewedText("owner/first");

      const result = await update(
        { [repoOf("owner/second")]: { tags: [PIN_TAG, NEW_TAG] } },
        { [urlOf("owner/second", NEW_COMMIT)]: archiveOf(SAME) },
      );

      expect(result.failed).toEqual([
        { library: "owner/first", message: expect.stringContaining("404") },
      ]);
      expect(result.updated).toEqual([
        {
          library: "owner/second",
          status: "recorded",
          recorded: [NEW_COMMIT],
          differs: [],
          written: ["reviewed.json"],
        },
      ]);
      expect(reviewedText("owner/first")).toBe(firstBefore);
    });

    test("a named library is the only one read", async () => {
      await pinLibrary("owner/first", "v1", "none");
      await pinLibrary("owner/second", "v1", "none");

      const result = await update({}, {}, ["owner/second"]);

      expect(result.updated.map(({ library }) => library)).toEqual(["owner/second"]);
    });

    test("an unknown name throws before any request", async () => {
      await pinLibrary("owner/first", "v1");

      await expect(update({}, {}, ["nope"])).rejects.toThrow("nope");

      expect(forgeReads).toEqual([]);
      expect(downloaded).toEqual([]);
    });
  });
});

describe("reportedLibraryPath", () => {
  test("keeps the network root of a UNC data folder", () => {
    const folder = "\\\\server\\share\\data\\0.1.0";

    const reported = reportedLibraryPath(folder, "first", "reviewed.json", win32);

    expect(reported).toBe("//server/share/data/0.1.0/first/reviewed.json");
    expect(win32.resolve(reported)).toBe(win32.join(folder, "first", "reviewed.json"));
  });

  test("keeps the drive of a Windows data folder", () => {
    expect(reportedLibraryPath("C:\\data\\0.1.0", "first", "reviewed.json", win32)).toBe(
      "C:/data/0.1.0/first/reviewed.json",
    );
  });

  test("keeps a backslash in a POSIX folder name", () => {
    expect(reportedLibraryPath("/tmp/a\\b/0.1.0", "first", "reviewed.json", posix)).toBe(
      "/tmp/a\\b/0.1.0/first/reviewed.json",
    );
  });

  test("uses forward slashes for a nested file on Windows", () => {
    expect(reportedLibraryPath("C:\\data\\0.1.0", "first", "source/a/b.lua", win32)).toBe(
      "C:/data/0.1.0/first/source/a/b.lua",
    );
  });
});
