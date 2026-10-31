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
import { join } from "node:path";
import { writeZipArchive, type ZipFixtureEntry } from "../../types/test/zip-fixture";
import {
  type DownloadExtensionArchive,
  defaultReadZip,
  type ReadExtensionZip,
} from "./extension-archive";
import {
  LIBRARY_DATA_MAIN_URL,
  libraryDataCacheDir,
  libraryDataCommitUrl,
  resolveLibraryDataArchive,
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
    { name: "library-data-x/0.55.0/" },
    { name: "library-data-x/0.55.0/mylib/library.json", text: "{}" },
    { name: "library-data-x/0.55.0/mylib/icon.bin", bytes: BINARY },
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

function resolve(
  cacheDir: string,
  download: DownloadExtensionArchive,
  options: { recorded?: string; frozen?: boolean; mainUrl?: string } = {},
  readZip?: ReadExtensionZip,
) {
  return resolveLibraryDataArchive({
    mainUrl: options.mainUrl ?? LIBRARY_DATA_MAIN_URL,
    cacheDir,
    recorded: options.recorded ?? null,
    frozen: options.frozen ?? false,
    cliVersion: CLI,
    download,
    ...(readZip === undefined ? {} : { readZip }),
  });
}

const dirFor = (cacheDir: string, commit: string) => join(cacheDir, "commits", commit, CLI);

function cacheCommit(cacheDir: string, commit: string): void {
  mkdirSync(dirFor(cacheDir, commit), { recursive: true });
}

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

describe("resolveLibraryDataArchive, plain", () => {
  test("a fresh run selects the data folder and reads the commit from the comment", async () => {
    const cacheDir = tmp();
    const result = await resolve(cacheDir, serves(dataArchive(COMMIT)));

    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT });
    expect(readFileSync(join(dirFor(cacheDir, COMMIT), "mylib", "library.json"), "utf8")).toBe(
      "{}",
    );
    expect(
      new Uint8Array(readFileSync(join(dirFor(cacheDir, COMMIT), "mylib", "icon.bin"))),
    ).toEqual(BINARY);
    expect(readdirSync(join(cacheDir, "commits"))).toEqual([COMMIT]);
  });

  test("an unchanged archive is revalidated by its ETag and served from the cache", async () => {
    const cacheDir = tmp();
    await resolve(cacheDir, serves(dataArchive(COMMIT), '"v1"'));
    const second = counting(async () => ({ status: "not-modified" }));

    const result = await resolve(cacheDir, second.download, { recorded: OTHER });

    expect(second.calls).toEqual([{ url: LIBRARY_DATA_MAIN_URL, etag: '"v1"' }]);
    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT });
  });

  test("a newer main moves past the recorded commit", async () => {
    const cacheDir = tmp();
    cacheCommit(cacheDir, OTHER);

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT)), { recorded: OTHER });

    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT });
  });

  test("offline with only the recorded commit cached serves it and names the url", async () => {
    const cacheDir = tmp();
    cacheCommit(cacheDir, COMMIT);

    const result = await resolve(cacheDir, offline, { recorded: COMMIT });

    expect(result.dir).toBe(dirFor(cacheDir, COMMIT));
    expect(result.commit).toBe(COMMIT);
    expect(result.warning).toContain(LIBRARY_DATA_MAIN_URL);
    expect(result.error).toBeUndefined();
  });

  test("offline prefers the recorded commit over a newer cached main", async () => {
    const cacheDir = tmp();
    await resolve(cacheDir, serves(dataArchive(COMMIT)));
    await resolve(cacheDir, serves(dataArchive(OTHER)));

    const result = await resolve(cacheDir, offline, { recorded: COMMIT });

    expect(result.dir).toBe(dirFor(cacheDir, COMMIT));
    expect(result.commit).toBe(COMMIT);
    expect(result.warning).toContain(LIBRARY_DATA_MAIN_URL);
  });

  test("offline with only main cached serves that copy and its commit", async () => {
    const cacheDir = tmp();
    await resolve(cacheDir, serves(dataArchive(OTHER)));

    const result = await resolve(cacheDir, offline, { recorded: COMMIT });

    expect(result.dir).toBe(dirFor(cacheDir, OTHER));
    expect(result.commit).toBe(OTHER);
    expect(result.warning).toContain(LIBRARY_DATA_MAIN_URL);
  });

  test("offline with nothing cached yields no data and a warning", async () => {
    const result = await resolve(tmp(), offline, { recorded: COMMIT });

    expect(result.dir).toBeNull();
    expect(result.commit).toBeNull();
    expect(result.warning).toContain(LIBRARY_DATA_MAIN_URL);
    expect(result.error).toBeUndefined();
  });

  test("a malformed recorded commit is treated as nothing recorded", async () => {
    const root = tmp();
    const cacheDir = join(root, "a", "b", "c");

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT)), { recorded: "../../x" });

    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT });
  });

  test("an archive with no commit comment yields no data and a warning", async () => {
    const cacheDir = tmp();

    const result = await resolve(cacheDir, serves(dataArchive(undefined)));

    expect(result.dir).toBeNull();
    expect(result.commit).toBeNull();
    expect(result.warning).toContain("commit");
    expect(existsSync(join(cacheDir, "commits"))).toBe(false);
  });

  test("bytes that are not an archive yield no data and a warning", async () => {
    const result = await resolve(tmp(), serves(new TextEncoder().encode("not a zip")));

    expect(result.dir).toBeNull();
    expect(result.commit).toBeNull();
    expect(result.warning).toContain(LIBRARY_DATA_MAIN_URL);
  });

  test("an unsafe entry refuses the whole archive and writes nothing outside the cache", async () => {
    const root = tmp();
    const cacheDir = join(root, "a", "b", "c");
    const bytes = dataArchive(COMMIT, [
      { name: "top/0.55.0/mylib/library.json", text: "{}" },
      { name: "top/../../evil", text: "owned" },
    ]);

    const result = await resolve(cacheDir, serves(bytes));

    expect(result.dir).toBeNull();
    expect(result.commit).toBeNull();
    expect(result.warning).toContain("top/../../evil");
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

    const result = await resolve(cacheDir, serves(bytes));

    expect(result.dir).toBeNull();
    expect(existsSync(join(cacheDir, "commits", COMMIT))).toBe(false);
  });

  test("two top folders refuse the archive", async () => {
    const cacheDir = tmp();
    const bytes = dataArchive(COMMIT, [
      { name: "one/0.55.0/mylib/library.json", text: "{}" },
      { name: "two/0.55.0/mylib/library.json", text: "{}" },
    ]);

    const result = await resolve(cacheDir, serves(bytes));

    expect(result.dir).toBeNull();
    expect(result.commit).toBeNull();
    expect(result.warning).toContain("top folder");
    expect(existsSync(join(cacheDir, "commits", COMMIT))).toBe(false);
  });

  test("an entry that cannot be written leaves no stage folder behind", async () => {
    const cacheDir = tmp();
    const bytes = dataArchive(COMMIT, [
      { name: "top/0.55.0/clash", text: "a file" },
      { name: "top/0.55.0/clash/inner", text: "under a file" },
    ]);

    const result = await resolve(cacheDir, serves(bytes));

    expect(result.dir).toBeNull();
    expect(result.warning).toContain(LIBRARY_DATA_MAIN_URL);
    expect(readdirSync(join(cacheDir, "commits"))).toEqual([]);
  });

  test("no folder for this CLI yields no data and a warning naming the version", async () => {
    const cacheDir = tmp();
    const bytes = dataArchive(COMMIT, [{ name: "top/9.9.9/mylib/library.json", text: "{}" }]);

    const result = await resolve(cacheDir, serves(bytes));

    expect(result.dir).toBeNull();
    expect(result.commit).toBeNull();
    expect(result.warning).toContain(CLI);
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

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT)), {}, readZip);

    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT });
    expect(readFileSync(racer, "utf8")).toBe("first");
    expect(readdirSync(join(cacheDir, "commits"))).toEqual([COMMIT]);
  });
});

describe("resolveLibraryDataArchive, frozen", () => {
  test("a cached recorded commit is served with no request", async () => {
    const cacheDir = tmp();
    cacheCommit(cacheDir, COMMIT);
    const { download, calls } = counting(offline);

    const result = await resolve(cacheDir, download, { recorded: COMMIT, frozen: true });

    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT });
    expect(calls).toEqual([]);
  });

  test("an uncached recorded commit is fetched by its own url", async () => {
    const cacheDir = tmp();
    const { download, calls } = counting(serves(dataArchive(COMMIT)));

    const result = await resolve(cacheDir, download, { recorded: COMMIT, frozen: true });

    expect(calls.map(({ url }) => url)).toEqual([libraryDataCommitUrl(COMMIT)]);
    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT });
  });

  test("the commit url follows the main url's repository", async () => {
    const { download, calls } = counting(serves(dataArchive(COMMIT)));

    await resolve(tmp(), download, {
      recorded: COMMIT,
      frozen: true,
      mainUrl: "https://example.test/owner/fork/archive/refs/heads/main.zip",
    });

    expect(calls.map(({ url }) => url)).toEqual([
      `https://example.test/owner/fork/archive/${COMMIT}.zip`,
    ]);
  });

  test("an archive holding another commit is refused and caches nothing under the recorded one", async () => {
    const cacheDir = tmp();

    const result = await resolve(cacheDir, serves(dataArchive(OTHER)), {
      recorded: COMMIT,
      frozen: true,
    });

    expect(result.dir).toBeNull();
    expect(result.commit).toBeNull();
    expect(result.error).toContain(COMMIT);
    expect(result.error).toContain(OTHER);
    expect(existsSync(join(cacheDir, "commits", COMMIT))).toBe(false);
    expect(existsSync(join(cacheDir, "commits", OTHER))).toBe(false);
  });

  test("nothing recorded asks for a plain resolve and makes no request", async () => {
    const { download, calls } = counting(serves(dataArchive(COMMIT)));

    const result = await resolve(tmp(), download, { frozen: true });

    expect(result.dir).toBeNull();
    expect(result.error).toContain("plain");
    expect(calls).toEqual([]);
  });

  test("an unreachable commit is an error, not a warning", async () => {
    const result = await resolve(tmp(), offline, { recorded: COMMIT, frozen: true });

    expect(result.dir).toBeNull();
    expect(result.error).toContain(libraryDataCommitUrl(COMMIT));
    expect(result.warning).toBeUndefined();
  });

  test("a malformed recorded commit touches no path and makes no request", async () => {
    const root = tmp();
    const cacheDir = join(root, "a", "b", "c");
    mkdirSync(cacheDir, { recursive: true });
    const { download, calls } = counting(serves(dataArchive(COMMIT)));

    const result = await resolve(cacheDir, download, { recorded: "../../x", frozen: true });

    expect(result.dir).toBeNull();
    expect(result.error).toBeDefined();
    expect(calls).toEqual([]);
    expect(readdirSync(cacheDir)).toEqual([]);
    expect(readdirSync(root, { recursive: true })).toEqual([
      "a",
      join("a", "b"),
      join("a", "b", "c"),
    ]);
  });

  test("a recorded commit with no folder for this CLI is an error", async () => {
    const cacheDir = tmp();
    mkdirSync(join(cacheDir, "commits", COMMIT, "9.9.9"), { recursive: true });

    const result = await resolve(cacheDir, offline, { recorded: COMMIT, frozen: true });

    expect(result.dir).toBeNull();
    expect(result.error).toContain(CLI);
  });
});
