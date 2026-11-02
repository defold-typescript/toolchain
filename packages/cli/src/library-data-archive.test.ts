import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeZipArchive, type ZipFixtureEntry } from "../../types/test/zip-fixture";
import {
  type DownloadExtensionArchive,
  defaultReadZip,
  type ReadExtensionZip,
} from "./extension-archive";
import {
  fetchNewestLibraryData,
  LIBRARY_DATA_MAIN_URL,
  libraryDataAtCommit,
  libraryDataCacheDir,
  libraryDataCommitUrl,
  libraryFolderChange,
} from "./library-data-archive";

const COMMIT = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba9876543210fedcba98";
const CLI = "0.55.0";
const BINARY = new Uint8Array([0xff, 0xfe, 0x00, 0x80, 0x0a]);

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "library-data-archive-"));
}

// An archive as GitHub packs one: directory entries, every file under one
// `<repo>-<sha>/` folder, and the commit in the comment.
function dataArchive(
  commit: string | undefined,
  entries: readonly ZipFixtureEntry[] = [
    { name: "library-data-x/" },
    { name: "library-data-x/data/" },
    { name: "library-data-x/data/0.55.0/" },
    { name: "library-data-x/data/0.55.0/mylib/library.json", text: "{}" },
    { name: "library-data-x/data/0.55.0/mylib/icon.bin", bytes: BINARY },
  ],
): Uint8Array {
  return writeZipArchive(entries, commit === undefined ? {} : { comment: commit });
}

const serves =
  (bytes: Uint8Array, etag?: string): DownloadExtensionArchive =>
  async () => ({ status: "ok", bytes, ...(etag === undefined ? {} : { etag }) });

const offline: DownloadExtensionArchive = async () => {
  throw new Error("network down");
};

function counting(download: DownloadExtensionArchive): {
  download: DownloadExtensionArchive;
  calls: { url: string; etag: string | undefined }[];
} {
  const calls: { url: string; etag: string | undefined }[] = [];
  return {
    calls,
    download: (url, etag) => {
      calls.push({ url, etag });
      return download(url, etag);
    },
  };
}

function newest(cacheDir: string, download: DownloadExtensionArchive, readZip?: ReadExtensionZip) {
  return fetchNewestLibraryData({
    mainUrl: LIBRARY_DATA_MAIN_URL,
    cacheDir,
    cliVersion: CLI,
    download,
    ...(readZip === undefined ? {} : { readZip }),
  });
}

function atCommit(
  cacheDir: string,
  commit: string,
  download: DownloadExtensionArchive,
  mainUrl = LIBRARY_DATA_MAIN_URL,
) {
  return libraryDataAtCommit({ mainUrl, cacheDir, cliVersion: CLI, download }, commit);
}

function reasonOf(result: { dir: string } | { dir: null; reason: string }): string {
  if (result.dir !== null) {
    throw new Error(`expected no data, got ${result.dir}`);
  }
  return result.reason;
}

const dirFor = (cacheDir: string, commit: string) => join(cacheDir, "commits", commit, "data", CLI);

function cacheCommit(cacheDir: string, commit: string): void {
  mkdirSync(dirFor(cacheDir, commit), { recursive: true });
}

describe("libraryFolderChange", () => {
  const REVIEW = { version: 1, commits: [COMMIT], api: "api" };

  function folder(reviewed: string, source = "return {}", nested?: string): string {
    const dir = tmp();
    writeFileSync(join(dir, "reviewed.json"), reviewed);
    mkdirSync(join(dir, "source"));
    writeFileSync(join(dir, "source", "lib.lua"), source);
    if (nested !== undefined) {
      writeFileSync(join(dir, "source", "reviewed.json"), nested);
    }
    return dir;
  }
  const reviewed = (ref: string, reviews: readonly unknown[]) => JSON.stringify({ ref, reviews });

  test("equal bytes read same", () => {
    const text = reviewed("1.0.0", [REVIEW]);

    expect(libraryFolderChange(folder(text), folder(text))).toBe("same");
  });

  test.each<[string, string, string]>([
    ["reviews alone", reviewed("1.0.0", []), reviewed("1.0.0", [REVIEW])],
    [
      "key order inside reviews",
      reviewed("1.0.0", [{ version: 1, commits: [COMMIT] }]),
      reviewed("1.0.0", [{ commits: [COMMIT], version: 1 }]),
    ],
    ["a file with no reviews", JSON.stringify({ ref: "1.0.0" }), reviewed("1.0.0", [REVIEW])],
  ])("a difference in %s reads reviews", (_label, a, b) => {
    expect(libraryFolderChange(folder(a), folder(b))).toBe("reviews");
  });

  test.each<[string, string, string]>([
    ["ref", reviewed("1.0.0", [REVIEW]), reviewed("2.0.0", [REVIEW])],
    ["ref and reviews", reviewed("1.0.0", []), reviewed("2.0.0", [REVIEW])],
    ["unparsable JSON on one side", "{", reviewed("1.0.0", [REVIEW])],
    ["a file that holds no object", "[]", reviewed("1.0.0", [REVIEW])],
  ])("a difference in %s reads data", (_label, a, b) => {
    expect(libraryFolderChange(folder(a), folder(b))).toBe("data");
  });

  test("a changed file beside reviewed.json reads data", () => {
    const text = reviewed("1.0.0", []);

    expect(libraryFolderChange(folder(text, "return {}"), folder(text, "return nil"))).toBe("data");
  });

  test("only the folder's own reviewed.json has its reviews ignored", () => {
    const text = reviewed("1.0.0", []);

    expect(
      libraryFolderChange(
        folder(text, "return {}", reviewed("1.0.0", [])),
        folder(text, "return {}", reviewed("1.0.0", [REVIEW])),
      ),
    ).toBe("data");
  });

  test("a folder that cannot be read reads data", () => {
    const text = reviewed("1.0.0", []);

    expect(libraryFolderChange(folder(text), join(tmp(), "absent"))).toBe("data");
  });
});

describe("libraryDataCacheDir", () => {
  test("the cache override wins, else the XDG root, else the home cache", () => {
    expect(libraryDataCacheDir({ DEFOLD_TYPESCRIPT_CACHE: "/o" })).toBe(join("/o", "library-data"));
    expect(libraryDataCacheDir({ XDG_CACHE_HOME: "/x" })).toBe(
      join("/x", "defold-typescript", "library-data"),
    );
    expect(libraryDataCacheDir({}, () => "/h")).toBe(
      join("/h", ".cache", "defold-typescript", "library-data"),
    );
  });
});

describe("libraryDataCommitUrl", () => {
  test("names the commit's archive in the data repo", () => {
    expect(libraryDataCommitUrl(COMMIT)).toBe(
      `https://github.com/defold-typescript/library-data/archive/${COMMIT}.zip`,
    );
  });
});

describe("fetchNewestLibraryData", () => {
  test("a fresh run selects the data folder and reads the commit from the comment", async () => {
    const cacheDir = tmp();
    const result = await newest(cacheDir, serves(dataArchive(COMMIT)));

    expect(result).toEqual({
      dir: dirFor(cacheDir, COMMIT),
      commit: COMMIT,
      folder: CLI,
      stale: false,
    });
    expect(readFileSync(join(dirFor(cacheDir, COMMIT), "mylib", "library.json"), "utf8")).toBe(
      "{}",
    );
    expect(
      new Uint8Array(readFileSync(join(dirFor(cacheDir, COMMIT), "mylib", "icon.bin"))),
    ).toEqual(BINARY);
    expect(readdirSync(join(cacheDir, "commits"))).toEqual([COMMIT]);
  });

  test("an unchanged archive is revalidated by its ETag and served from the cache as fresh", async () => {
    const cacheDir = tmp();
    await newest(cacheDir, serves(dataArchive(COMMIT), '"v1"'));
    const second = counting(async () => ({ status: "not-modified" }));

    const result = await newest(cacheDir, second.download);

    expect(second.calls).toEqual([{ url: LIBRARY_DATA_MAIN_URL, etag: '"v1"' }]);
    expect(result).toEqual({
      dir: dirFor(cacheDir, COMMIT),
      commit: COMMIT,
      folder: CLI,
      stale: false,
    });
  });

  test("a failed request over a cached copy serves it as stale and names the url", async () => {
    const cacheDir = tmp();
    await newest(cacheDir, serves(dataArchive(COMMIT)));

    const result = await newest(cacheDir, offline);

    expect(result).toEqual({
      dir: dirFor(cacheDir, COMMIT),
      commit: COMMIT,
      folder: CLI,
      stale: true,
      warning: expect.stringContaining(LIBRARY_DATA_MAIN_URL),
    });
  });

  test("offline with nothing cached gives the reason", async () => {
    expect(reasonOf(await newest(tmp(), offline))).toContain(LIBRARY_DATA_MAIN_URL);
  });

  test("an archive with no commit comment gives the reason and unpacks nothing", async () => {
    const cacheDir = tmp();

    const result = await newest(cacheDir, serves(dataArchive(undefined)));

    expect(reasonOf(result)).toContain("commit");
    expect(existsSync(join(cacheDir, "commits"))).toBe(false);
  });

  test("bytes that are not an archive give the reason", async () => {
    const result = await newest(tmp(), serves(new TextEncoder().encode("not a zip")));

    expect(reasonOf(result)).toContain(LIBRARY_DATA_MAIN_URL);
  });

  test("an unsafe entry refuses the whole archive and writes nothing outside the cache", async () => {
    const root = tmp();
    const cacheDir = join(root, "a", "b", "c");
    const bytes = dataArchive(COMMIT, [
      { name: "top/0.55.0/mylib/library.json", text: "{}" },
      { name: "top/../../evil", text: "owned" },
    ]);

    const result = await newest(cacheDir, serves(bytes));

    expect(reasonOf(result)).toContain("top/../../evil");
    expect(existsSync(join(cacheDir, "commits", COMMIT))).toBe(false);
    const written = readdirSync(root, { recursive: true }) as string[];
    expect(written.filter((path) => path.endsWith("evil"))).toEqual([]);
  });

  test("an unsafe directory entry refuses the archive too", async () => {
    const cacheDir = tmp();
    const bytes = dataArchive(COMMIT, [
      { name: "top/0.55.0/mylib/library.json", text: "{}" },
      { name: "top/../../evil/" },
    ]);

    const result = await newest(cacheDir, serves(bytes));

    expect(result.dir).toBeNull();
    expect(existsSync(join(cacheDir, "commits", COMMIT))).toBe(false);
  });

  test("two top folders refuse the archive", async () => {
    const cacheDir = tmp();
    const bytes = dataArchive(COMMIT, [
      { name: "one/0.55.0/mylib/library.json", text: "{}" },
      { name: "two/0.55.0/mylib/library.json", text: "{}" },
    ]);

    const result = await newest(cacheDir, serves(bytes));

    expect(reasonOf(result)).toContain("top folder");
    expect(existsSync(join(cacheDir, "commits", COMMIT))).toBe(false);
  });

  test("an entry that cannot be written leaves no stage folder behind", async () => {
    const cacheDir = tmp();
    const bytes = dataArchive(COMMIT, [
      { name: "top/0.55.0/clash", text: "a file" },
      { name: "top/0.55.0/clash/inner", text: "under a file" },
    ]);

    const result = await newest(cacheDir, serves(bytes));

    expect(reasonOf(result)).toContain(LIBRARY_DATA_MAIN_URL);
    expect(readdirSync(join(cacheDir, "commits"))).toEqual([]);
  });

  test("no folder for this CLI gives a reason naming the version", async () => {
    const cacheDir = tmp();
    const bytes = dataArchive(COMMIT, [{ name: "top/data/9.9.9/mylib/library.json", text: "{}" }]);

    expect(reasonOf(await newest(cacheDir, serves(bytes)))).toContain(CLI);
  });

  test("version folders only at the archive root give a reason naming the version", async () => {
    const cacheDir = tmp();
    const bytes = dataArchive(COMMIT, [
      { name: "library-data-x/0.55.0/mylib/library.json", text: "{}" },
    ]);

    expect(reasonOf(await newest(cacheDir, serves(bytes)))).toContain(CLI);
  });

  test("a commit folder that appears during extraction is used, and the stage goes", async () => {
    const cacheDir = tmp();
    const racer = join(dirFor(cacheDir, COMMIT), "racer");
    const readZip: ReadExtensionZip = async (path) => {
      const zip = await defaultReadZip(path);
      return {
        entries: () => zip.entries(),
        read: (entry) => zip.read(entry),
        comment: () => zip.comment(),
        bytes: (entry) => {
          mkdirSync(dirFor(cacheDir, COMMIT), { recursive: true });
          writeFileSync(racer, "first");
          return zip.bytes(entry);
        },
      };
    };

    const result = await newest(cacheDir, serves(dataArchive(COMMIT)), readZip);

    expect(result).toEqual({
      dir: dirFor(cacheDir, COMMIT),
      commit: COMMIT,
      folder: CLI,
      stale: false,
    });
    expect(readFileSync(racer, "utf8")).toBe("first");
    expect(readdirSync(join(cacheDir, "commits"))).toEqual([COMMIT]);
  });

  test("folder names the version folder selected below this CLI", async () => {
    const cacheDir = tmp();
    const bytes = dataArchive(COMMIT, [
      { name: "top/data/0.54.0/mylib/library.json", text: "{}" },
      { name: "top/data/9.9.9/mylib/library.json", text: "{}" },
    ]);

    expect(await newest(cacheDir, serves(bytes))).toMatchObject({ folder: "0.54.0" });
  });
});

describe("libraryDataAtCommit", () => {
  test("a cached commit is served with no request", async () => {
    const cacheDir = tmp();
    cacheCommit(cacheDir, COMMIT);
    const { download, calls } = counting(offline);

    const result = await atCommit(cacheDir, COMMIT, download);

    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT, folder: CLI });
    expect(calls).toEqual([]);
  });

  test("an uncached commit is fetched by its own url", async () => {
    const cacheDir = tmp();
    const { download, calls } = counting(serves(dataArchive(COMMIT)));

    const result = await atCommit(cacheDir, COMMIT, download);

    expect(calls.map(({ url }) => url)).toEqual([libraryDataCommitUrl(COMMIT)]);
    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT, folder: CLI });
  });

  test("the commit url follows the main url's repository", async () => {
    const { download, calls } = counting(serves(dataArchive(COMMIT)));

    await atCommit(
      tmp(),
      COMMIT,
      download,
      "https://example.test/owner/fork/archive/refs/heads/main.zip",
    );

    expect(calls.map(({ url }) => url)).toEqual([
      `https://example.test/owner/fork/archive/${COMMIT}.zip`,
    ]);
  });

  test("an archive holding another commit is refused and caches nothing under either", async () => {
    const cacheDir = tmp();

    const result = await atCommit(cacheDir, COMMIT, serves(dataArchive(OTHER)));

    expect(reasonOf(result)).toContain(COMMIT);
    expect(reasonOf(result)).toContain(OTHER);
    expect(existsSync(join(cacheDir, "commits", COMMIT))).toBe(false);
    expect(existsSync(join(cacheDir, "commits", OTHER))).toBe(false);
  });

  test("an unreachable commit gives the reason, naming its url", async () => {
    expect(reasonOf(await atCommit(tmp(), COMMIT, offline))).toContain(
      libraryDataCommitUrl(COMMIT),
    );
  });

  test("a commit whose unpacked folder went serves its cached archive with the warning", async () => {
    const cacheDir = tmp();
    await atCommit(cacheDir, COMMIT, serves(dataArchive(COMMIT)));
    rmSync(join(cacheDir, "commits", COMMIT), { recursive: true });

    const result = await atCommit(cacheDir, COMMIT, offline);

    expect(result).toEqual({
      dir: dirFor(cacheDir, COMMIT),
      commit: COMMIT,
      folder: CLI,
      warning: expect.stringContaining(libraryDataCommitUrl(COMMIT)),
    });
  });

  test("bytes that are not an archive give the reason", async () => {
    const result = await atCommit(tmp(), COMMIT, serves(new TextEncoder().encode("not a zip")));

    expect(reasonOf(result)).toContain(libraryDataCommitUrl(COMMIT));
  });

  test("an unsafe entry refuses the commit's archive", async () => {
    const cacheDir = tmp();
    const bytes = dataArchive(COMMIT, [
      { name: "top/data/0.55.0/mylib/library.json", text: "{}" },
      { name: "top/../../evil", text: "owned" },
    ]);

    expect(reasonOf(await atCommit(cacheDir, COMMIT, serves(bytes)))).toContain("top/../../evil");
    expect(existsSync(join(cacheDir, "commits", COMMIT))).toBe(false);
  });

  test("a malformed commit touches no path and makes no request", async () => {
    const root = tmp();
    const cacheDir = join(root, "a", "b", "c");
    mkdirSync(cacheDir, { recursive: true });
    const { download, calls } = counting(serves(dataArchive(COMMIT)));

    const result = await atCommit(cacheDir, "../../x", download);

    expect(reasonOf(result)).toContain("../../x");
    expect(calls).toEqual([]);
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  test("a commit with no folder for this CLI gives a reason naming the version", async () => {
    const cacheDir = tmp();
    mkdirSync(join(cacheDir, "commits", COMMIT, "data", "9.9.9"), { recursive: true });

    expect(reasonOf(await atCommit(cacheDir, COMMIT, offline))).toContain(CLI);
  });

  test("folder names the version folder selected below this CLI", async () => {
    const cacheDir = tmp();
    mkdirSync(join(cacheDir, "commits", COMMIT, "data", "0.54.0"), { recursive: true });

    expect(await atCommit(cacheDir, COMMIT, offline)).toMatchObject({ folder: "0.54.0" });
  });
});
