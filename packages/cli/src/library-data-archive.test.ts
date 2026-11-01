import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
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

function resolve(
  cacheDir: string,
  download: DownloadExtensionArchive,
  options: { recorded?: string; frozen?: boolean; update?: boolean } = {},
) {
  return resolveLibraryDataArchive({
    mainUrl: LIBRARY_DATA_MAIN_URL,
    cacheDir,
    recorded: options.recorded ?? null,
    frozen: options.frozen ?? false,
    ...(options.update === undefined ? {} : { update: options.update }),
    cliVersion: CLI,
    download,
  });
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

describe("resolveLibraryDataArchive, plain", () => {
  test("--update moves a newer main past the recorded commit", async () => {
    const cacheDir = tmp();
    cacheCommit(cacheDir, OTHER);

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT)), {
      recorded: OTHER,
      update: true,
    });

    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT });
  });

  test("--update offline with only the recorded commit cached serves it and names the url", async () => {
    const cacheDir = tmp();
    cacheCommit(cacheDir, COMMIT);

    const result = await resolve(cacheDir, offline, { recorded: COMMIT, update: true });

    expect(result.dir).toBe(dirFor(cacheDir, COMMIT));
    expect(result.commit).toBe(COMMIT);
    expect(result.warning).toContain(LIBRARY_DATA_MAIN_URL);
    expect(result.error).toBeUndefined();
  });

  test("--update offline prefers the recorded commit over a newer cached main", async () => {
    const cacheDir = tmp();
    await resolve(cacheDir, serves(dataArchive(COMMIT)));
    await resolve(cacheDir, serves(dataArchive(OTHER)));

    const result = await resolve(cacheDir, offline, { recorded: COMMIT, update: true });

    expect(result.dir).toBe(dirFor(cacheDir, COMMIT));
    expect(result.commit).toBe(COMMIT);
    expect(result.warning).toContain(LIBRARY_DATA_MAIN_URL);
  });

  test("--update offline with only main cached serves that copy and its commit", async () => {
    const cacheDir = tmp();
    await resolve(cacheDir, serves(dataArchive(OTHER)));

    const result = await resolve(cacheDir, offline, { recorded: COMMIT, update: true });

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
});

describe("resolveLibraryDataArchive, plain, holding the recorded commit", () => {
  const DATA: readonly ZipFixtureEntry[] = [
    { name: "library-data-x/data/0.55.0/mylib/library.json", text: "{}" },
    { name: "library-data-x/data/0.55.0/mylib/icon.bin", bytes: BINARY },
  ];
  const CHANGED: readonly ZipFixtureEntry[] = [
    { name: "library-data-x/data/0.55.0/mylib/library.json", text: '{"changed":true}' },
    { name: "library-data-x/data/0.55.0/mylib/icon.bin", bytes: BINARY },
  ];
  const held = (cacheDir: string) => ({ dir: dirFor(cacheDir, OTHER), commit: OTHER });

  async function cacheArchive(
    cacheDir: string,
    commit: string,
    entries: readonly ZipFixtureEntry[],
  ): Promise<void> {
    await resolve(cacheDir, serves(dataArchive(commit, entries)));
  }

  test("a change in main's data folder serves the recorded commit and names main as newer", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, DATA);

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT, CHANGED)), {
      recorded: OTHER,
    });

    expect(result).toEqual({
      ...held(cacheDir),
      newer: { dir: dirFor(cacheDir, COMMIT), commit: COMMIT },
    });
    expect(readFileSync(join(dirFor(cacheDir, COMMIT), "mylib", "library.json"), "utf8")).toBe(
      '{"changed":true}',
    );
  });

  test("a change only outside the data folder serves the recorded commit with no newer", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, DATA);
    const outside = [...DATA, { name: "library-data-x/README.md", text: "# docs" }];

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT, outside)), {
      recorded: OTHER,
    });

    expect(result).toEqual(held(cacheDir));
  });

  test("main at the recorded commit needs no second download", async () => {
    const cacheDir = tmp();
    const { download, calls } = counting(serves(dataArchive(OTHER, DATA)));

    const result = await resolve(cacheDir, download, { recorded: OTHER });

    expect(result).toEqual(held(cacheDir));
    expect(calls.map(({ url }) => url)).toEqual([LIBRARY_DATA_MAIN_URL]);
  });

  test("a higher data folder in main moves to main and names the folder", async () => {
    const cacheDir = tmp();
    const lower = [{ name: "library-data-x/data/0.54.0/mylib/library.json", text: "{}" }];
    await cacheArchive(cacheDir, OTHER, lower);
    const higher = [
      ...lower,
      { name: "library-data-x/data/0.55.0/mylib/library.json", text: "{}" },
    ];

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT, higher)), {
      recorded: OTHER,
    });

    expect(result.dir).toBe(dirFor(cacheDir, COMMIT));
    expect(result.commit).toBe(COMMIT);
    expect(result.moved).toContain("0.55.0");
    expect(result.newer).toBeUndefined();
    expect(result.warning).toBeUndefined();
  });

  test("a recorded commit with no folder for this CLI moves to main and names both", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, [
      { name: "library-data-x/data/9.9.9/mylib/library.json", text: "{}" },
    ]);

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT, DATA)), { recorded: OTHER });

    expect(result.dir).toBe(dirFor(cacheDir, COMMIT));
    expect(result.commit).toBe(COMMIT);
    expect(result.moved).toContain(OTHER);
    expect(result.moved).toContain(CLI);
    expect(result.warning).toBeUndefined();
  });

  test("a recorded commit with version folders only at its root moves to main and names both", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, [
      { name: "library-data-x/0.55.0/mylib/library.json", text: "{}" },
    ]);

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT, DATA)), { recorded: OTHER });

    expect(result.dir).toBe(dirFor(cacheDir, COMMIT));
    expect(result.commit).toBe(COMMIT);
    expect(result.moved).toContain(OTHER);
    expect(result.moved).toContain(CLI);
    expect(result.warning).toBeUndefined();
  });

  test("a recorded commit its own url cannot serve moves to main and names it", async () => {
    const cacheDir = tmp();
    const download: DownloadExtensionArchive = (url, etag) =>
      url === LIBRARY_DATA_MAIN_URL
        ? serves(dataArchive(COMMIT, DATA))(url, etag)
        : offline(url, etag);

    const result = await resolve(cacheDir, download, { recorded: OTHER });

    expect(result.commit).toBe(COMMIT);
    expect(result.moved).toContain(OTHER);
    expect(result.warning).toBeUndefined();
  });

  test.skipIf(process.platform === "win32")(
    "a recorded folder that cannot be read moves to main and names it",
    async () => {
      const cacheDir = tmp();
      await cacheArchive(cacheDir, OTHER, DATA);
      symlinkSync(join(cacheDir, "absent"), join(dirFor(cacheDir, OTHER), "dangling"));

      const result = await resolve(cacheDir, serves(dataArchive(COMMIT, DATA)), {
        recorded: OTHER,
      });

      expect(result.commit).toBe(COMMIT);
      expect(result.moved).toContain(OTHER);
      expect(result.warning).toBeUndefined();
    },
  );

  test("offline with the recorded commit cached serves it with no warning", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, DATA);

    const result = await resolve(cacheDir, offline, { recorded: OTHER });

    expect(result).toEqual(held(cacheDir));
  });

  test("a stale main beside a cached recorded commit serves it with no warning", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, DATA);
    await cacheArchive(cacheDir, COMMIT, CHANGED);

    const result = await resolve(cacheDir, offline, { recorded: OTHER });

    expect(result).toEqual(held(cacheDir));
  });

  test("main that cannot be read beside a cached recorded commit serves it with no warning", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, DATA);

    const result = await resolve(cacheDir, serves(new TextEncoder().encode("not a zip")), {
      recorded: OTHER,
    });

    expect(result).toEqual(held(cacheDir));
  });

  test("offline with the recorded commit uncached never moves to a stale main", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, COMMIT, DATA);

    const result = await resolve(cacheDir, offline, { recorded: OTHER });

    expect(result.dir).toBeNull();
    expect(result.commit).toBeNull();
    expect(result.warning).toContain(LIBRARY_DATA_MAIN_URL);
    expect(result.error).toBeUndefined();
  });

  test("nothing recorded with a stale main cached still serves that copy", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, COMMIT, DATA);

    const result = await resolve(cacheDir, offline);

    expect(result.dir).toBe(dirFor(cacheDir, COMMIT));
    expect(result.commit).toBe(COMMIT);
    expect(result.warning).toContain(LIBRARY_DATA_MAIN_URL);
  });

  test.each([[false], [true]])("nothing recorded serves main with update %p", async (update) => {
    const cacheDir = tmp();

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT, DATA)), { update });

    expect(result).toEqual({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT });
  });
});

describe("resolveLibraryDataArchive, --update, with a recorded commit behind main", () => {
  const DATA: readonly ZipFixtureEntry[] = [
    { name: "library-data-x/data/0.55.0/mylib/library.json", text: "{}" },
    { name: "library-data-x/data/0.55.0/mylib/icon.bin", bytes: BINARY },
  ];
  const NEWER_OUTSIDE_DATA: readonly ZipFixtureEntry[] = [
    ...DATA,
    { name: "library-data-x/README.md", text: "# docs" },
    { name: "library-data-x/site/app.ts", text: "export {};\n" },
  ];
  const kept = (cacheDir: string) => ({ dir: dirFor(cacheDir, OTHER), commit: OTHER });
  const moved = (cacheDir: string) => ({ dir: dirFor(cacheDir, COMMIT), commit: COMMIT });

  // Main is served from `main`; the recorded commit's own url gets `recordedUrl`.
  const answering =
    (main: Uint8Array, recordedUrl: DownloadExtensionArchive): DownloadExtensionArchive =>
    (url, etag) =>
      url === LIBRARY_DATA_MAIN_URL ? serves(main)(url, etag) : recordedUrl(url, etag);

  async function cacheArchive(
    cacheDir: string,
    commit: string,
    entries: readonly ZipFixtureEntry[],
  ): Promise<void> {
    await resolve(cacheDir, serves(dataArchive(commit, entries)));
  }

  test("a cached recorded commit stays when main differs only outside the data folder", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, DATA);
    const { download, calls } = counting(serves(dataArchive(COMMIT, NEWER_OUTSIDE_DATA)));

    const result = await resolve(cacheDir, download, { recorded: OTHER, update: true });

    expect(result).toEqual(kept(cacheDir));
    expect(calls.map(({ url }) => url)).toEqual([LIBRARY_DATA_MAIN_URL]);
  });

  test("an uncached recorded commit is fetched by its own url and stays", async () => {
    const cacheDir = tmp();
    const { download, calls } = counting(
      answering(dataArchive(COMMIT, NEWER_OUTSIDE_DATA), serves(dataArchive(OTHER, DATA))),
    );

    const result = await resolve(cacheDir, download, { recorded: OTHER, update: true });

    expect(result).toEqual(kept(cacheDir));
    expect(calls.map(({ url }) => url)).toEqual([
      LIBRARY_DATA_MAIN_URL,
      libraryDataCommitUrl(OTHER),
    ]);
  });

  test("a change only in a folder this CLI does not read keeps the recorded commit", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, DATA);
    const newer = [...DATA, { name: "library-data-x/data/0.99.0/mylib/library.json", text: "{}" }];

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT, newer)), {
      recorded: OTHER,
      update: true,
    });

    expect(result).toEqual(kept(cacheDir));
  });

  test.each<[string, DownloadExtensionArchive]>([
    ["unreachable", offline],
    ["not an archive", serves(new TextEncoder().encode("not a zip"))],
    ["holding another commit", serves(dataArchive(COMMIT, DATA))],
  ])("a recorded commit %s yields the newest commit with no warning", async (_name, recordedUrl) => {
    const cacheDir = tmp();

    const result = await resolve(cacheDir, answering(dataArchive(COMMIT, DATA), recordedUrl), {
      recorded: OTHER,
      update: true,
    });

    expect(result).toEqual(moved(cacheDir));
  });

  test("a recorded commit with no folder for this CLI yields the newest commit", async () => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, [
      { name: "library-data-x/data/9.9.9/mylib/library.json", text: "{}" },
    ]);

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT, DATA)), {
      recorded: OTHER,
      update: true,
    });

    expect(result).toEqual(moved(cacheDir));
  });

  test.skipIf(process.platform === "win32")(
    "a recorded folder that cannot be read yields the newest commit with no warning",
    async () => {
      const cacheDir = tmp();
      await cacheArchive(cacheDir, OTHER, DATA);
      symlinkSync(join(cacheDir, "absent"), join(dirFor(cacheDir, OTHER), "dangling"));

      const result = await resolve(cacheDir, serves(dataArchive(COMMIT, DATA)), {
        recorded: OTHER,
        update: true,
      });

      expect(result).toEqual(moved(cacheDir));
    },
  );

  test.each<[string, readonly ZipFixtureEntry[], readonly ZipFixtureEntry[]]>([
    [
      "a changed file",
      DATA,
      [
        { name: "library-data-x/data/0.55.0/mylib/library.json", text: '{"changed":true}' },
        { name: "library-data-x/data/0.55.0/mylib/icon.bin", bytes: BINARY },
      ],
    ],
    [
      "an added file",
      DATA,
      [...DATA, { name: "library-data-x/data/0.55.0/mylib/extra.json", text: "{}" }],
    ],
    ["a removed file", DATA, DATA.slice(0, 1)],
    [
      "a file moved with the same bytes",
      DATA,
      [
        { name: "library-data-x/data/0.55.0/renamed/library.json", text: "{}" },
        { name: "library-data-x/data/0.55.0/mylib/icon.bin", bytes: BINARY },
      ],
    ],
    [
      "a file split in two where its bytes read as the next file's name",
      [{ name: "library-data-x/data/0.55.0/a", text: "x\0b\0y" }],
      [
        { name: "library-data-x/data/0.55.0/a", text: "x" },
        { name: "library-data-x/data/0.55.0/b", text: "y" },
      ],
    ],
    [
      "a higher data folder with identical files",
      [{ name: "library-data-x/data/0.54.0/mylib/library.json", text: "{}" }],
      [
        { name: "library-data-x/data/0.54.0/mylib/library.json", text: "{}" },
        { name: "library-data-x/data/0.55.0/mylib/library.json", text: "{}" },
      ],
    ],
  ])("%s moves to the newest commit", async (_name, recordedEntries, newestEntries) => {
    const cacheDir = tmp();
    await cacheArchive(cacheDir, OTHER, recordedEntries);

    const result = await resolve(cacheDir, serves(dataArchive(COMMIT, newestEntries)), {
      recorded: OTHER,
      update: true,
    });

    expect(result).toEqual(moved(cacheDir));
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
    mkdirSync(join(cacheDir, "commits", COMMIT, "data", "9.9.9"), { recursive: true });

    const result = await resolve(cacheDir, offline, { recorded: COMMIT, frozen: true });

    expect(result.dir).toBeNull();
    expect(result.error).toContain(CLI);
  });
});
