import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { readZip } from "@defold-typescript/types/cli-runtime";
import * as ts from "typescript";
import { writeZipArchive } from "../../types/test/zip-fixture";
import { resolveTypesPackageRoot } from "./api-registry";
import { readCliVersion } from "./cli-version";
import { classifyDependencyUrl, type DependencyUrlKind } from "./dependency-url";
import { runExportTypes } from "./export-types";
import {
  type DownloadExtensionArchive,
  type ExtensionZip,
  extensionArchiveKey,
} from "./extension-archive";
import { type ArchiveIdentity, archiveIdentity } from "./extension-version";
import { type LibraryReview, writeReviewedJson } from "./library/library-data";
import { archiveFingerprint, recordReview } from "./library/library-fingerprint";
import { type LibraryStatus, libraryStatusMessages } from "./library/library-status";
import { LIBRARY_DATA_DIR } from "./library/package-root";
import { printLibraryModules } from "./library/print-library";
import { readNativeTargets } from "./library/sync-native-types";
import { readNativeExpectations } from "./library/target-expectations";
import {
  writeAuthoredLibraryData,
  writeLibraryTargets,
  writeUndocumentedUpstreamLua,
} from "./library-data-fixture";
import { buildLualsRegistryEntries } from "./library-match";
import { librariesDirName } from "./library-materialize";
import { loadVendoredNativeRegistry } from "./library-registry";
import { PROJECT_LOCK_FILE, readProjectLock, writeProjectLock } from "./project-lock";
import {
  type ResolvedExtensionReport,
  type RunResolveOptions,
  runResolve,
  UNTYPED_LIBRARY_GUIDE,
  unknownUpdateNames,
} from "./resolve";
import { runSceneTypes, SCENE_ADDRESSES_DECLARATION } from "./scene-types-command";

// The materialized library surface carries the generating toolchain version;
// these tests defend other behavior, so they derive the name from production.
const LIBRARIES_DIR = librariesDirName(readCliVersion());

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "resolve-"));
}

const ALPHA = `
- name: alpha
  type: table
  desc: Alpha extension.
  members:
  - name: do_alpha
    type: function
    desc: does alpha
    parameters:
      - name: self
        type: object
        desc: the script self
`;

interface FakeArchive {
  entries: string[];
  contents: Record<string, string>;
  comment?: string;
}

const someBytes: DownloadExtensionArchive = async () => ({
  status: "ok",
  bytes: new TextEncoder().encode("z"),
});

// The commit a GitHub archive names in its zip comment.
const COMMIT = "5c33c398e3c1d3ab3c0ee0d5f8f45c4c7c4e0b21";
const OTHER_COMMIT = "0123456789abcdef0123456789abcdef01234567";
const SOME_FILES = "a".repeat(64);
const anyFiles = expect.stringMatching(/^[0-9a-f]{64}$/) as unknown as string;

function makeReadZip(byKey: Record<string, FakeArchive>): (zipPath: string) => ExtensionZip {
  return (zipPath: string) => {
    const archive = byKey[basename(dirname(zipPath))];
    if (archive === undefined) {
      throw new Error(`no fake archive for ${zipPath}`);
    }
    return {
      entries: () => archive.entries,
      read: (entry: string) => {
        // Every listed file can be read: the fingerprint reads each one, whichever lane prints it.
        if (!archive.entries.includes(entry)) {
          throw new Error(`unexpected read of ${entry}`);
        }
        return archive.contents[entry] ?? "";
      },
      comment: () => archive.comment ?? "",
      bytes: (entry: string) => new TextEncoder().encode(archive.contents[entry] ?? ""),
    };
  };
}

function writePins(cwd: string, pins: Record<string, ArchiveIdentity>): string {
  writeProjectLock(cwd, { extensions: pins });
  return join(cwd, PROJECT_LOCK_FILE);
}

function readPins(cwd: string): Readonly<Record<string, ArchiveIdentity>> | undefined {
  const read = readProjectLock(cwd);
  return read.status === "ok" ? read.lock.extensions : undefined;
}

function writeProject(cwd: string, body: string): void {
  writeFileSync(join(cwd, "game.project"), body);
  writeFileSync(
    join(cwd, "tsconfig.json"),
    `${JSON.stringify({ compilerOptions: { types: ["@defold-typescript/types"] } }, null, 2)}\n`,
  );
}

describe("runResolve", () => {
  test("a one-dependency project materializes the surface and reports the extension", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ntitle = Test\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api", "ext/readme.md"],
        contents: { "ext/api/alpha.script_api": ALPHA },
      },
    };

    const result = await runResolve({
      libraryDataDir: null,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });

    expect(result.ok).toBe(true);
    expect(result.materializedSurface).toBe(".defold-types/extensions");
    expect(existsSync(join(cwd, ".defold-types", "extensions", "alpha.d.ts"))).toBe(true);

    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).toContain("extensions");

    expect(result.extensions).toEqual([
      {
        url,
        ref: "unknown",
        provenance: "download",
        namespaces: ["alpha"],
        typeSurface: "extension",
        scriptApiCount: 1,
        sceneSources: 0,
        assetOnly: false,
        resolvedVersion: expect.stringMatching(/^files-sha256:[0-9a-f]{64}$/) as unknown as string,
        resolvedFiles: anyFiles,
        pinStatus: "unpinned",
      },
    ]);
  });

  test("an asset-only dependency writes no type surface and reports assetOnly", async () => {
    const cwd = tmp();
    const url = "https://example.com/asset.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: { entries: ["asset/foo.png"], contents: {} },
    };

    const result = await runResolve({
      libraryDataDir: null,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });

    expect(result.ok).toBe(true);
    expect(result.materializedSurface).toBeNull();
    // The dependency manifest is the one thing written: it records that this run
    // reached the dependency, which is what keeps the scene walk from reporting
    // it as an unresolved hole.
    expect(readdirSync(join(cwd, ".defold-types"))).toEqual(["dependencies"]);
    expect(result.extensions).toEqual([
      {
        url,
        ref: "unknown",
        provenance: "download",
        namespaces: [],
        typeSurface: "none",
        scriptApiCount: 0,
        sceneSources: 0,
        assetOnly: true,
        resolvedVersion: expect.stringMatching(/^files-sha256:[0-9a-f]{64}$/) as unknown as string,
        resolvedFiles: anyFiles,
        pinStatus: "unpinned",
      },
    ]);
  });

  test("a commit pin that differs from the resolved commit reports drift and is kept", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pinned = { commit: OTHER_COMMIT, files: SOME_FILES };
    writePins(cwd, { [url]: pinned });
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
        comment: COMMIT,
      },
    };

    const result = await runResolve({
      libraryDataDir: null,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });

    expect(result.ok).toBe(true);
    expect(result.extensions).toHaveLength(1);
    const report = result.extensions[0];
    expect(report?.resolvedVersion).toBe(`commit:${COMMIT}`);
    expect(report?.pinnedVersion).toBe(`commit:${OTHER_COMMIT}`);
    expect(report?.pinStatus).toBe("drift");
    expect(readPins(cwd)).toEqual({ [url]: pinned });
  });

  test("reports pinStatus:match when the pin equals the resolved archive digest", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
      },
    };
    const first = await runResolve({
      libraryDataDir: null,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });
    expect(first.ok).toBe(true);
    const matchingDigest = first.extensions[0]?.resolvedVersion as string;
    expect(matchingDigest).toMatch(/^files-sha256:[0-9a-f]{64}$/);

    // Re-run with a lockfile that pins the same digest
    writePins(cwd, { [url]: { files: first.extensions[0]?.resolvedFiles as string } });
    const second = await runResolve({
      libraryDataDir: null,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });
    expect(second.ok).toBe(true);
    const report = second.extensions[0] as { pinStatus: string; pinnedVersion?: string };
    expect(report.pinStatus).toBe("match");
    expect(report.pinnedVersion).toBe(matchingDigest);
  });

  test("omits pinnedVersion when the project has no pin for the url", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
      },
    };

    const result = await runResolve({
      libraryDataDir: null,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });

    expect(result.ok).toBe(true);
    const report = result.extensions[0] as {
      resolvedVersion: string;
      pinnedVersion?: string;
      pinStatus: string;
    };
    expect(report.resolvedVersion).toMatch(/^files-sha256:[0-9a-f]{64}$/);
    expect(report.pinnedVersion).toBeUndefined();
    expect(report.pinStatus).toBe("unpinned");
  });

  describe("the project lockfile", () => {
    const url = "https://example.com/alpha.zip";
    const orphanUrl = "https://example.com/gone.zip";
    const livePin = { files: "b".repeat(64) };
    const orphanPin = { commit: OTHER_COMMIT, files: SOME_FILES };
    const recorded = { commit: COMMIT, files: anyFiles };
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
        comment: COMMIT,
      },
    };

    function dependentProject(): string {
      const cwd = tmp();
      writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
      return cwd;
    }

    function run(
      cwd: string,
      options: Partial<RunResolveOptions> = {},
    ): ReturnType<typeof runResolve> {
      return runResolve({
        libraryDataDir: null,
        cwd,
        cacheDir: tmp(),
        download: someBytes,
        readZip: makeReadZip(byKey),
        ...options,
      });
    }

    function countingDownload(): {
      requests: string[];
      download: NonNullable<RunResolveOptions["download"]>;
    } {
      const requests: string[] = [];
      return {
        requests,
        download: async (requested) => {
          requests.push(requested);
          return { status: "ok", bytes: new Uint8Array() };
        },
      };
    }

    const lockBytes = (cwd: string) => readFileSync(join(cwd, PROJECT_LOCK_FILE), "utf8");

    test("a plain run records an absent pin and keeps package.json's bytes and mtime", async () => {
      const cwd = dependentProject();
      const pkgPath = join(cwd, "package.json");
      const original = '{"name":"game"}';
      writeFileSync(pkgPath, original);
      const old = new Date("2020-01-01T00:00:00Z");
      utimesSync(pkgPath, old, old);

      const result = await run(cwd);

      expect(result.ok).toBe(true);
      expect(readPins(cwd)).toEqual({ [url]: recorded });
      expect(readFileSync(pkgPath, "utf8")).toBe(original);
      expect(statSync(pkgPath).mtimeMs).toBe(old.getTime());
    });

    test("a plain run with no package.json leaves it absent", async () => {
      const cwd = dependentProject();

      await run(cwd);

      expect(readPins(cwd)).toEqual({ [url]: recorded });
      expect(existsSync(join(cwd, "package.json"))).toBe(false);
    });

    test("an unparseable package.json neither stops the run nor loses the pins", async () => {
      const cwd = dependentProject();
      const pkgPath = join(cwd, "package.json");
      writeFileSync(pkgPath, "{ not json");

      const result = await run(cwd);

      expect(result.ok).toBe(true);
      expect(readPins(cwd)).toEqual({ [url]: recorded });
      expect(readFileSync(pkgPath, "utf8")).toBe("{ not json");
    });

    test("pins left in package.json are neither read nor removed", async () => {
      const cwd = dependentProject();
      const pkgPath = join(cwd, "package.json");
      const original = JSON.stringify({
        "defold-typescript": {
          extensions: { [url]: livePin },
          libraryData: OTHER_COMMIT,
        },
      });
      writeFileSync(pkgPath, original);

      const result = await run(cwd);

      expect(result.extensions[0]?.pinStatus).toBe("unpinned");
      expect(readPins(cwd)).toEqual({ [url]: recorded });
      expect(readFileSync(pkgPath, "utf8")).toBe(original);
    });

    test("a plain run keeps an existing pin instead of clobbering it", async () => {
      const cwd = dependentProject();
      writePins(cwd, { [url]: livePin });

      await run(cwd);

      expect(readPins(cwd)).toEqual({ [url]: livePin });
    });

    test("a plain run prunes a pin for an undeclared URL", async () => {
      const cwd = dependentProject();
      writePins(cwd, { [url]: livePin, [orphanUrl]: orphanPin });

      const result = await run(cwd);

      expect(result.ok).toBe(true);
      expect(readPins(cwd)).toEqual({ [url]: livePin });
    });

    test("a no-dependency project fetches nothing and leaves an existing lockfile alone", async () => {
      const cwd = tmp();
      writeProject(cwd, "[project]\ntitle = Test\n");
      writePins(cwd, { [orphanUrl]: orphanPin });
      const before = lockBytes(cwd);
      const { download, requests } = countingDownload();

      const result = await run(cwd, { download });

      expect(result.ok).toBe(true);
      expect(requests).toEqual([]);
      expect(lockBytes(cwd)).toBe(before);
    });

    test("a no-dependency project passes a frozen run with no lockfile", async () => {
      const cwd = tmp();
      writeProject(cwd, "[project]\ntitle = Test\n");

      const result = await run(cwd, { freeze: true });

      expect(result.ok).toBe(true);
      expect(existsSync(join(cwd, PROJECT_LOCK_FILE))).toBe(false);
    });

    describe.each([
      { mode: "plain", freeze: false },
      { mode: "frozen", freeze: true },
    ])("an invalid lockfile on a $mode run", ({ freeze }) => {
      const INVALID: readonly (readonly [string, string])[] = [
        ["conflict markers", "<<<<<<< HEAD\n{}\n=======\n{}\n>>>>>>> branch\n"],
        [
          "a retired pin",
          JSON.stringify({ version: 1, extensions: { [url]: `sha256:${"a".repeat(64)}` } }),
        ],
        ["a traversal commit", JSON.stringify({ version: 1, libraryData: "../../x" })],
      ];

      test.each(
        INVALID,
      )("%s fails naming the file, with no request and no write", async (_, bad) => {
        const cwd = dependentProject();
        writeFileSync(join(cwd, PROJECT_LOCK_FILE), bad);
        const { download, requests } = countingDownload();

        const result = await runResolve({ cwd, cacheDir: tmp(), download, freeze });

        expect(result.ok).toBe(false);
        expect(result.error).toContain(PROJECT_LOCK_FILE);
        expect(requests).toEqual([]);
        expect(lockBytes(cwd)).toBe(bad);
        expect(existsSync(join(cwd, ".defold-types"))).toBe(false);
      });

      test("it fails a project with no dependencies too, pruning nothing", async () => {
        const cwd = tmp();
        writeProject(cwd, "[project]\ntitle = Test\n");
        const surface = join(cwd, ".defold-types", "extensions");
        mkdirSync(surface, { recursive: true });
        writeFileSync(join(surface, "alpha.d.ts"), "declare namespace alpha {}\n");
        writeFileSync(join(cwd, PROJECT_LOCK_FILE), "<<<<<<< HEAD\n");

        const result = await run(cwd, { freeze });

        expect(result.ok).toBe(false);
        expect(result.error).toContain(PROJECT_LOCK_FILE);
        expect(existsSync(join(surface, "alpha.d.ts"))).toBe(true);
      });
    });

    test.each([
      { lane: "the data archive", laneOptions: {} },
      { lane: "a set data folder", laneOptions: { libraryDataDir: null } },
    ])("a frozen run with dependencies and no lockfile fails on $lane", async ({ laneOptions }) => {
      const cwd = dependentProject();
      const { download, requests } = countingDownload();

      const result = await runResolve({
        cwd,
        cacheDir: tmp(),
        download,
        freeze: true,
        ...laneOptions,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain(PROJECT_LOCK_FILE);
      expect(result.error).toContain("plain");
      expect(result.error).not.toContain(url);
      expect(requests).toEqual([]);
      expect(existsSync(join(cwd, PROJECT_LOCK_FILE))).toBe(false);
    });

    test("a frozen run fails naming a declared URL the lockfile has no pin for", async () => {
      const cwd = tmp();
      writeProject(cwd, `[project]\ndependencies#0 = ${url}\ndependencies#1 = ${orphanUrl}\n`);
      writePins(cwd, { [url]: livePin });
      const before = lockBytes(cwd);
      const { download, requests } = countingDownload();

      const result = await run(cwd, { download, freeze: true });

      expect(result.ok).toBe(false);
      expect(result.error).toContain(orphanUrl);
      expect(result.error).not.toContain(url);
      expect(requests).toEqual([]);
      expect(lockBytes(cwd)).toBe(before);
    });

    test("a frozen run passes over an undeclared URL's pin and never prunes it", async () => {
      const cwd = dependentProject();
      const fetched = archiveIdentity(
        makeReadZip(byKey)(join(extensionArchiveKey(url), "archive.zip")),
      );
      writePins(cwd, { [url]: fetched, [orphanUrl]: orphanPin });
      const before = lockBytes(cwd);

      const result = await run(cwd, { freeze: true });

      expect(result.ok).toBe(true);
      expect(result.extensions[0]?.pinStatus).toBe("match");
      expect(lockBytes(cwd)).toBe(before);
    });

    test("a frozen run reports drift and writes nothing", async () => {
      const cwd = dependentProject();
      writePins(cwd, { [url]: orphanPin });
      const before = lockBytes(cwd);

      const result = await run(cwd, { freeze: true });

      expect(result.ok).toBe(true);
      expect(result.extensions[0]?.pinStatus).toBe("drift");
      expect(lockBytes(cwd)).toBe(before);
    });
  });

  describe("a frozen run over Defold's library folder", () => {
    const LIB_URL = "https://github.com/owner/lib/archive/refs/heads/main.zip";
    const OTHER_URL = "https://github.com/owner/other/archive/refs/heads/main.zip";
    const lockBytes = (cwd: string) => readFileSync(join(cwd, PROJECT_LOCK_FILE), "utf8");

    const archiveBytes = (comment: string, body = "return 1\n"): Uint8Array =>
      writeZipArchive(
        [
          { name: "lib-main/game.project", text: "[library]\ninclude_dirs = lib\n" },
          { name: "lib-main/lib/core.lua", text: body },
        ],
        { comment },
      );

    const zipName = (url: string, etag = "ZXRhZw") =>
      `${createHash("sha1").update(url).digest("hex")}-${etag}.zip`;

    function pinOf(comment: string): ArchiveIdentity {
      const dir = tmp();
      const path = join(dir, "pin.zip");
      writeFileSync(path, archiveBytes(comment));
      return archiveIdentity(readZip(path));
    }

    function folderProject(
      urls: readonly string[],
      manifest: string,
    ): { cwd: string; lib: string } {
      const cwd = tmp();
      const lib = join(cwd, ".internal", "lib");
      mkdirSync(lib, { recursive: true });
      writeFileSync(join(lib, "dependencies.json"), manifest);
      writeProject(
        cwd,
        `[project]\n${urls.map((url, i) => `dependencies#${i} = ${url}`).join("\n")}\n`,
      );
      return { cwd, lib };
    }

    const listing = (entries: readonly { url: string; commit: string }[]): string =>
      JSON.stringify(entries.map(({ url, commit }) => ({ url, "commit-sha1": commit })));

    function requestLog(): { download: DownloadExtensionArchive; requests: string[] } {
      const requests: string[] = [];
      return {
        requests,
        download: async (requested) => {
          requests.push(requested);
          return { status: "ok", bytes: archiveBytes(OTHER_COMMIT) };
        },
      };
    }

    const frozen = (cwd: string, download: DownloadExtensionArchive, freeze = true) =>
      runResolve({
        cwd,
        cacheDir: tmp(),
        libraryDataDir: null,
        typesRoot: null,
        download,
        freeze,
      });

    test("reads the listed archive, reports it from Defold, and requests nothing", async () => {
      const { cwd, lib } = folderProject([LIB_URL], listing([{ url: LIB_URL, commit: COMMIT }]));
      writeFileSync(join(lib, zipName(LIB_URL)), archiveBytes(COMMIT));
      writePins(cwd, { [LIB_URL]: pinOf(COMMIT) });
      const { download, requests } = requestLog();

      const result = await frozen(cwd, download);

      expect(result.ok).toBe(true);
      expect(result.extensions[0]?.provenance).toBe("defold");
      expect(result.extensions[0]?.pinStatus).toBe("match");
      expect(requests).toEqual([]);
    });

    test("reads a release asset, which lists no commit and carries no comment", async () => {
      const { cwd, lib } = folderProject([LIB_URL], listing([{ url: LIB_URL, commit: "" }]));
      writeFileSync(join(lib, zipName(LIB_URL)), archiveBytes(""));
      writePins(cwd, { [LIB_URL]: pinOf("") });
      const { download, requests } = requestLog();

      const result = await frozen(cwd, download);

      expect(result.ok).toBe(true);
      expect(result.extensions[0]?.provenance).toBe("defold");
      expect(result.extensions[0]?.pinStatus).toBe("match");
      expect(requests).toEqual([]);
    });

    const refusals: readonly (readonly [string, string, (lib: string) => void])[] = [
      [
        "an unlisted URL",
        listing([{ url: `${LIB_URL}?other`, commit: COMMIT }]),
        (lib) => writeFileSync(join(lib, zipName(LIB_URL)), archiveBytes(COMMIT)),
      ],
      [
        "a comment naming another commit",
        listing([{ url: LIB_URL, commit: COMMIT }]),
        (lib) => writeFileSync(join(lib, zipName(LIB_URL)), archiveBytes(OTHER_COMMIT)),
      ],
      [
        "bytes that are not a zip",
        listing([{ url: LIB_URL, commit: COMMIT }]),
        (lib) => writeFileSync(join(lib, zipName(LIB_URL)), "partial download"),
      ],
      [
        "two zips under one URL",
        listing([{ url: LIB_URL, commit: COMMIT }]),
        (lib) => {
          writeFileSync(join(lib, zipName(LIB_URL, "QQ")), archiveBytes(COMMIT));
          writeFileSync(join(lib, zipName(LIB_URL, "Qg")), archiveBytes(OTHER_COMMIT));
        },
      ],
      ["no zip for a listed URL", listing([{ url: LIB_URL, commit: COMMIT }]), () => {}],
      ["a manifest that does not parse", "{ not json", () => {}],
      [
        "an included file that does not inflate",
        listing([{ url: LIB_URL, commit: COMMIT }]),
        (lib) => {
          const bytes = Buffer.from(archiveBytes(COMMIT));
          const name = "lib-main/lib/core.lua";
          // The byte after the local header's name: BTYPE 11 is no deflate block.
          bytes[bytes.indexOf(name) + name.length] = 0xff;
          writeFileSync(join(lib, zipName(LIB_URL)), bytes);
        },
      ],
    ];

    test.each(
      refusals,
    )("%s fails, naming the URL and bob resolve, with no request", async (_, manifest, seed) => {
      const { cwd, lib } = folderProject([LIB_URL], manifest);
      seed(lib);
      writePins(cwd, { [LIB_URL]: pinOf(COMMIT) });
      const before = lockBytes(cwd);
      const { download, requests } = requestLog();

      const result = await frozen(cwd, download);

      expect(result.ok).toBe(false);
      expect(result.error).toContain(LIB_URL);
      expect(result.error).toContain("bob resolve");
      expect(requests).toEqual([]);
      expect(lockBytes(cwd)).toBe(before);
      expect(existsSync(join(cwd, ".defold-types"))).toBe(false);
    });

    test("one refused dependency stops the run before another one writes", async () => {
      const { cwd, lib } = folderProject(
        [LIB_URL, OTHER_URL],
        listing([
          { url: LIB_URL, commit: COMMIT },
          { url: OTHER_URL, commit: COMMIT },
        ]),
      );
      writeFileSync(join(lib, zipName(LIB_URL)), archiveBytes(COMMIT));
      writePins(cwd, { [LIB_URL]: pinOf(COMMIT), [OTHER_URL]: pinOf(COMMIT) });
      const { download, requests } = requestLog();

      const result = await frozen(cwd, download);

      expect(result.ok).toBe(false);
      expect(result.error).toContain(OTHER_URL);
      expect(requests).toEqual([]);
      expect(existsSync(join(cwd, ".defold-types"))).toBe(false);
    });

    test("with no dependencies.json it fetches", async () => {
      const cwd = tmp();
      writeProject(cwd, `[project]\ndependencies#0 = ${LIB_URL}\n`);
      writePins(cwd, { [LIB_URL]: pinOf(OTHER_COMMIT) });
      const { download, requests } = requestLog();

      const result = await frozen(cwd, download);

      expect(result.ok).toBe(true);
      expect(result.extensions[0]?.provenance).toBe("download");
      expect(result.extensions[0]?.pinStatus).toBe("match");
      expect(requests).toEqual([LIB_URL]);
    });

    test("a plain run keeps falling back to a download", async () => {
      const { cwd, lib } = folderProject([LIB_URL], listing([{ url: LIB_URL, commit: COMMIT }]));
      writeFileSync(join(lib, zipName(LIB_URL)), archiveBytes(OTHER_COMMIT));
      const { download, requests } = requestLog();

      const result = await frozen(cwd, download, false);

      expect(result.ok).toBe(true);
      expect(result.extensions[0]?.provenance).toBe("download");
      expect(requests).toEqual([LIB_URL]);
    });
  });

  test("a project with no [dependencies] resolves clean with no writes", async () => {
    const cwd = tmp();
    writeProject(cwd, "[project]\ntitle = Test\n");
    const before = readFileSync(join(cwd, "tsconfig.json"), "utf8");

    const result = await runResolve({
      libraryDataDir: null,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: () => {
        throw new Error("readZip should not be called");
      },
    });

    expect(result.ok).toBe(true);
    expect(result.materializedSurface).toBeNull();
    expect(result.extensions).toEqual([]);
    expect(existsSync(join(cwd, ".defold-types"))).toBe(false);
    expect(readFileSync(join(cwd, "tsconfig.json"), "utf8")).toBe(before);
  });

  test("a missing game.project returns ok:false with an error and writes nothing", async () => {
    const cwd = tmp();

    const result = await runResolve({ libraryDataDir: null, cwd, cacheDir: tmp() });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.materializedSurface).toBeNull();
    expect(result.extensions).toEqual([]);
    expect(existsSync(join(cwd, ".defold-types"))).toBe(false);
  });

  test("a game.project with no [project] section returns ok:false", async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, "game.project"), "[display]\nwidth = 640\n");

    const result = await runResolve({ libraryDataDir: null, cwd, cacheDir: tmp() });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });
});

describe("runResolve pins an archive by its commit and its files", () => {
  const URL = "https://github.com/owner/mylib/archive/main.zip";

  const archive = (commit: string, lua: string, example = "-- example\n"): Uint8Array =>
    writeZipArchive(
      [
        {
          name: "mylib-main/game.project",
          text: "[project]\ntitle = mylib\n\n[library]\ninclude_dirs = mylib\n",
        },
        { name: "mylib-main/mylib/core.lua", text: lua },
        { name: "mylib-main/example/example.script", text: example },
      ],
      { comment: commit },
    );

  const run = (
    cwd: string,
    bytes: Uint8Array,
    options: Partial<RunResolveOptions> = {},
  ): ReturnType<typeof runResolve> =>
    runResolve({
      libraryDataDir: null,
      cwd,
      cacheDir: tmp(),
      download: async () => ({ status: "ok", bytes }),
      ...options,
    });

  async function pinned(bytes: Uint8Array): Promise<string> {
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${URL}\n`);
    await run(cwd, bytes);
    return cwd;
  }

  const lockBytes = (cwd: string) => readFileSync(join(cwd, PROJECT_LOCK_FILE), "utf8");
  const BASE = archive(COMMIT, "return {}\n");
  const EDITED = archive(COMMIT, "return { edited = true }\n");

  test("a new commit's first record writes both fields", async () => {
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${URL}\n`);

    const result = await run(cwd, BASE);

    const report = result.extensions[0];
    expect(report?.pinStatus).toBe("unpinned");
    expect(report?.resolvedVersion).toBe(`commit:${COMMIT}`);
    expect(report?.resolvedFiles).toMatch(/^[0-9a-f]{64}$/);
    expect(readPins(cwd)).toEqual({
      [URL]: { commit: COMMIT, files: report?.resolvedFiles as string },
    });
  });

  test("the same bytes under the same commit match", async () => {
    const cwd = await pinned(BASE);

    const result = await run(cwd, BASE);

    expect(result.extensions[0]?.pinStatus).toBe("match");
    expect(result.extensions[0]?.pinnedFiles).toBe(result.extensions[0]?.resolvedFiles as string);
  });

  test("a change outside what a game can use matches", async () => {
    const cwd = await pinned(BASE);

    const result = await run(cwd, archive(COMMIT, "return {}\n", "-- edited\n"));

    expect(result.extensions[0]?.pinStatus).toBe("match");
  });

  test("changed files under an unchanged commit drift, and the entry is kept", async () => {
    const cwd = await pinned(BASE);
    const before = lockBytes(cwd);

    const result = await run(cwd, EDITED);

    const report = result.extensions[0];
    expect(report?.pinStatus).toBe("drift");
    expect(report?.pinnedVersion).toBe(`commit:${COMMIT}`);
    expect(report?.resolvedVersion).toBe(`commit:${COMMIT}`);
    expect(report?.pinnedFiles).not.toBe(report?.resolvedFiles as string);
    expect(lockBytes(cwd)).toBe(before);
  });

  test("a frozen run reports the same drift and writes nothing", async () => {
    const cwd = await pinned(BASE);
    const before = lockBytes(cwd);

    const result = await run(cwd, EDITED, { freeze: true });

    expect(result.ok).toBe(true);
    expect(result.extensions[0]?.pinStatus).toBe("drift");
    expect(lockBytes(cwd)).toBe(before);
  });

  test("a changed commit over identical files drifts", async () => {
    const cwd = await pinned(BASE);

    const result = await run(cwd, archive(OTHER_COMMIT, "return {}\n"));

    const report = result.extensions[0];
    expect(report?.pinStatus).toBe("drift");
    expect(report?.pinnedVersion).toBe(`commit:${COMMIT}`);
    expect(report?.resolvedVersion).toBe(`commit:${OTHER_COMMIT}`);
    expect(report?.pinnedFiles).toBe(report?.resolvedFiles as string);
  });

  test("--update accepts changed files under an unchanged commit", async () => {
    const cwd = await pinned(BASE);

    const result = await run(cwd, EDITED, { update: true });

    const report = result.extensions[0];
    expect(report?.pinStatus).toBe("match");
    expect(readPins(cwd)).toEqual({
      [URL]: { commit: COMMIT, files: report?.resolvedFiles as string },
    });
  });
});

describe("runResolve shared namespace", () => {
  const FIREBASE_CORE = `
- name: firebase
  type: table
  desc: Firebase core.
  members:
  - name: initialize
    type: function
    desc: starts firebase
`;
  const FIREBASE_ANALYTICS = `
- name: firebase
  type: table
  desc: Firebase analytics.
  members:
  - name: analytics
    type: table
    desc: analytics events
    members:
    - name: log
      type: function
      desc: logs an event
      parameters:
        - name: name
          type: string
          desc: the event name
`;

  test("two dependencies declaring one namespace each write a file and report the merge", async () => {
    const cwd = tmp();
    const coreUrl = "https://example.com/firebase-core.zip";
    const analyticsUrl = "https://example.com/firebase-analytics.zip";
    writeProject(
      cwd,
      `[project]\ntitle = Test\ndependencies#0 = ${coreUrl}\ndependencies#1 = ${analyticsUrl}\n`,
    );
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(coreUrl)]: {
        entries: ["ext/api/firebase.script_api"],
        contents: { "ext/api/firebase.script_api": FIREBASE_CORE },
      },
      [extensionArchiveKey(analyticsUrl)]: {
        entries: ["ext/api/analytics.script_api"],
        contents: { "ext/api/analytics.script_api": FIREBASE_ANALYTICS },
      },
    };

    const result = await runResolve({
      libraryDataDir: null,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });

    expect(result.ok).toBe(true);
    const dir = join(cwd, ".defold-types", "extensions");
    expect(readdirSync(dir).sort()).toEqual([
      "firebase.firebase-analytics.d.ts",
      "firebase.firebase-core.d.ts",
      "index.d.ts",
      "package.json",
    ]);
    expect(readFileSync(join(dir, "firebase.firebase-core.d.ts"), "utf8")).toContain("initialize");
    expect(readFileSync(join(dir, "firebase.firebase-analytics.d.ts"), "utf8")).toContain(
      "namespace analytics",
    );
    expect(result.extensions.map((ext) => ext.namespaces)).toEqual([["firebase"], ["firebase"]]);
    expect(result.sharedNamespaces).toEqual([
      { namespace: "firebase", urls: [coreUrl, analyticsUrl] },
    ]);
  });
});

describe("runResolve library matching", () => {
  const MYLIB = "declare module 'mylib.core' { export const version: string; }\n";

  function seedLibraryData(): string {
    return writeAuthoredLibraryData({ "mylib.core": MYLIB });
  }

  const registry = [{ sourceId: "owner/mylib", modules: ["mylib.core"] }];

  // A plain asset-only archive that ships no Lua modules — a repo-name match
  // against this stays unverified because the module path is absent.
  function assetArchive(url: string): Record<string, FakeArchive> {
    return { [extensionArchiveKey(url)]: { entries: ["asset/foo.png"], contents: {} } };
  }

  // An asset-only archive that actually ships `mylib/core.lua` under the GitHub
  // wrapper dir, so a `mylib` repo-name match verifies against `mylib.core`.
  function verifiedMylibArchive(url: string): Record<string, FakeArchive> {
    return {
      [extensionArchiveKey(url)]: {
        entries: ["mylib-main/mylib/core.lua", "mylib-main/asset/foo.png"],
        contents: {},
      },
    };
  }

  test("an asset-only dependency whose URL matches a vendored library and whose module is present in the archive materializes it and reports it verified", async () => {
    const cwd = tmp();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(verifiedMylibArchive(url)),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(readFileSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"), "utf8")).toBe(
      MYLIB,
    );
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).toContain(LIBRARIES_DIR);
    expect(result.libraries).toEqual([
      {
        url,
        source: "owner/mylib",
        modules: ["mylib.core"],
        provenance: "vendored",
        verified: true,
      },
    ]);
    // The dependency stays asset-only for the extension surface.
    expect(result.extensions[0]?.assetOnly).toBe(true);
  });

  test("one asset-only heroiclabs/nakama-defold dependency materializes all three authored modules against the real corpus", async () => {
    const cwd = tmp();
    const url = "https://github.com/heroiclabs/nakama-defold/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: [
          "nakama-defold-main/nakama/nakama.lua",
          "nakama-defold-main/nakama/engine/defold.lua",
          "nakama-defold-main/nakama/util/log.lua",
          "nakama-defold-main/asset/foo.png",
        ],
        contents: {},
      },
    };

    // No libraryRegistry/libraryDataDir override: this exercises the real
    // merged corpus, where all three modules come from the authored lane under
    // the `nakama-defold` sourceId and must fold into one matched entry, each
    // printed under its module id.
    const result = await runResolve({
      libraryDataDir: LIBRARY_DATA_DIR,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });

    expect(result.ok).toBe(true);
    const librariesDir = join(cwd, ".defold-types", LIBRARIES_DIR);
    for (const file of [
      "nakama.engine.defold.d.ts",
      "nakama.nakama.d.ts",
      "nakama.util.log.d.ts",
    ]) {
      expect(existsSync(join(librariesDir, file))).toBe(true);
    }
    expect(result.libraries).toEqual([
      {
        url,
        source: "heroiclabs/nakama-defold",
        modules: ["nakama.engine.defold", "nakama.nakama", "nakama.util.log"],
        provenance: "vendored",
        verified: true,
      },
    ]);
    expect(result.extensions[0]?.assetOnly).toBe(true);
  });

  test("a repo-name match whose module path is absent from the archive is not materialized and is reported unverified", async () => {
    const cwd = tmp();
    // The URL's repo name (`mylib`) matches the registry sourceId, but the archive
    // ships a different module folder — a collision or a drifted fork.
    const url = "https://github.com/other-owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["mylib-main/somethingelse/init.lua", "mylib-main/asset/foo.png"],
        contents: {},
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    // No library surface is written for an unverified match.
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    expect(result.libraries).toEqual([
      { url, source: "owner/mylib", modules: [], provenance: "vendored", verified: false },
    ]);
    expect(result.extensions[0]?.assetOnly).toBe(true);
  });

  test("an asset-only dependency that matches nothing writes no library surface and reports no libraries", async () => {
    const cwd = tmp();
    const url = "https://example.com/unknown-asset.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(assetArchive(url)),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(result.libraries).toEqual([]);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    expect(result.extensions[0]?.assetOnly).toBe(true);
  });

  test("a declared native extension (.script_api) produces no library surface", async () => {
    const cwd = tmp();
    // The `mylib` archive URL matches the registry sourceId, but the archive is a
    // real .script_api extension, so it is not asset-only and never materializes a
    // library surface.
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(result.libraries).toEqual([]);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    expect(result.extensions[0]?.assetOnly).toBe(false);
  });

  test("an undeclared vendored library is not materialized (types track [dependencies])", async () => {
    const cwd = tmp();
    // The registry knows `mylib`, but the project declares only an unrelated
    // asset-only dependency, so `mylib` must not be materialized.
    const url = "https://example.com/other-asset.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(assetArchive(url)),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(result.libraries).toEqual([]);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"))).toBe(false);
  });

  test("re-running after the matched dependency stops matching prunes the surface and derefs tsconfig", async () => {
    const cwd = tmp();
    const cacheDir = tmp();
    const libraryData = seedLibraryData();
    const matchUrl = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${matchUrl}\n`);

    await runResolve({
      cwd,
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(verifiedMylibArchive(matchUrl)),
      libraryRegistry: registry,
      libraryDataDir: libraryData,
    });
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"))).toBe(true);

    const otherUrl = "https://example.com/other-asset.zip";
    writeFileSync(join(cwd, "game.project"), `[project]\ndependencies#0 = ${otherUrl}\n`);
    const result = await runResolve({
      cwd,
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(assetArchive(otherUrl)),
      libraryRegistry: registry,
      libraryDataDir: libraryData,
    });

    expect(result.ok).toBe(true);
    expect(result.libraries).toEqual([]);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).not.toContain(LIBRARIES_DIR);
  });

  test("removing every [dependencies] entry prunes a previously-materialized surface and derefs tsconfig", async () => {
    const cwd = tmp();
    const cacheDir = tmp();
    const libraryData = seedLibraryData();
    const matchUrl = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${matchUrl}\n`);

    await runResolve({
      cwd,
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(verifiedMylibArchive(matchUrl)),
      libraryRegistry: registry,
      libraryDataDir: libraryData,
    });
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"))).toBe(true);

    writeFileSync(join(cwd, "game.project"), "[project]\ntitle = Test\n");
    const result = await runResolve({
      cwd,
      cacheDir,
      download: someBytes,
      readZip: () => {
        throw new Error("readZip should not be called");
      },
      libraryRegistry: registry,
      libraryDataDir: libraryData,
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).not.toContain(LIBRARIES_DIR);
  });

  // Resolves the verified `mylib` project with library data, runs `between` on
  // the project, then resolves it again with no library data to read.
  async function resolveWithoutLibraryData(between: (cwd: string) => void = () => {}) {
    const cwd = tmp();
    const cacheDir = tmp();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const readZip = makeReadZip(verifiedMylibArchive(url));

    await runResolve({
      cwd,
      cacheDir,
      download: someBytes,
      readZip,
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });
    between(cwd);
    const result = await runResolve({
      cwd,
      cacheDir,
      download: someBytes,
      readZip,
      libraryDataDir: null,
    });

    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    return { cwd, result, types: tsconfig.compilerOptions.types };
  }

  test("missing library data keeps an intact library surface and its tsconfig entry", async () => {
    const { cwd, result, types } = await resolveWithoutLibraryData();

    expect(result.ok).toBe(true);
    expect(readFileSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"), "utf8")).toBe(
      MYLIB,
    );
    expect(types).toContain(LIBRARIES_DIR);
  });

  test("missing library data drops the tsconfig entry of a surface stamped by another toolchain", async () => {
    const { result, types } = await resolveWithoutLibraryData((cwd) => {
      const stampPath = join(cwd, ".defold-types", LIBRARIES_DIR, "package.json");
      const stamp = JSON.parse(readFileSync(stampPath, "utf8")) as Record<string, unknown>;
      writeFileSync(stampPath, JSON.stringify({ ...stamp, version: "999.0.0" }));
    });

    expect(result.ok).toBe(true);
    expect(types).not.toContain(LIBRARIES_DIR);
  });

  test("a confirmed module no library data prints is returned as a warning, not thrown", async () => {
    const cwd = tmp();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const emptyLibraryData = writeAuthoredLibraryData({});

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    let result: Awaited<ReturnType<typeof runResolve>>;
    try {
      result = await runResolve({
        cwd,
        cacheDir: tmp(),
        download: someBytes,
        readZip: makeReadZip(verifiedMylibArchive(url)),
        libraryRegistry: registry,
        libraryDataDir: emptyLibraryData,
      });
    } finally {
      console.warn = originalWarn;
    }

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    expect(result.warnings).toContain(
      "skipping library module mylib.core: no library data prints it",
    );
    expect(warnings).toEqual([]);
  });
});

describe("runResolve corpus match precedes .script_api", () => {
  const MYLIB = "declare module 'mylib.core' { export const version: string; }\n";

  function seedLibraryData(): string {
    return writeAuthoredLibraryData({ "mylib.core": MYLIB });
  }

  // `mylib.core` is published under `alpha`, the shape a fork published under
  // another name takes, so the archive's `alpha` doc is the surface the curated
  // types replace.
  const registry = [
    { sourceId: "owner/mylib", modules: ["mylib.core"], namespaces: { "mylib.core": "alpha" } },
  ];

  const BETA = ALPHA.replaceAll("alpha", "beta");

  // A self-documenting pure-Lua library: it ships the corpus module `mylib.core`
  // *and* its own `.script_api`, so it is not asset-only yet the curated types
  // must still win.
  function selfDocumentingMylib(url: string): Record<string, FakeArchive> {
    return {
      [extensionArchiveKey(url)]: {
        entries: ["mylib-main/mylib/core.lua", "mylib-main/ext/api/alpha.script_api"],
        contents: { "mylib-main/ext/api/alpha.script_api": ALPHA },
      },
    };
  }

  test("a confirmed corpus match carrying its own .script_api materializes the curated types and writes no extension namespace", async () => {
    const cwd = tmp();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(selfDocumentingMylib(url)),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(readFileSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"), "utf8")).toBe(
      MYLIB,
    );
    expect(result.libraries).toEqual([
      {
        url,
        source: "owner/mylib",
        modules: ["mylib.core"],
        provenance: "vendored",
        verified: true,
      },
    ]);

    expect(existsSync(join(cwd, ".defold-types", "extensions"))).toBe(false);
    expect(result.materializedSurface).toBeNull();
    expect(result.extensions[0]?.namespaces).toEqual([]);
  });

  test("a confirmed library keeps the .script_api namespaces it does not publish", async () => {
    const cwd = tmp();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["mylib-main/mylib/core.lua", "mylib-main/native/api/beta.script_api"],
        contents: { "mylib-main/native/api/beta.script_api": BETA },
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(result.libraries).toEqual([
      {
        url,
        source: "owner/mylib",
        modules: ["mylib.core"],
        provenance: "vendored",
        verified: true,
      },
    ]);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"))).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", "extensions", "beta.d.ts"))).toBe(true);
    expect(result.materializedSurface).not.toBeNull();
    expect(result.extensions[0]?.typeSurface).toBe("vendored-library");
    expect(result.extensions[0]?.namespaces).toEqual(["beta"]);
    expect(result.extensions[0]?.scriptApiCount).toBe(1);
  });

  test("a confirmed library drops the .script_api doc of the namespace it publishes and keeps the rest", async () => {
    const cwd = tmp();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: [
          "mylib-main/mylib/core.lua",
          "mylib-main/ext/api/alpha.script_api",
          "mylib-main/native/api/beta.script_api",
        ],
        contents: {
          "mylib-main/ext/api/alpha.script_api": ALPHA,
          "mylib-main/native/api/beta.script_api": BETA,
        },
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(readdirSync(join(cwd, ".defold-types", "extensions")).sort()).toEqual([
      "beta.d.ts",
      "index.d.ts",
      "package.json",
    ]);
    expect(result.extensions[0]?.typeSurface).toBe("vendored-library");
    expect(result.extensions[0]?.namespaces).toEqual(["beta"]);
    expect(result.extensions[0]?.scriptApiCount).toBe(2);
  });

  test("a superseded bundle still unpacks its scene sources and still reports its version and pin status", async () => {
    const cwd = tmp();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: [
          "mylib-main/game.project",
          "mylib-main/mylib/core.lua",
          "mylib-main/ext/api/alpha.script_api",
          "mylib-main/mylib/widget.gui",
        ],
        contents: {
          "mylib-main/game.project": `[project]\ntitle = Mylib\n\n[library]\ninclude_dirs = mylib\n`,
          "mylib-main/ext/api/alpha.script_api": ALPHA,
          "mylib-main/mylib/widget.gui": 'name: "widget"\n',
        },
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    // Suppressing the type surface must not filter the bundle out of the run.
    expect(result.extensions[0]?.sceneSources).toBe(1);
    expect(result.extensions[0]?.resolvedVersion).toMatch(/^files-sha256:[0-9a-f]{64}$/);
    expect(result.extensions[0]?.pinStatus).toBe("unpinned");
    expect(result.extensions[0]?.assetOnly).toBe(false);
  });

  test("a native extension matching no corpus entry still writes its namespace", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", "extensions", "alpha.d.ts"))).toBe(true);
    expect(result.extensions[0]?.namespaces).toEqual(["alpha"]);
    expect(result.libraries).toEqual([]);
  });

  test("a mixed project materializes both surfaces, with only the native extension's namespace", async () => {
    const cwd = tmp();
    const libUrl = "https://github.com/owner/mylib/archive/main.zip";
    const extUrl = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${libUrl}\ndependencies#1 = ${extUrl}\n`);
    const byKey: Record<string, FakeArchive> = {
      ...selfDocumentingMylib(libUrl),
      [extensionArchiveKey(extUrl)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"))).toBe(true);
    expect(readdirSync(join(cwd, ".defold-types", "extensions")).sort()).toEqual([
      "alpha.d.ts",
      "index.d.ts",
      "package.json",
    ]);
    expect(result.extensions.find((e) => e.url === libUrl)?.namespaces).toEqual([]);
    expect(result.extensions.find((e) => e.url === extUrl)?.namespaces).toEqual(["alpha"]);
  });

  test("a repo-name match the archive does not confirm still resolves through the extension arm", async () => {
    const cwd = tmp();
    // The repo name matches `mylib`, but the archive ships no `mylib/core.lua`,
    // so the match stays unconfirmed and must not suppress the namespace.
    const url = "https://github.com/other-owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["mylib-main/somethingelse/init.lua", "mylib-main/ext/api/alpha.script_api"],
        contents: { "mylib-main/ext/api/alpha.script_api": ALPHA },
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    expect(existsSync(join(cwd, ".defold-types", "extensions", "alpha.d.ts"))).toBe(true);
    expect(result.extensions[0]?.namespaces).toEqual(["alpha"]);
    // The bundle got its types from its own `.script_api`, so a bare repo-name
    // collision is not an unverified library the user is missing: no entry, and
    // so no "not materialized" warning.
    expect(result.libraries).toEqual([]);
  });

  test("an existing extensions surface is cleared when its dependency becomes a confirmed match", async () => {
    const cwd = tmp();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    // Seed what an older resolve run left behind for this same dependency.
    const staleDir = join(cwd, ".defold-types", "extensions");
    mkdirSync(staleDir, { recursive: true });
    writeFileSync(join(staleDir, "alpha.d.ts"), "declare namespace alpha {}\n");
    writeFileSync(
      join(cwd, "tsconfig.json"),
      `${JSON.stringify(
        {
          compilerOptions: {
            typeRoots: [".defold-types"],
            types: ["@defold-typescript/types", "extensions"],
          },
        },
        null,
        2,
      )}\n`,
    );

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(selfDocumentingMylib(url)),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"))).toBe(true);
    expect(existsSync(staleDir)).toBe(false);
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).not.toContain("extensions");
    expect(tsconfig.compilerOptions.types).toContain("@defold-typescript/types");
  });

  test("a project keeping one genuine native extension keeps the directory and the tsconfig entry", async () => {
    const cwd = tmp();
    const libUrl = "https://github.com/owner/mylib/archive/main.zip";
    const extUrl = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${libUrl}\ndependencies#1 = ${extUrl}\n`);
    const byKey: Record<string, FakeArchive> = {
      ...selfDocumentingMylib(libUrl),
      [extensionArchiveKey(extUrl)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", "extensions", "alpha.d.ts"))).toBe(true);
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).toContain("extensions");
  });

  test("removing every [dependencies] entry reconciles the extension surface too", async () => {
    const cwd = tmp();
    const cacheDir = tmp();
    const libraryData = seedLibraryData();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
      },
    };

    await runResolve({
      cwd,
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: libraryData,
    });
    expect(existsSync(join(cwd, ".defold-types", "extensions", "alpha.d.ts"))).toBe(true);

    writeFileSync(join(cwd, "game.project"), "[project]\ntitle = Test\n");
    const result = await runResolve({
      cwd,
      cacheDir,
      download: someBytes,
      readZip: () => {
        throw new Error("readZip should not be called");
      },
      libraryRegistry: registry,
      libraryDataDir: libraryData,
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", "extensions"))).toBe(false);
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).not.toContain("extensions");
  });

  test("a .script_api-free corpus match keeps resolving as a vendored library", async () => {
    const cwd = tmp();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["mylib-main/mylib/core.lua", "mylib-main/asset/foo.png"],
        contents: {},
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: registry,
      libraryDataDir: seedLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"))).toBe(true);
    expect(result.extensions[0]?.assetOnly).toBe(true);
    expect(result.extensions[0]?.namespaces).toEqual([]);
  });
});

describe("runResolve curated native extension", () => {
  const DAABBCC_URL = "https://github.com/selimanac/defold-daabbcc/archive/refs/tags/v3.0.8.zip";
  const CURATED =
    '/** @noSelfInFile */\n/** @globalTable */\ndeclare module "daabbcc" {\n  function reset(): void;\n}\n';
  const DOC_DAABBCC = `
- name: daabbcc
  type: table
  desc: Doc-emitted namespace.
  members:
  - name: from_doc
    type: function
    desc: only the doc declares this
`;

  function nativeRegistry(): {
    sourceId: string;
    namespace: string;
    manifestDir: string;
    declarationPath: string;
  }[] {
    const dir = tmp();
    const declarationPath = join(dir, "daabbcc.d.ts");
    writeFileSync(declarationPath, CURATED);
    return [
      {
        sourceId: "selimanac/defold-daabbcc",
        namespace: "daabbcc",
        manifestDir: "daabbcc",
        declarationPath,
      },
    ];
  }

  function daabbccArchive(extra: Partial<FakeArchive> = {}): Record<string, FakeArchive> {
    return {
      [extensionArchiveKey(DAABBCC_URL)]: {
        entries: [
          "defold-daabbcc-3.0.8/daabbcc/ext.manifest",
          "defold-daabbcc-3.0.8/daabbcc/src/extension.cpp",
          "defold-daabbcc-3.0.8/daabbcc/annotation.lua",
          ...(extra.entries ?? []),
        ],
        contents: { ...(extra.contents ?? {}) },
      },
    };
  }

  test("a source-id match confirmed by its ext.manifest writes the curated declaration", async () => {
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${DAABBCC_URL}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(daabbccArchive()),
      libraryRegistry: [],
      libraryDataDir: null,
      nativeRegistry: nativeRegistry(),
    });

    expect(result.ok).toBe(true);
    const extensionsDir = join(cwd, ".defold-types", "extensions");
    expect(readFileSync(join(extensionsDir, "daabbcc.d.ts"), "utf8")).toBe(CURATED);
    expect(readFileSync(join(extensionsDir, "index.d.ts"), "utf8")).toContain(
      'import "./daabbcc";',
    );
    expect(result.materializedSurface).toBe(".defold-types/extensions");
    expect(result.extensions[0]?.typeSurface).toBe("vendored-native");
    expect(result.extensions[0]?.namespaces).toEqual(["daabbcc"]);
    expect(result.extensions[0]?.scriptApiCount).toBe(0);
  });

  test("a source-id match whose archive ships no ext.manifest in the named dir writes nothing", async () => {
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${DAABBCC_URL}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(DAABBCC_URL)]: {
        entries: [
          "defold-daabbcc-3.0.8/other/ext.manifest",
          "defold-daabbcc-3.0.8/daabbcc/annotation.lua",
        ],
        contents: {},
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: [],
      libraryDataDir: null,
      nativeRegistry: nativeRegistry(),
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", "extensions"))).toBe(false);
    expect(result.extensions[0]?.typeSurface).toBe("none");
    expect(result.extensions[0]?.namespaces).toEqual([]);
  });

  test("the curated declaration wins over a .script_api the same archive ships", async () => {
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${DAABBCC_URL}\n`);
    const docPath = "defold-daabbcc-3.0.8/daabbcc/api/daabbcc.script_api";

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(
        daabbccArchive({ entries: [docPath], contents: { [docPath]: DOC_DAABBCC } }),
      ),
      libraryRegistry: [],
      libraryDataDir: null,
      nativeRegistry: nativeRegistry(),
    });

    expect(result.ok).toBe(true);
    const extensionsDir = join(cwd, ".defold-types", "extensions");
    expect(readFileSync(join(extensionsDir, "daabbcc.d.ts"), "utf8")).toBe(CURATED);
    expect(
      readdirSync(extensionsDir)
        .filter((f) => f.endsWith(".d.ts"))
        .sort(),
    ).toEqual(["daabbcc.d.ts", "index.d.ts"]);
    expect(result.extensions[0]?.typeSurface).toBe("vendored-native");
    expect(result.extensions[0]?.namespaces).toEqual(["daabbcc"]);
    expect(result.extensions[0]?.scriptApiCount).toBe(1);
  });
});

describe("runResolve shipped declarations", () => {
  const PIXELS_URL = "https://github.com/king8fisher/defold-pixels/archive/refs/heads/main.zip";
  const MANIFEST = "defold-pixels-main/defold-pixels/ext.manifest";
  const DOC_PATH = "defold-pixels-main/defold-pixels/api/pixels.script_api";
  const MODULE_PATH = "defold-pixels-main/types/pixels.d.ts";
  const GLOBAL_PATH = "defold-pixels-main/types/pixels.global.d.ts";
  const DOC_PIXELS = `
- name: pixels
  type: table
  desc: Doc-emitted namespace.
  members:
  - name: fill
    type: function
    desc: only the doc declares this
`;
  const GOOD_MODULE = `/** @noResolution */
declare module "pixels" {
  export function fill(buf: ReturnType<typeof buffer.create>): LuaMultiReturn<[number, number]>;
}
`;
  const GOOD_GLOBAL = `declare const pixels: typeof import("pixels");
`;
  const BAD_MODULE = `/** @noResolution */
declare module "pixels" {
  export function fill(h: hash): void;
}
`;
  const CURATED =
    '/** @noSelfInFile */\n/** @globalTable */\ndeclare module "pixels" {\n  function curated(): void;\n}\n';

  function pixelsArchive(files: Record<string, string>): Record<string, FakeArchive> {
    return {
      [extensionArchiveKey(PIXELS_URL)]: {
        entries: [MANIFEST, DOC_PATH, ...Object.keys(files)],
        contents: { [DOC_PATH]: DOC_PIXELS, ...files },
      },
    };
  }

  async function resolvePixels(
    byKey: Record<string, FakeArchive>,
    extra: Partial<RunResolveOptions> = {},
  ): Promise<{ cwd: string; result: Awaited<ReturnType<typeof runResolve>> }> {
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${PIXELS_URL}\n`);
    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: [],
      libraryDataDir: null,
      nativeRegistry: [],
      ...extra,
    });
    return { cwd, result };
  }

  function writtenDeclarations(cwd: string): string[] {
    return readdirSync(join(cwd, ".defold-types", "extensions"))
      .filter((file) => file.endsWith(".d.ts"))
      .sort();
  }

  function writtenShipped(cwd: string): string[] {
    const root = join(cwd, ".defold-types", "extensions", "shipped");
    if (!existsSync(root)) {
      return [];
    }
    return readdirSync(root)
      .flatMap((folder) =>
        readdirSync(join(root, folder)).map((file) => `shipped/${folder}/${file}`),
      )
      .sort();
  }

  const PIXELS_SHIPPED = ["shipped/defold-pixels/pixels.d.ts"];

  function shippedWarnings(warnings: readonly string[]): string[] {
    return warnings.filter((line) => line.startsWith("shipped types from"));
  }

  test("an archive's module-form types install verbatim and its global file is skipped", async () => {
    const { cwd, result } = await resolvePixels(
      pixelsArchive({ [MODULE_PATH]: GOOD_MODULE, [GLOBAL_PATH]: GOOD_GLOBAL }),
    );

    expect(result.ok).toBe(true);
    const extensionsDir = join(cwd, ".defold-types", "extensions");
    const shippedDir = join(extensionsDir, "shipped", "defold-pixels");
    expect(readFileSync(join(shippedDir, "pixels.d.ts"), "utf8")).toBe(GOOD_MODULE);
    expect(existsSync(join(shippedDir, "pixels.global.d.ts"))).toBe(false);
    expect(writtenDeclarations(cwd)).toEqual(["index.d.ts"]);
    expect(writtenShipped(cwd)).toEqual(PIXELS_SHIPPED);
    const index = readFileSync(join(extensionsDir, "index.d.ts"), "utf8");
    expect(index).toContain('import "./shipped/defold-pixels/pixels";');
    expect(index).not.toContain("pixels.global");
    expect(result.extensions[0]?.typeSurface).toBe("shipped");
    expect(result.extensions[0]?.namespaces).toEqual(["pixels"]);
    expect(result.extensions[0]?.scriptApiCount).toBe(1);
    expect(shippedWarnings(result.warnings)).toEqual([]);
  });

  test("a skipped global file is not checked", async () => {
    const { cwd, result } = await resolvePixels(
      pixelsArchive({ [MODULE_PATH]: GOOD_MODULE, [GLOBAL_PATH]: "declare const pixels: hash;\n" }),
    );

    expect(result.ok).toBe(true);
    expect(result.extensions[0]?.typeSurface).toBe("shipped");
    expect(shippedWarnings(result.warnings)).toEqual([]);
    expect(writtenShipped(cwd)).toEqual(PIXELS_SHIPPED);
  });

  test("a project reaches the module by import and has no pixels global", async () => {
    const { cwd } = await resolvePixels(
      pixelsArchive({ [MODULE_PATH]: GOOD_MODULE, [GLOBAL_PATH]: GOOD_GLOBAL }),
    );

    expect(
      usageDiagnostics(
        cwd,
        'import * as defold_pixels from "pixels";\ndeclare const b: ReturnType<typeof buffer.create>;\nconst r: LuaMultiReturn<[number, number]> = defold_pixels.fill(b);\n// @ts-expect-error\npixels.fill(b);\nexport { r };\n',
      ),
    ).toEqual([]);
  });

  test("shipped types win over a curated native target the archive confirms", async () => {
    const declarationPath = join(tmp(), "pixels.d.ts");
    writeFileSync(declarationPath, CURATED);

    const { cwd, result } = await resolvePixels(
      pixelsArchive({ [MODULE_PATH]: GOOD_MODULE, [GLOBAL_PATH]: GOOD_GLOBAL }),
      {
        nativeRegistry: [
          {
            sourceId: "king8fisher/defold-pixels",
            namespace: "pixels",
            manifestDir: "defold-pixels",
            declarationPath,
          },
        ],
      },
    );

    expect(result.ok).toBe(true);
    expect(
      readFileSync(
        join(cwd, ".defold-types", "extensions", "shipped", "defold-pixels", "pixels.d.ts"),
        "utf8",
      ),
    ).toBe(GOOD_MODULE);
    expect(writtenDeclarations(cwd)).toEqual(["index.d.ts"]);
    expect(writtenShipped(cwd)).toEqual(PIXELS_SHIPPED);
    expect(result.extensions[0]?.typeSurface).toBe("shipped");
  });

  test("an exported curated native target installs as shipped types with the same bytes", async () => {
    const nativeRegistry = loadVendoredNativeRegistry(LIBRARY_DATA_DIR);
    const target = nativeRegistry[0];
    if (target === undefined) {
      throw new Error("the committed corpus has no native target");
    }
    const exported = tmp();
    const { written } = await runExportTypes({
      library: target.sourceId,
      cwd: exported,
      libraryDataDir: LIBRARY_DATA_DIR,
    });
    const url = `https://github.com/${target.sourceId}/archive/refs/heads/main.zip`;
    const wrapper = `${target.sourceId.split("/").pop()}-main`;
    const contents = Object.fromEntries(
      written.map((file) => [`${wrapper}/${file}`, readFileSync(join(exported, file), "utf8")]),
    );
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip({
        [extensionArchiveKey(url)]: {
          entries: [`${wrapper}/${target.manifestDir}/ext.manifest`, ...Object.keys(contents)],
          contents,
        },
      }),
      libraryRegistry: [],
      libraryDataDir: null,
      nativeRegistry,
    });

    expect(result.ok).toBe(true);
    expect(shippedWarnings(result.warnings)).toEqual([]);
    expect(result.extensions[0]?.typeSurface).toBe("shipped");
    expect(result.extensions[0]?.namespaces).toEqual(
      written.map((file) => basename(file, ".d.ts")).sort(),
    );
    const installed = writtenShipped(cwd);
    expect(installed).toHaveLength(1);
    expect(readFileSync(join(cwd, ".defold-types", "extensions", installed[0] ?? ""), "utf8")).toBe(
      readFileSync(target.declarationPath, "utf8"),
    );
  });

  test("shipped types win over a vendored library match on an asset-only archive", async () => {
    const url = "https://github.com/owner/mylib/archive/main.zip";
    const shippedPath = "mylib-main/types/mylib.core.d.ts";
    const shipped = 'declare module "mylib.core" {\n  export const shipped: string;\n}\n';
    const libraryData = writeAuthoredLibraryData({
      "mylib.core": "declare module 'mylib.core' { export const version: string; }\n",
    });
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip({
        [extensionArchiveKey(url)]: {
          entries: ["mylib-main/mylib/core.lua", shippedPath],
          contents: { [shippedPath]: shipped },
        },
      }),
      libraryRegistry: [{ sourceId: "owner/mylib", modules: ["mylib.core"] }],
      libraryDataDir: libraryData,
      nativeRegistry: [],
    });

    expect(result.ok).toBe(true);
    expect(
      readFileSync(
        join(cwd, ".defold-types", "extensions", "shipped", "mylib", "mylib.core.d.ts"),
        "utf8",
      ),
    ).toBe(shipped);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    expect(result.libraries).toEqual([]);
    expect(result.extensions[0]?.assetOnly).toBe(true);
    expect(result.extensions[0]?.typeSurface).toBe("shipped");
    expect(result.extensions[0]?.namespaces).toEqual(["mylib.core"]);
  });

  test("shipped types that do not compile fall back to the .script_api with one warning", async () => {
    const { cwd, result } = await resolvePixels(pixelsArchive({ [MODULE_PATH]: BAD_MODULE }));

    expect(result.ok).toBe(true);
    const written = readFileSync(join(cwd, ".defold-types", "extensions", "pixels.d.ts"), "utf8");
    expect(written).toContain("only the doc declares this");
    expect(writtenDeclarations(cwd)).toEqual(["index.d.ts", "pixels.d.ts"]);
    expect(writtenShipped(cwd)).toEqual([]);
    expect(result.extensions[0]?.typeSurface).toBe("extension");
    expect(result.extensions[0]?.namespaces).toEqual(["pixels"]);
    const warnings = shippedWarnings(result.warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(PIXELS_URL);
    expect(warnings[0]).toContain("'hash'");
  });

  test("a .d.ts outside the root types folder is not a shipped surface", async () => {
    const { cwd, result } = await resolvePixels(
      pixelsArchive({
        "defold-pixels-main/types/sub/x.d.ts": GOOD_MODULE,
        "defold-pixels-main/src/y.d.ts": GOOD_GLOBAL,
      }),
    );

    expect(result.ok).toBe(true);
    expect(writtenDeclarations(cwd)).toEqual(["index.d.ts", "pixels.d.ts"]);
    expect(writtenShipped(cwd)).toEqual([]);
    expect(readFileSync(join(cwd, ".defold-types", "extensions", "pixels.d.ts"), "utf8")).toContain(
      "only the doc declares this",
    );
    expect(result.extensions[0]?.typeSurface).toBe("extension");
  });

  test("with no engine surface to check against, shipped types install unchecked", async () => {
    const { cwd, result } = await resolvePixels(pixelsArchive({ [MODULE_PATH]: BAD_MODULE }), {
      typesRoot: null,
    });

    expect(result.ok).toBe(true);
    expect(
      readFileSync(
        join(cwd, ".defold-types", "extensions", "shipped", "defold-pixels", "pixels.d.ts"),
        "utf8",
      ),
    ).toBe(BAD_MODULE);
    expect(result.extensions[0]?.typeSurface).toBe("shipped");
    const warnings = shippedWarnings(result.warnings);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(PIXELS_URL);
    expect(warnings[0]).toContain("not checked");
  });

  const RELIB_URL = "https://github.com/acme/relib/archive/refs/heads/main.zip";
  const RELIB_FILES: Record<string, string> = {
    "relib-main/types/index.d.ts": 'export * from "./foo";\n',
    "relib-main/types/foo.d.ts": "export declare function bar(): number;\n",
    "relib-main/types/relib.global.d.ts": 'declare const relib: typeof import("./index");\n',
  };
  const ALIB_URL = "https://github.com/acme/alib/archive/refs/heads/main.zip";
  const ALIB_ENTRY = "alib-main/types/alib.d.ts";
  const BLIB_URL = "https://github.com/acme/blib/archive/refs/heads/main.zip";
  const BLIB_ENTRY = "blib-main/types/blib.d.ts";
  const CLIB_URL = "https://github.com/acme/clib/archive/refs/heads/main.zip";
  const CLIB_ENTRY = "clib-main/types/clib.d.ts";

  function typesOnlyArchive(files: Record<string, string>): FakeArchive {
    return { entries: Object.keys(files), contents: files };
  }

  const TYPES_ONLY_ARCHIVES: Record<string, FakeArchive> = {
    [extensionArchiveKey(RELIB_URL)]: typesOnlyArchive(RELIB_FILES),
    [extensionArchiveKey(ALIB_URL)]: typesOnlyArchive({
      [ALIB_ENTRY]:
        'declare module "alib" {\n  export function a(): number;\n}\ndeclare const dup: number;\n',
    }),
    [extensionArchiveKey(BLIB_URL)]: typesOnlyArchive({
      [BLIB_ENTRY]: 'declare const b: typeof import("alib");\n',
    }),
    [extensionArchiveKey(CLIB_URL)]: typesOnlyArchive({
      [CLIB_ENTRY]: "declare const dup: string;\n",
    }),
  };

  async function resolveUrls(
    cwd: string,
    urls: readonly string[],
  ): Promise<Awaited<ReturnType<typeof runResolve>>> {
    writeProject(
      cwd,
      `[project]\n${urls.map((url, index) => `dependencies#${index} = ${url}`).join("\n")}\n`,
    );
    return runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(TYPES_ONLY_ARCHIVES),
      libraryRegistry: [],
      libraryDataDir: null,
      nativeRegistry: [],
    });
  }

  function usageDiagnostics(cwd: string, usage: string): string[] {
    const typesRoot = resolveTypesPackageRoot();
    if (typesRoot === null) {
      throw new Error("@defold-typescript/types is not resolvable from the CLI package");
    }
    const usagePath = join(cwd, "usage.ts");
    writeFileSync(usagePath, usage);
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      types: [],
      target: ts.ScriptTarget.ESNext,
      lib: ["lib.esnext.d.ts"],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    };
    const program = ts.createProgram(
      [
        usagePath,
        join(typesRoot, "index.d.ts"),
        join(cwd, ".defold-types", "extensions", "index.d.ts"),
      ],
      options,
      ts.createCompilerHost(options),
    );
    const sourceFile = program.getSourceFile(usagePath);
    return [
      ...program.getSyntacticDiagnostics(sourceFile),
      ...program.getSemanticDiagnostics(sourceFile),
    ].map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  }

  test("shipped files keep their names, so a consumer reaches what a shipped index re-exports", async () => {
    const cwd = tmp();
    const result = await resolveUrls(cwd, [RELIB_URL]);

    expect(result.ok).toBe(true);
    expect(result.extensions[0]?.typeSurface).toBe("shipped");
    expect(result.extensions[0]?.namespaces).toEqual(["foo", "index", "relib.global"]);
    expect(shippedWarnings(result.warnings)).toEqual([]);
    expect(writtenShipped(cwd)).toEqual([
      "shipped/relib/foo.d.ts",
      "shipped/relib/index.d.ts",
      "shipped/relib/relib.global.d.ts",
    ]);
    for (const [entry, contents] of Object.entries(RELIB_FILES)) {
      expect(
        readFileSync(
          join(cwd, ".defold-types", "extensions", "shipped", "relib", basename(entry)),
          "utf8",
        ),
      ).toBe(contents);
    }
    expect(
      usageDiagnostics(
        cwd,
        "const n: number = relib.bar();\n// @ts-expect-error\nconst s: string = relib.bar();\nexport { n, s };\n",
      ),
    ).toEqual([]);
  });

  test("each dependency's shipped files are checked on their own", async () => {
    const cwd = tmp();
    const result = await resolveUrls(cwd, [ALIB_URL, BLIB_URL, CLIB_URL]);

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", "extensions", "shipped", "blib"))).toBe(false);
    const surface = (url: string) => result.extensions.find((e) => e.url === url)?.typeSurface;
    expect(surface(ALIB_URL)).toBe("shipped");
    expect(surface(CLIB_URL)).toBe("shipped");
    expect(surface(BLIB_URL)).toBe("none");
    const warnings = shippedWarnings(result.warnings);
    expect(warnings.filter((w) => w.includes(ALIB_URL))).toEqual([]);
    expect(warnings.filter((w) => w.includes(CLIB_URL))).toEqual([]);
    const blibWarnings = warnings.filter((w) => w.includes(BLIB_URL));
    expect(blibWarnings).toHaveLength(1);
    expect(blibWarnings[0]).toContain("'alib'");
  });

  test("a dependency's shipped folder leaves with it", async () => {
    const cwd = tmp();
    await resolveUrls(cwd, [RELIB_URL, ALIB_URL]);
    expect(existsSync(join(cwd, ".defold-types", "extensions", "shipped", "relib"))).toBe(true);

    const result = await resolveUrls(cwd, [ALIB_URL]);

    expect(result.ok).toBe(true);
    expect(writtenShipped(cwd)).toEqual(["shipped/alib/alib.d.ts"]);
  });
});

describe("runResolve each curated native target through the shipped native registry", () => {
  const nativeRegistry = loadVendoredNativeRegistry(LIBRARY_DATA_DIR);

  async function resolveNative(
    url: string,
    manifest: string,
  ): Promise<{ cwd: string; result: Awaited<ReturnType<typeof runResolve>> }> {
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip({
        [extensionArchiveKey(url)]: { entries: [manifest], contents: {} },
      }),
      libraryRegistry: [],
      libraryDataDir: null,
      nativeRegistry,
    });
    return { cwd, result };
  }

  const declarations = new Map(
    readNativeTargets(LIBRARY_DATA_DIR).map((target) => [target.namespace, target.declaration]),
  );
  for (const [namespace, { resolve }] of readNativeExpectations()) {
    const written = join(".defold-types", "extensions", `${namespace}.d.ts`);

    test(`${namespace}: an archive confirmed by its manifest gets the shipped declaration`, async () => {
      const { cwd, result } = await resolveNative(resolve.archiveUrl, resolve.confirmedManifest);

      expect(result.ok).toBe(true);
      expect(readFileSync(join(cwd, written), "utf8")).toBe(
        readFileSync(join(LIBRARY_DATA_DIR, declarations.get(namespace) as string), "utf8"),
      );
      expect(result.extensions[0]?.typeSurface).toBe("vendored-native");
      expect(result.extensions[0]?.namespaces).toEqual([namespace]);
    });

    test(`${namespace}: a repo match with its manifest elsewhere writes no declaration`, async () => {
      const { cwd, result } = await resolveNative(resolve.archiveUrl, resolve.misplacedManifest);

      expect(result.ok).toBe(true);
      expect(existsSync(join(cwd, written))).toBe(false);
      expect(result.extensions).toHaveLength(1);
      expect(result.extensions[0]?.typeSurface).not.toBe("vendored-native");
    });
  }
});

describe("runResolve druid LuaLS library", () => {
  const DRUID = "declare module 'druid.druid' { export const version: string; }\n";

  function seedDruidLibraryData(): string {
    return writeAuthoredLibraryData({ "druid.druid": DRUID });
  }

  const druidRegistry = [
    {
      sourceId: "insality/druid",
      modules: ["druid.druid"],
      namespaces: { "druid.druid": "druid" },
    },
  ];

  // An asset-only archive that ships `druid/druid.lua` under the GitHub wrapper
  // dir, so the `druid` repo-name match verifies against `druid.druid`.
  function verifiedDruidArchive(url: string): Record<string, FakeArchive> {
    return {
      [extensionArchiveKey(url)]: {
        entries: ["druid-1.2.5/druid/druid.lua", "druid-1.2.5/asset/foo.png"],
        contents: {},
      },
    };
  }

  test("materializes druid.druid under its module id and reports it verified", async () => {
    const cwd = tmp();
    const url = "https://github.com/Insality/druid/archive/1.2.5.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(verifiedDruidArchive(url)),
      libraryRegistry: druidRegistry,
      libraryDataDir: seedDruidLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(
      readFileSync(join(cwd, ".defold-types", LIBRARIES_DIR, "druid.druid.d.ts"), "utf8"),
    ).toBe(DRUID);
    expect(result.libraries).toEqual([
      {
        url,
        source: "insality/druid",
        modules: ["druid.druid"],
        provenance: "vendored",
        verified: true,
      },
    ]);
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).toContain(LIBRARIES_DIR);
  });

  test("a druid archive not shipping druid.druid stays unverified and writes no surface", async () => {
    const cwd = tmp();
    const url = "https://github.com/Insality/druid/archive/1.2.5.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["druid-1.2.5/somethingelse/init.lua"],
        contents: {},
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      libraryRegistry: druidRegistry,
      libraryDataDir: seedDruidLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    expect(result.libraries).toEqual([
      { url, source: "insality/druid", modules: [], provenance: "vendored", verified: false },
    ]);
  });
});

describe("runResolve prints a LuaLS library from the dependency's archive", () => {
  const url = "https://github.com/paweljarosz/lua-immutable/archive/v1.1.zip";
  const wrapper = "lua-immutable-1.1";
  const own = "immutable/immutable.lua";
  const pinnedSource = readFileSync(
    join(LIBRARY_DATA_DIR, "paweljarosz/lua-immutable", "source", "immutable", own),
    "utf8",
  );
  const insertBefore = "-- Metatable for the Immutable module";

  function withFunction(lines: readonly string[]): string {
    const source = pinnedSource.replace(insertBefore, `${lines.join("\n")}\n\n${insertBefore}`);
    if (source === pinnedSource) throw new Error(`insertion point missing from ${own}`);
    return source;
  }

  async function resolveWith(moduleSource: string) {
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const entry = `${wrapper}/${own}`;
    const result = await runResolve({
      libraryDataDir: LIBRARY_DATA_DIR,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip({
        [extensionArchiveKey(url)]: {
          entries: [`${wrapper}/`, entry, `${wrapper}/README.md`],
          contents: { [entry]: moduleSource },
        },
      }),
    });
    const printed = readFileSync(
      join(cwd, ".defold-types", LIBRARIES_DIR, "immutable.immutable.d.ts"),
      "utf8",
    );
    return { result, printed };
  }

  test("the materialized module declares a function only the archive has", async () => {
    const { result, printed } = await resolveWith(
      withFunction([
        "---Probes that resolve prints the archive",
        "---@param\tvalue\tnumber\t\t@value to probe",
        "---@return\t\t\t\t\tboolean\t\t\t\t@true always",
        "function Immutable.print_probe(value)",
        "\treturn true",
        "end",
      ]),
    );

    expect(result.ok).toBe(true);
    expect(printed).toContain("export function print_probe(this: void, value: number): boolean;");
    expect(result.libraries).toEqual([
      {
        url,
        source: "paweljarosz/lua-immutable",
        modules: ["immutable.immutable"],
        provenance: "vendored",
        verified: true,
      },
    ]);
    expect(result.warnings.filter((warning) => warning.startsWith("printed "))).toEqual([]);
  });

  test("an archive the printer cannot read prints the pinned sources and says why", async () => {
    const { result, printed } = await resolveWith(
      withFunction([
        "---@param\tvalue\tvmath.print_probe\t\t@a type no printer maps",
        "function Immutable.print_probe(value)",
        "end",
      ]),
    );
    const pinned = await printLibraryModules(LIBRARY_DATA_DIR, ["immutable.immutable"], null);

    expect(result.ok).toBe(true);
    expect(printed).toBe(pinned.printed[0]?.contents as string);
    expect(result.warnings.filter((warning) => warning.startsWith("printed "))).toEqual([
      `printed immutable.immutable from the v1.1 sources pinned in library data, not from ${url}: luals type mapper: unmapped Defold core token "vmath.print_probe" - extend CORE_TYPE_RENAMES or the target's typeRenames.`,
    ]);
  });
});

describe("runResolve a multi-module same-repo LuaLS library", () => {
  const SAVER = "declare module 'saver.saver' { export const version: string; }\n";
  const STORAGE = "declare module 'saver.storage' { export const version: string; }\n";

  // defold-saver ships two modules (saver.saver, saver.storage) from one repo,
  // so the registry must group them into a single entry carrying both.
  const saverRegistry = buildLualsRegistryEntries({
    targets: [
      {
        repo: "https://github.com/Insality/defold-saver",
        moduleId: "saver.saver",
        namespace: "saver.saver",
      },
      {
        repo: "https://github.com/Insality/defold-saver",
        moduleId: "saver.storage",
        namespace: "saver.storage",
      },
    ],
  });

  function seedSaverLibraryData(): string {
    return writeAuthoredLibraryData({ "saver.saver": SAVER, "saver.storage": STORAGE });
  }

  // An asset-only archive shipping both saver Lua modules under the GitHub
  // wrapper dir, so the `defold-saver` match verifies both modules.
  function verifiedSaverArchive(url: string): Record<string, FakeArchive> {
    return {
      [extensionArchiveKey(url)]: {
        entries: [
          "defold-saver-8/saver/saver.lua",
          "defold-saver-8/saver/storage.lua",
          "defold-saver-8/asset/foo.png",
        ],
        contents: {},
      },
    };
  }

  test("materializes every module of a same-repo multi-module library and reports them all verified", async () => {
    const cwd = tmp();
    const url = "https://github.com/Insality/defold-saver/archive/8.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(verifiedSaverArchive(url)),
      libraryRegistry: saverRegistry,
      libraryDataDir: seedSaverLibraryData(),
    });

    expect(result.ok).toBe(true);
    expect(
      readFileSync(join(cwd, ".defold-types", LIBRARIES_DIR, "saver.saver.d.ts"), "utf8"),
    ).toBe(SAVER);
    expect(
      readFileSync(join(cwd, ".defold-types", LIBRARIES_DIR, "saver.storage.d.ts"), "utf8"),
    ).toBe(STORAGE);
    expect(result.libraries).toEqual([
      {
        url,
        source: "insality/defold-saver",
        modules: ["saver.saver", "saver.storage"],
        provenance: "vendored",
        verified: true,
      },
    ]);
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).toContain(LIBRARIES_DIR);
  });
});

describe("runResolve dependency scene sources", () => {
  const DRUID_GAME_PROJECT = `[project]\ntitle = Druid\n\n[library]\ninclude_dirs = druid\n`;
  const DRUID_COLLECTION = 'name: "druid"\n';
  // A window the library opens as its own world, and a bean it spawns copies of:
  // between them the two reference kinds that say which world a collection is.
  const WINDOW_GO = `components {
  id: "proxy"
  component: "/druid/window.collectionproxy"
}
components {
  id: "spawner"
  component: "/druid/spawner.collectionfactory"
}
`;
  const WINDOW_PROXY = 'collection: "/druid/window.collection"\nexclude: false\n';
  const WINDOW_COLLECTION = `name: "window"
instances {
  id: "hud"
  prototype: "/druid/window.go"
}
`;
  const SPAWNER_FACTORY = 'prototype: "/druid/bean.collection"\nload_dynamically: false\n';
  const BEAN_COLLECTION = `name: "bean"
instances {
  id: "bean"
  prototype: "/druid/window.go"
}
`;

  function druidArchive(url: string): Record<string, FakeArchive> {
    return {
      [extensionArchiveKey(url)]: {
        entries: [
          "druid-1.2.3/game.project",
          "druid-1.2.3/druid/druid.collection",
          "druid-1.2.3/druid/druid.lua",
          "druid-1.2.3/druid/window.go",
          "druid-1.2.3/druid/window.collectionproxy",
          "druid-1.2.3/druid/window.collection",
          "druid-1.2.3/druid/spawner.collectionfactory",
          "druid-1.2.3/druid/bean.collection",
          "druid-1.2.3/example/demo.collection",
        ],
        contents: {
          "druid-1.2.3/game.project": DRUID_GAME_PROJECT,
          "druid-1.2.3/druid/druid.collection": DRUID_COLLECTION,
          "druid-1.2.3/druid/window.go": WINDOW_GO,
          "druid-1.2.3/druid/window.collectionproxy": WINDOW_PROXY,
          "druid-1.2.3/druid/window.collection": WINDOW_COLLECTION,
          "druid-1.2.3/druid/spawner.collectionfactory": SPAWNER_FACTORY,
          "druid-1.2.3/druid/bean.collection": BEAN_COLLECTION,
        },
      },
    };
  }

  test("each dependency's shared scenes land under its archive key at the merged path", async () => {
    const cwd = tmp();
    const url = "https://github.com/Insality/druid/archive/1.2.3.zip";
    writeProject(cwd, `[project]\ntitle = Test\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(druidArchive(url)),
      libraryRegistry: [],
      libraryDataDir: null,
    });

    expect(result.ok).toBe(true);
    const key = extensionArchiveKey(url);
    const root = join(cwd, ".defold-types", "dependencies");
    expect(readFileSync(join(root, key, "druid", "druid.collection"), "utf8")).toBe(
      DRUID_COLLECTION,
    );
    // The components that name a collection without instancing it travel with
    // the collections they classify.
    expect(readFileSync(join(root, key, "druid", "window.collectionproxy"), "utf8")).toBe(
      WINDOW_PROXY,
    );
    expect(readFileSync(join(root, key, "druid", "spawner.collectionfactory"), "utf8")).toBe(
      SPAWNER_FACTORY,
    );
    expect(existsSync(join(root, key, "example", "demo.collection"))).toBe(false);
    expect(existsSync(join(root, key, "druid", "druid.lua"))).toBe(false);
    expect(JSON.parse(readFileSync(join(root, "dependencies.json"), "utf8"))).toEqual({
      dependencies: [{ key, url }],
    });
    expect(result.extensions[0]?.sceneSources).toBe(6);
  });

  test("a proxied library collection reaches the declaration under its own socket", async () => {
    const cwd = tmp();
    const url = "https://github.com/Insality/druid/archive/1.2.3.zip";
    writeProject(cwd, `[project]\ntitle = Test\ndependencies#0 = ${url}\n`);

    const resolved = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(druidArchive(url)),
      libraryRegistry: [],
      libraryDataDir: null,
    });
    expect(resolved.ok).toBe(true);

    const scenes = runSceneTypes({ cwd });
    const declaration = readFileSync(join(cwd, SCENE_ADDRESSES_DECLARATION), "utf8");

    // The proxy opens `window.collection` as its own world, so its objects are
    // addressed under that collection's `name:` and never bare.
    expect(declaration).toContain('"window:/hud": true;');
    expect(declaration).not.toContain('"/hud": true;');
    // A collection factory's prototype has no static address at all.
    expect(declaration).not.toContain("/bean");

    const unclassified = scenes.incomplete.join("\n");
    expect(unclassified).not.toContain("druid/window.collectionproxy");
    expect(unclassified).not.toContain("druid/spawner.collectionfactory");
    expect(unclassified).not.toContain("druid/window.collection:");
    expect(unclassified).not.toContain("druid/bean.collection:");
  });

  test("removing every dependency removes the materialized dependency surface", async () => {
    const cwd = tmp();
    const url = "https://github.com/Insality/druid/archive/1.2.3.zip";
    writeProject(cwd, `[project]\ntitle = Test\ndependencies#0 = ${url}\n`);
    await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(druidArchive(url)),
      libraryRegistry: [],
      libraryDataDir: null,
    });
    expect(existsSync(join(cwd, ".defold-types", "dependencies"))).toBe(true);

    writeProject(cwd, `[project]\ntitle = Test\n`);
    const result = await runResolve({
      libraryDataDir: null,
      cwd,
      cacheDir: tmp(),
      download: someBytes,
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", "dependencies"))).toBe(false);
  });

  test("a dependency that shares no scene source is warned about, not failed", async () => {
    const cwd = tmp();
    const url = "https://example.com/asset-only.zip";
    writeProject(cwd, `[project]\ntitle = Test\ndependencies#0 = ${url}\n`);
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["asset-1.0/sprite.png", "asset-1.0/sound.ogg"],
        contents: {},
      },
    };

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    let result: Awaited<ReturnType<typeof runResolve>>;
    try {
      result = await runResolve({
        cwd,
        cacheDir: tmp(),
        download: someBytes,
        readZip: makeReadZip(byKey),
        libraryRegistry: [],
        libraryDataDir: null,
      });
    } finally {
      console.warn = originalWarn;
    }

    expect(result.ok).toBe(true);
    expect(result.extensions[0]?.assetOnly).toBe(true);
    expect(result.extensions[0]?.sceneSources).toBe(0);
    // No directory of its own, but the manifest still records that this run
    // reached it — otherwise the scene walk would report it as an unresolved
    // hole for good.
    expect(readdirSync(join(cwd, ".defold-types", "dependencies"))).toEqual(["dependencies.json"]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]?.startsWith(`no scene source from ${url}: `)).toBe(true);
    expect(result.warnings[0]).toContain("game.project");
    expect(warnings).toEqual([]);
  });

  test("a refused archive entry reaches the warning channel", async () => {
    const cwd = tmp();
    const url = "https://github.com/Insality/druid/archive/1.2.3.zip";
    writeProject(cwd, `[project]\ntitle = Test\ndependencies#0 = ${url}\n`);
    const escaping = "druid-1.2.3/druid/../../../../main.collection";
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["druid-1.2.3/game.project", "druid-1.2.3/druid/druid.collection", escaping],
        contents: {
          "druid-1.2.3/game.project": DRUID_GAME_PROJECT,
          "druid-1.2.3/druid/druid.collection": DRUID_COLLECTION,
          [escaping]: 'name: "owned"\n',
        },
      },
    };

    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    let result: Awaited<ReturnType<typeof runResolve>>;
    try {
      result = await runResolve({
        cwd,
        cacheDir: tmp(),
        download: someBytes,
        readZip: makeReadZip(byKey),
        libraryRegistry: [],
        libraryDataDir: null,
      });
    } finally {
      console.warn = originalWarn;
    }

    expect(result.ok).toBe(true);
    const key = extensionArchiveKey(url);
    const root = join(cwd, ".defold-types", "dependencies");
    expect(readFileSync(join(root, key, "druid", "druid.collection"), "utf8")).toBe(
      DRUID_COLLECTION,
    );
    expect(existsSync(join(cwd, "main.collection"))).toBe(false);
    // Counted as what was written, not as what the archive offered.
    expect(result.extensions[0]?.sceneSources).toBe(1);
    expect(result.warnings.filter((line) => line.includes(escaping))).toEqual([
      `refusing unsafe scene path from ${url}: ${escaping}`,
    ]);
    expect(warnings).toEqual([]);
  });
});

describe("runResolve matches a library by its owner/repo, else by its repo name", () => {
  const BOOM = "declare module 'boom.boom' { export const boom: number; }\n";

  function boomData(): string {
    const folder = tmp();
    mkdirSync(join(folder, "britzl/boom/fork"), { recursive: true });
    writeFileSync(join(folder, "britzl/boom/fork/boom.boom.d.ts"), BOOM);
    writeUndocumentedUpstreamLua(join(folder, "britzl/boom"), "source/upstream/boom.boom.lua");
    writeLibraryTargets(folder, {
      forks: [
        {
          repo: "https://github.com/britzl/boom",
          ref: "1.0.0",
          authored: "fork/boom.boom.d.ts",
          moduleId: "boom.boom",
          namespace: "boom.boom",
          apiDoc: "api-doc/boom.boom.json",
          upstreamLua: ["source/upstream/boom.boom.lua"],
        },
      ],
    });
    return folder;
  }

  // `defold/extension-admob` and `lerg/extension-admob` share a repo name, each with
  // its own native declaration.
  function admobData(): string {
    const folder = tmp();
    const owners = [
      ["defold", "admob"],
      ["lerg", "lergadmob"],
    ] as const;
    for (const [owner, namespace] of owners) {
      mkdirSync(join(folder, owner, "extension-admob"), { recursive: true });
      writeFileSync(
        join(folder, owner, "extension-admob", "admob.d.ts"),
        `declare namespace ${namespace} {\n  const owner: "${owner}";\n}\n`,
      );
    }
    writeLibraryTargets(folder, {
      native: owners.map(([owner, namespace]) => ({
        repo: `https://github.com/${owner}/extension-admob`,
        ref: "1.0.0",
        namespace,
        manifestDir: "admob",
        declaration: "admob.d.ts",
        upstreamSource: "source/upstream/src/extension.cpp",
      })),
    });
    return folder;
  }

  const archiveOf = (url: string, entries: string[]): Record<string, FakeArchive> => ({
    [extensionArchiveKey(url)]: { entries, contents: {} },
  });
  const repoNameNotices = (notices: readonly string[] | undefined) =>
    (notices ?? []).filter((notice) => notice.includes("shares its repo name"));

  async function resolveOne(url: string, archive: string[], libraryDataDir: string) {
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(archiveOf(url, archive)),
      libraryDataDir,
    });
    expect(result.ok).toBe(true);
    return { cwd, result };
  }

  test("a fork prints its upstream's declarations, noting once that its types may not fit", async () => {
    const url = "https://github.com/someone/boom/archive/main.zip";

    const { cwd, result } = await resolveOne(url, ["boom-main/boom/boom.lua"], boomData());

    expect(readFileSync(join(cwd, ".defold-types", LIBRARIES_DIR, "boom.boom.d.ts"), "utf8")).toBe(
      BOOM,
    );
    expect(result.libraries.map(({ source }) => source)).toEqual(["britzl/boom"]);
    expect(repoNameNotices(result.notices)).toEqual([
      `${url} uses the library data of britzl/boom, which shares its repo name; its types may not fit`,
    ]);
  });

  test("the library's own owner/repo matches with no notice", async () => {
    const url = "https://github.com/Britzl/boom/archive/main.zip";

    const { result } = await resolveOne(url, ["boom-main/boom/boom.lua"], boomData());

    expect(result.libraries.map(({ source }) => source)).toEqual(["britzl/boom"]);
    expect(repoNameNotices(result.notices)).toEqual([]);
  });

  test("a repo name two libraries share types the dependency with neither, and says so", async () => {
    const url = "https://github.com/someone/extension-admob/archive/main.zip";

    const { cwd, result } = await resolveOne(
      url,
      ["extension-admob-main/admob/ext.manifest"],
      admobData(),
    );

    expect(result.extensions[0]?.typeSurface).toBe("none");
    expect(existsSync(join(cwd, ".defold-types", "extensions", "admob.d.ts"))).toBe(false);
    expect(repoNameNotices(result.notices)).toEqual([
      `${url} shares its repo name with defold/extension-admob and lerg/extension-admob, so no library data types it`,
    ]);
  });

  test("one of those owner/repos gets that library's declaration alone", async () => {
    const url = "https://github.com/defold/extension-admob/archive/main.zip";

    const { cwd, result } = await resolveOne(
      url,
      ["extension-admob-main/admob/ext.manifest"],
      admobData(),
    );

    expect(result.extensions[0]?.typeSurface).toBe("vendored-native");
    expect(result.extensions[0]?.namespaces).toEqual(["admob"]);
    expect(readFileSync(join(cwd, ".defold-types", "extensions", "admob.d.ts"), "utf8")).toContain(
      '"defold"',
    );
    expect(repoNameNotices(result.notices)).toEqual([]);
  });
});

describe("unknownUpdateNames", () => {
  test("names each declared dependency by its owner/repo", () => {
    const cwd = tmp();
    writeProject(
      cwd,
      "[project]\ndependencies#0 = https://github.com/Britzl/boom/archive/main.zip\n",
    );

    expect(unknownUpdateNames(cwd, ["britzl/boom"])).toBeNull();
    expect(unknownUpdateNames(cwd, ["boom"])).toBe(
      "defold-typescript resolve: --update names no dependency called boom; declared: britzl/boom",
    );
  });
});

describe("runResolve with a library data archive", () => {
  const DATA_URL = "https://example.test/library-data/archive/refs/heads/main.zip";
  const DEP_URL = "https://github.com/owner/mylib/archive/main.zip";
  const ONE = "1111111111111111111111111111111111111111";
  const TWO = "2222222222222222222222222222222222222222";
  const DEP_PIN = { commit: "3".repeat(40), files: SOME_FILES };
  const declares = (version: string) =>
    `declare module "mylib.core" {\n  export const version: "${version}";\n}\n`;
  const DEPENDENCY = writeZipArchive(
    [
      { name: "mylib-main/mylib/core.lua", text: "return {}\n" },
      { name: "mylib-main/asset/foo.png", text: "png" },
    ],
    { comment: "3333333333333333333333333333333333333333" },
  );

  // A real data folder under `data/`, packed the way GitHub packs the data repo.
  function dataArchive(
    commit: string,
    contents: string,
    outsideDataFolder: Readonly<Record<string, string>> = {},
  ): Uint8Array {
    return packDataFolder(
      commit,
      writeAuthoredLibraryData({ "mylib.core": contents }),
      outsideDataFolder,
    );
  }

  function packDataFolder(
    commit: string,
    folder: string,
    outsideDataFolder: Readonly<Record<string, string>> = {},
  ): Uint8Array {
    const files = (readdirSync(folder, { recursive: true }) as string[]).filter((path) =>
      statSync(join(folder, path)).isFile(),
    );
    return writeZipArchive(
      [
        ...files.map((path) => ({
          name: `library-data-${commit}/data/0.0.1/${path.replace(/\\/g, "/")}`,
          text: readFileSync(join(folder, path), "utf8"),
        })),
        ...Object.entries(outsideDataFolder).map(([path, text]) => ({
          name: `library-data-${commit}/${path}`,
          text,
        })),
      ],
      { comment: commit },
    );
  }

  function serving(
    data: Uint8Array | null,
    dependencies: Readonly<Record<string, Uint8Array>> = { [DEP_URL]: DEPENDENCY },
  ): {
    download: DownloadExtensionArchive;
    requests: string[];
  } {
    const requests: string[] = [];
    return {
      requests,
      download: async (url) => {
        requests.push(url);
        const dependency = dependencies[url];
        if (dependency !== undefined) {
          return { status: "ok", bytes: dependency };
        }
        if (data === null) {
          throw new Error("network down");
        }
        return { status: "ok", bytes: data };
      },
    };
  }

  function project(): string {
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${DEP_URL}\n`);
    return cwd;
  }

  const surface = (cwd: string) => join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts");
  const unrecordedNotice = (url: string) =>
    libraryStatusMessages([{ url, status: { status: "unrecorded" } }]).notices[0] as string;
  const namespaceOf = (cwd: string) => {
    const read = readProjectLock(cwd);
    if (read.status !== "ok") {
      throw new Error(`expected a readable lockfile, got ${read.status}`);
    }
    return read.lock;
  };
  const lockPathOf = (cwd: string) => join(cwd, PROJECT_LOCK_FILE);

  test("a plain run prints from the fetched data and records its commit beside the pins", async () => {
    const cwd = project();

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataUrl: DATA_URL,
      download: serving(dataArchive(ONE, declares("one"))).download,
    });

    expect(result.ok).toBe(true);
    expect(readFileSync(surface(cwd), "utf8")).toBe(declares("one"));
    expect(namespaceOf(cwd).libraryData).toEqual({
      shared: ONE,
      libraries: { "owner/mylib": ONE },
    });
    expect(namespaceOf(cwd).extensions?.[DEP_URL]).toEqual({
      commit: "3".repeat(40),
      files: anyFiles,
    });
  });

  describe("a library whose minCli is above the CLI", () => {
    function gatedData(): string {
      const folder = writeAuthoredLibraryData({ "mylib.core": declares("one") });
      const file = join(folder, "owner", "mylib", "library.json");
      const library = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...library, minCli: "0.62.0" }));
      return folder;
    }

    for (const [cliVersion, reads] of [
      ["0.61.0", false],
      ["0.62.0", true],
    ] as const) {
      test(`a ${cliVersion} CLI ${reads ? "prints and pins it" : "neither prints nor pins it"}`, async () => {
        const cwd = project();

        const result = await runResolve({
          cwd,
          cacheDir: tmp(),
          cliVersion,
          libraryDataUrl: DATA_URL,
          download: serving(packDataFolder(ONE, gatedData())).download,
        });

        expect(result.ok).toBe(true);
        expect(namespaceOf(cwd).libraryData?.libraries?.["owner/mylib"]).toBe(
          reads ? ONE : undefined,
        );
        expect(existsSync(surface(cwd))).toBe(reads);
      });

      test(`a ${cliVersion} CLI given the data folder ${reads ? "prints" : "does not print"} it`, async () => {
        const cwd = project();

        const result = await runResolve({
          cwd,
          cacheDir: tmp(),
          cliVersion,
          libraryDataDir: gatedData(),
          download: serving(null).download,
        });

        expect(result.ok).toBe(true);
        expect(existsSync(surface(cwd))).toBe(reads);
      });
    }

    test("a CLI below it prints the other libraries though that one carries a field it refuses", async () => {
      const cwd = project();
      const folder = writeAuthoredLibraryData({
        "mylib.core": declares("one"),
        "other.core": "// other\n",
      });
      const file = join(folder, "owner", "other", "library.json");
      const library = JSON.parse(readFileSync(file, "utf8"));
      writeFileSync(file, JSON.stringify({ ...library, minCli: "0.62.0", forks: "x" }));

      const result = await runResolve({
        cwd,
        cacheDir: tmp(),
        cliVersion: "0.61.0",
        libraryDataDir: folder,
        download: serving(null).download,
      });

      expect(result.ok).toBe(true);
      expect(readFileSync(surface(cwd), "utf8")).toBe(declares("one"));
    });
  });

  test("--update against a newer archive moves the library's pin and prints from it", async () => {
    const cwd = project();
    const cacheDir = tmp();
    await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      download: serving(dataArchive(ONE, declares("one"))).download,
    });

    await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      update: true,
      download: serving(dataArchive(TWO, declares("two"))).download,
    });

    expect(namespaceOf(cwd).libraryData?.libraries).toEqual({ "owner/mylib": TWO });
    expect(readFileSync(surface(cwd), "utf8")).toBe(declares("two"));
  });

  async function recordOne(cwd: string, cacheDir: string, data: Uint8Array): Promise<string> {
    await runResolve({ cwd, cacheDir, libraryDataUrl: DATA_URL, download: serving(data).download });
    return readFileSync(lockPathOf(cwd), "utf8");
  }

  test("newer data for a library the project uses holds its pin and says so", async () => {
    const cwd = project();
    const cacheDir = tmp();
    const before = await recordOne(cwd, cacheDir, dataArchive(ONE, declares("one")));

    const result = await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      download: serving(dataArchive(TWO, declares("two"))).download,
    });

    expect(result.ok).toBe(true);
    expect(readFileSync(lockPathOf(cwd), "utf8")).toBe(before);
    expect(readFileSync(surface(cwd), "utf8")).toBe(declares("one"));
    expect(result.notices).toHaveLength(2);
    expect(result.notices?.[0]).toContain("mylib");
    expect(result.notices?.[0]).toContain("resolve --update");
    expect(result.notices?.[1]).toBe(unrecordedNotice(DEP_URL));
    expect(result.warnings.filter((line) => line.includes("library data"))).toEqual([]);
  });

  test("newer data that drops a library the project uses holds its pin and says so", async () => {
    const cwd = project();
    const cacheDir = tmp();
    const keep = 'declare module "other.core" {}\n';
    const before = await recordOne(
      cwd,
      cacheDir,
      packDataFolder(
        ONE,
        writeAuthoredLibraryData({ "mylib.core": declares("one"), "other.core": keep }),
      ),
    );

    const result = await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      download: serving(packDataFolder(TWO, writeAuthoredLibraryData({ "other.core": keep })))
        .download,
    });

    expect(readFileSync(lockPathOf(cwd), "utf8")).toBe(before);
    expect(readFileSync(surface(cwd), "utf8")).toBe(declares("one"));
    expect(result.notices?.[0]).toContain("mylib");
  });

  test("newer data for a library the project does not use says nothing about it", async () => {
    const cwd = project();
    const cacheDir = tmp();
    const data = (commit: string, other: string) =>
      packDataFolder(
        commit,
        writeAuthoredLibraryData({ "mylib.core": declares("one"), "other.core": other }),
      );
    const before = await recordOne(cwd, cacheDir, data(ONE, "// one\n"));

    const result = await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      download: serving(data(TWO, "// two\n")).download,
    });

    expect(readFileSync(lockPathOf(cwd), "utf8")).toBe(before);
    expect(result.notices).toEqual([unrecordedNotice(DEP_URL)]);
  });

  test("a pinned commit with no folder for this CLI moves the pin and says so", async () => {
    const cwd = project();
    writeProjectLock(cwd, {
      extensions: {},
      libraryData: { shared: ONE, libraries: { "owner/mylib": ONE } },
    });
    const held = writeZipArchive([{ name: `library-data-${ONE}/README.md`, text: "# docs" }], {
      comment: ONE,
    });
    const main = dataArchive(TWO, declares("two"));

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataUrl: DATA_URL,
      download: async (url) => ({
        status: "ok",
        bytes: url === DEP_URL ? DEPENDENCY : url === DATA_URL ? main : held,
      }),
    });

    expect(namespaceOf(cwd).libraryData?.libraries).toEqual({ "owner/mylib": TWO });
    expect(readFileSync(surface(cwd), "utf8")).toBe(declares("two"));
    expect(result.notices?.[0]).toContain(ONE);
    expect(result.notices?.[0]).toContain(TWO);
  });

  test("a run after a hold leaves the lockfile's bytes and mtime alone", async () => {
    const cwd = project();
    const cacheDir = tmp();
    const lockPath = lockPathOf(cwd);
    const before = await recordOne(cwd, cacheDir, dataArchive(ONE, declares("one")));
    const newer = serving(dataArchive(TWO, declares("two"))).download;
    const old = new Date("2020-01-01T00:00:00Z");
    utimesSync(lockPath, old, old);

    for (let run = 0; run < 2; run++) {
      await runResolve({ cwd, cacheDir, libraryDataUrl: DATA_URL, download: newer });
      expect(readFileSync(lockPath, "utf8")).toBe(before);
      expect(statSync(lockPath).mtimeMs).toBe(old.getTime());
    }
  });

  describe("a dependency only the newer data covers pins that library alone", () => {
    const NEW_URL = "https://github.com/owner/newlib/archive/main.zip";
    const repo = "https://github.com/owner/newlib";
    const LUA = [
      "---@class newlib.core",
      "local M = {}",
      "---@return number",
      "function M.answer_probe() end",
      "return M",
      "",
    ].join("\n");

    const LANES: readonly {
      lane: string;
      archive: readonly { name: string; text: string }[];
      write: (root: string) => void;
      printed: (cwd: string) => string;
    }[] = [
      {
        lane: "luals",
        archive: [{ name: "newlib-main/newlib/core.lua", text: LUA }],
        write: (root) => {
          writeLibraryTargets(root, {
            luals: [
              {
                repo,
                ref: "1.0.0",
                sourceGlobs: ["newlib/**/*.lua"],
                moduleId: "newlib.core",
                namespace: "newlib.core",
              },
            ],
          });
        },
        printed: (cwd) => join(cwd, ".defold-types", LIBRARIES_DIR, "newlib.core.d.ts"),
      },
      {
        lane: "authored",
        archive: [{ name: "newlib-main/newlib/core.lua", text: "return {}\n" }],
        write: (root) => {
          mkdirSync(join(root, "owner/newlib", "fork"), { recursive: true });
          writeFileSync(
            join(root, "owner/newlib", "fork", "newlib.core.d.ts"),
            'declare module "newlib.core" {\n  export const answer_probe: number;\n}\n',
          );
          writeUndocumentedUpstreamLua(
            join(root, "owner/newlib"),
            "source/upstream/newlib.core.lua",
          );
          writeLibraryTargets(root, {
            forks: [
              {
                repo,
                ref: "1.0.0",
                authored: "fork/newlib.core.d.ts",
                moduleId: "newlib.core",
                namespace: "newlib.core",
                apiDoc: "api-doc/newlib.core.json",
                upstreamLua: ["source/upstream/newlib.core.lua"],
              },
            ],
          });
        },
        printed: (cwd) => join(cwd, ".defold-types", LIBRARIES_DIR, "newlib.core.d.ts"),
      },
      {
        lane: "native",
        archive: [{ name: "newlib-main/newlib/ext.manifest", text: "name: newlib\n" }],
        write: (root) => {
          mkdirSync(join(root, "owner/newlib"), { recursive: true });
          writeFileSync(
            join(root, "owner/newlib", "newlib.d.ts"),
            "declare namespace newlib {\n  const answer_probe: number;\n}\n",
          );
          writeLibraryTargets(root, {
            native: [
              {
                repo,
                ref: "1.0.0",
                namespace: "newlib",
                manifestDir: "newlib",
                declaration: "newlib.d.ts",
                upstreamSource: "source/upstream/src/extension.cpp",
              },
            ],
          });
        },
        printed: (cwd) => join(cwd, ".defold-types", "extensions", "newlib.d.ts"),
      },
    ];

    test.each(LANES)("on the $lane lane", async ({ archive, write, printed }) => {
      const cwd = project();
      const cacheDir = tmp();
      const dependency = writeZipArchive(archive, { comment: "3".repeat(40) });
      const run = (data: Uint8Array) =>
        runResolve({
          cwd,
          cacheDir,
          libraryDataUrl: DATA_URL,
          download: async (url) => ({
            status: "ok",
            bytes: url === NEW_URL ? dependency : url === DEP_URL ? DEPENDENCY : data,
          }),
        });
      await run(dataArchive(ONE, declares("one")));
      expect(namespaceOf(cwd).libraryData).toEqual({
        shared: ONE,
        libraries: { "owner/mylib": ONE },
      });
      const printedBefore = readFileSync(surface(cwd), "utf8");

      writeProject(cwd, `[project]\ndependencies#0 = ${DEP_URL}\ndependencies#1 = ${NEW_URL}\n`);
      const newer = writeAuthoredLibraryData({ "mylib.core": declares("two") });
      write(newer);
      await run(packDataFolder(TWO, newer));

      expect(namespaceOf(cwd).libraryData).toEqual({
        shared: ONE,
        libraries: { "owner/mylib": ONE, "owner/newlib": TWO },
      });
      expect(readFileSync(printed(cwd), "utf8")).toContain("answer_probe");
      expect(readFileSync(surface(cwd), "utf8")).toBe(printedBefore);
    });
  });

  test("a newer commit with the same data folder keeps the pin, and --frozen prints the same", async () => {
    const cwd = project();
    const cacheDir = tmp();
    await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      download: serving(dataArchive(ONE, declares("one"))).download,
    });
    const before = readFileSync(lockPathOf(cwd), "utf8");
    const printed = readFileSync(surface(cwd), "utf8");

    const plain = await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      download: serving(dataArchive(TWO, declares("one"), { "site/app.ts": "export {};\n" }))
        .download,
    });

    expect(plain.ok).toBe(true);
    expect(readFileSync(lockPathOf(cwd), "utf8")).toBe(before);
    expect(readFileSync(surface(cwd), "utf8")).toBe(printed);

    const frozen = await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      freeze: true,
      download: serving(null).download,
    });

    expect(frozen.ok).toBe(true);
    expect(namespaceOf(cwd).libraryData?.libraries).toEqual({ "owner/mylib": ONE });
    expect(readFileSync(surface(cwd), "utf8")).toBe(printed);
  });

  test("a run at the pinned commit leaves the lockfile byte-identical", async () => {
    const cwd = project();
    const cacheDir = tmp();
    const { download } = serving(dataArchive(ONE, declares("one")));
    await runResolve({ cwd, cacheDir, libraryDataUrl: DATA_URL, download });
    const before = readFileSync(lockPathOf(cwd), "utf8");

    await runResolve({ cwd, cacheDir, libraryDataUrl: DATA_URL, download });

    expect(readFileSync(lockPathOf(cwd), "utf8")).toBe(before);
  });

  test("a frozen run holds to its pins with no request for main", async () => {
    const cwd = project();
    const cacheDir = tmp();
    await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      download: serving(dataArchive(ONE, declares("one"))).download,
    });
    const before = readFileSync(lockPathOf(cwd), "utf8");
    const newer = serving(dataArchive(TWO, declares("two")));

    const result = await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      freeze: true,
      download: newer.download,
    });

    expect(result.ok).toBe(true);
    expect(newer.requests).not.toContain(DATA_URL);
    expect(readFileSync(surface(cwd), "utf8")).toBe(declares("one"));
    expect(readFileSync(lockPathOf(cwd), "utf8")).toBe(before);
    expect(result.notices).toEqual([unrecordedNotice(DEP_URL)]);
  });

  test("a frozen run with no recorded library data fails and asks for a plain resolve", async () => {
    const cwd = project();
    writeProjectLock(cwd, { extensions: { [DEP_URL]: DEP_PIN } });
    const { download, requests } = serving(dataArchive(ONE, declares("one")));

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataUrl: DATA_URL,
      freeze: true,
      download,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("plain");
    expect(requests).toEqual([]);
    expect(existsSync(surface(cwd))).toBe(false);
  });

  test("a frozen run whose pinned commit lacks a declared library fails, naming it", async () => {
    const cwd = project();
    writeProjectLock(cwd, {
      extensions: { [DEP_URL]: DEP_PIN },
      libraryData: { shared: ONE, libraries: { "owner/mylib": ONE } },
    });
    const without = packDataFolder(ONE, writeAuthoredLibraryData({ "other.core": "// other\n" }));
    const { download, requests } = serving(without);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataUrl: DATA_URL,
      freeze: true,
      download,
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("mylib");
    expect(requests).not.toContain(DATA_URL);
  });

  test("a frozen run whose pins do not load together fails, naming the module", async () => {
    const cwd = tmp();
    const OTHER_URL = "https://github.com/owner/other/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${DEP_URL}\ndependencies#1 = ${OTHER_URL}\n`);
    writeProjectLock(cwd, {
      extensions: {
        [DEP_URL]: DEP_PIN,
        [OTHER_URL]: DEP_PIN,
      },
      libraryData: { shared: ONE, libraries: { "owner/mylib": ONE, "owner/other": TWO } },
    });
    const naming = (library: string, plain: string) => {
      const folder = writeAuthoredLibraryData({ [`${plain}.core`]: "// plain\n" });
      mkdirSync(join(folder, "owner", library, "fork"), { recursive: true });
      writeFileSync(join(folder, "owner", library, "fork", "clash.d.ts"), "// clash\n");
      writeUndocumentedUpstreamLua(join(folder, "owner", library), "source/upstream/clash.lua");
      writeLibraryTargets(folder, {
        forks: [
          {
            repo: `https://github.com/owner/${library}`,
            ref: "1.0.0",
            authored: "fork/clash.d.ts",
            moduleId: "clash",
            namespace: "clash",
            apiDoc: "api-doc/clash.json",
            upstreamLua: ["source/upstream/clash.lua"],
          },
        ],
      });
      return folder;
    };
    const atOne = packDataFolder(ONE, naming("mylib", "other"));
    const atTwo = packDataFolder(TWO, naming("other", "mylib"));

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataUrl: DATA_URL,
      freeze: true,
      download: async (url) => ({
        status: "ok",
        bytes: url.includes(ONE) ? atOne : url.includes(TWO) ? atTwo : DEPENDENCY,
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain("clash");
  });

  test("a frozen run with a pinned URL and no library pin prints no library and passes", async () => {
    const cwd = project();
    const lock = {
      extensions: {},
      libraryData: { shared: ONE, libraries: {} },
    };
    writeProjectLock(cwd, {
      ...lock,
      extensions: { [DEP_URL]: DEP_PIN },
    });
    const { download, requests } = serving(dataArchive(ONE, declares("one")));

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataUrl: DATA_URL,
      freeze: true,
      download,
    });

    expect(result.ok).toBe(true);
    expect(requests).not.toContain(DATA_URL);
    expect(existsSync(surface(cwd))).toBe(false);
  });

  describe("--update accepts extension drift", () => {
    const OLD_PIN = { commit: "9".repeat(40), files: SOME_FILES };
    const FETCHED_PIN = { commit: "3".repeat(40), files: anyFiles };
    const OTHER_URL = "https://github.com/owner/other/archive/main.zip";
    const OTHER = writeZipArchive([{ name: "other-main/asset/foo.png", text: "png" }], {
      comment: "4".repeat(40),
    });

    async function drifted(update?: true | readonly string[]) {
      const cwd = tmp();
      writeProject(cwd, `[project]\ndependencies#0 = ${DEP_URL}\ndependencies#1 = ${OTHER_URL}\n`);
      writeProjectLock(cwd, {
        extensions: { [DEP_URL]: OLD_PIN, [OTHER_URL]: OLD_PIN },
      });
      const data = dataArchive(ONE, declares("one"));
      const result = await runResolve({
        cwd,
        cacheDir: tmp(),
        libraryDataUrl: DATA_URL,
        ...(update === undefined ? {} : { update }),
        download: async (url) => ({
          status: "ok",
          bytes: url === DEP_URL ? DEPENDENCY : url === OTHER_URL ? OTHER : data,
        }),
      });
      const statusOf = (url: string) => result.extensions.find((e) => e.url === url)?.pinStatus;
      return { lock: namespaceOf(cwd).extensions, statusOf };
    }

    test("a plain run keeps the pin and reports the drift", async () => {
      const { lock, statusOf } = await drifted();

      expect(lock[DEP_URL]).toEqual(OLD_PIN);
      expect(statusOf(DEP_URL)).toBe("drift");
    });

    test("--update takes the fetched value on every URL and reports no drift", async () => {
      const { lock, statusOf } = await drifted(true);

      expect(lock[DEP_URL]).toEqual(FETCHED_PIN);
      expect(lock[OTHER_URL]).toEqual({ commit: "4".repeat(40), files: anyFiles });
      expect(statusOf(DEP_URL)).toBe("match");
      expect(statusOf(OTHER_URL)).toBe("match");
    });

    test("--update=<name> does this for that URL alone", async () => {
      const { lock, statusOf } = await drifted(["owner/mylib"]);

      expect(lock[DEP_URL]).toEqual(FETCHED_PIN);
      expect(lock[OTHER_URL]).toEqual(OLD_PIN);
      expect(statusOf(DEP_URL)).toBe("match");
      expect(statusOf(OTHER_URL)).toBe("drift");
    });
  });

  // `a/widget` and `b/widget` share a repo name, each with its own native declaration,
  // and `c/widget` is neither.
  describe("a repo name two libraries share types a dependency with neither", () => {
    const A_URL = "https://github.com/a/widget/archive/main.zip";
    const C_URL = "https://github.com/c/widget/archive/main.zip";
    const widgetArchive = (commit: string) =>
      writeZipArchive([{ name: "widget-main/widget/ext.manifest", text: "name: widget\n" }], {
        comment: commit,
      });
    const DEPENDENCIES = {
      [A_URL]: widgetArchive("5".repeat(40)),
      [C_URL]: widgetArchive("6".repeat(40)),
    };
    const sharedNotice = `${C_URL} shares its repo name with a/widget and b/widget, so no library data types it`;

    function widgetData(aVersion: string): string {
      const folder = tmp();
      const owners = [
        ["a", "awidget", aVersion],
        ["b", "bwidget", "one"],
      ] as const;
      for (const [owner, namespace, version] of owners) {
        mkdirSync(join(folder, owner, "widget"), { recursive: true });
        writeFileSync(
          join(folder, owner, "widget", "widget.d.ts"),
          `declare namespace ${namespace} {\n  const version: "${version}";\n}\n`,
        );
      }
      writeLibraryTargets(folder, {
        native: owners.map(([owner, namespace]) => ({
          repo: `https://github.com/${owner}/widget`,
          ref: "1.0.0",
          namespace,
          manifestDir: "widget",
          declaration: "widget.d.ts",
          upstreamSource: "source/upstream/src/extension.cpp",
        })),
      });
      return folder;
    }

    const repoNameNotices = (notices: readonly string[] | undefined) =>
      (notices ?? []).filter((notice) => notice.includes("shares its repo name"));
    const extensionOf = (result: { extensions: readonly ResolvedExtensionReport[] }, url: string) =>
      result.extensions.find((extension) => extension.url === url);
    const declared = (cwd: string, namespace: string) =>
      existsSync(join(cwd, ".defold-types", "extensions", `${namespace}.d.ts`));

    function widgetProject(urls: readonly string[]) {
      const cwd = tmp();
      const cacheDir = tmp();
      writeProject(
        cwd,
        `[project]\n${urls.map((url, index) => `dependencies#${index} = ${url}\n`).join("")}`,
      );
      const run = (data: Uint8Array | null, more: Partial<RunResolveOptions> = {}) =>
        runResolve({
          cwd,
          cacheDir,
          libraryDataUrl: DATA_URL,
          download: serving(data, DEPENDENCIES).download,
          ...more,
        });
      return { cwd, run };
    }

    test("a dependency on neither alone pins neither", async () => {
      const { cwd, run } = widgetProject([C_URL]);

      const result = await run(packDataFolder(ONE, widgetData("one")));

      expect(result.ok).toBe(true);
      expect(extensionOf(result, C_URL)?.typeSurface).toBe("none");
      expect(declared(cwd, "awidget")).toBe(false);
      expect(declared(cwd, "bwidget")).toBe(false);
      expect(repoNameNotices(result.notices)).toEqual([sharedNotice]);
      expect(Object.keys(namespaceOf(cwd).libraryData?.libraries ?? {})).toEqual([]);
    });

    test("beside a dependency on one of them, that one alone is typed and pinned", async () => {
      const { cwd, run } = widgetProject([A_URL, C_URL]);

      const result = await run(packDataFolder(ONE, widgetData("one")));

      expect(result.ok).toBe(true);
      expect(extensionOf(result, A_URL)?.typeSurface).toBe("vendored-native");
      expect(extensionOf(result, A_URL)?.namespaces).toEqual(["awidget"]);
      expect(extensionOf(result, C_URL)?.typeSurface).toBe("none");
      expect(repoNameNotices(result.notices)).toEqual([sharedNotice]);
      expect(namespaceOf(cwd).libraryData?.libraries).toEqual({ "a/widget": ONE });
    });

    test("a frozen run types the dependency on neither with neither", async () => {
      const { run } = widgetProject([A_URL, C_URL]);
      await run(packDataFolder(ONE, widgetData("one")));

      const frozen = await run(null, { freeze: true });

      expect(frozen.ok).toBe(true);
      expect(extensionOf(frozen, C_URL)?.typeSurface).toBe("none");
      expect(repoNameNotices(frozen.notices)).toEqual([sharedNotice]);
    });

    test("--update naming the dependency on neither moves no pin", async () => {
      const { cwd, run } = widgetProject([A_URL, C_URL]);
      await run(packDataFolder(ONE, widgetData("one")));

      await run(packDataFolder(TWO, widgetData("two")), { update: ["c/widget"] });

      expect(namespaceOf(cwd).libraryData?.libraries).toEqual({ "a/widget": ONE });
    });
  });

  describe("--update names a dependency by its owner/repo", () => {
    const FORK_URL = "https://github.com/someone/mylib/archive/main.zip";
    const OTHER_URL = "https://github.com/owner/other/archive/main.zip";
    const OTHER_DEPENDENCY = writeZipArchive(
      [{ name: "other-main/other/core.lua", text: "return {}\n" }],
      { comment: "4".repeat(40) },
    );
    const data = (commit: string, version: string) =>
      packDataFolder(
        commit,
        writeAuthoredLibraryData({
          "mylib.core": declares(version),
          "other.core": `// ${version}\n`,
        }),
      );

    async function pinnedAtOne(urls: readonly string[]) {
      const cwd = tmp();
      const cacheDir = tmp();
      writeProject(
        cwd,
        `[project]\n${urls.map((url, index) => `dependencies#${index} = ${url}\n`).join("")}`,
      );
      const run = (commit: string, version: string, update?: readonly string[]) =>
        runResolve({
          cwd,
          cacheDir,
          libraryDataUrl: DATA_URL,
          ...(update === undefined ? {} : { update }),
          download: async (url) => ({
            status: "ok",
            bytes:
              url === DATA_URL
                ? data(commit, version)
                : url === OTHER_URL
                  ? OTHER_DEPENDENCY
                  : DEPENDENCY,
          }),
        });
      await run(ONE, "one");
      return { cwd, run };
    }

    test("an owner/repo moves that library's pin alone", async () => {
      const { cwd, run } = await pinnedAtOne([DEP_URL, OTHER_URL]);

      await run(TWO, "two", ["owner/mylib"]);

      expect(namespaceOf(cwd).libraryData?.libraries).toEqual({
        "owner/mylib": TWO,
        "owner/other": ONE,
      });
    });

    test("a fork's owner/repo moves the pin of the library it reads", async () => {
      const { cwd, run } = await pinnedAtOne([FORK_URL]);
      expect(namespaceOf(cwd).libraryData?.libraries).toEqual({ "owner/mylib": ONE });

      await run(TWO, "two", ["someone/mylib"]);

      expect(namespaceOf(cwd).libraryData?.libraries).toEqual({ "owner/mylib": TWO });
      expect(readFileSync(surface(cwd), "utf8")).toBe(declares("two"));
    });
  });

  test("an unreachable archive warns, keeps the surface and leaves the pins", async () => {
    const cwd = project();
    await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataUrl: DATA_URL,
      download: serving(dataArchive(ONE, declares("one"))).download,
    });

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataUrl: DATA_URL,
      download: serving(null).download,
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.filter((line) => line.includes(DATA_URL))).toHaveLength(1);
    expect(readFileSync(surface(cwd), "utf8")).toBe(declares("one"));
    expect(namespaceOf(cwd).libraryData).toEqual({
      shared: ONE,
      libraries: { "owner/mylib": ONE },
    });
  });

  test("a project with no dependencies fetches nothing and records nothing", async () => {
    const cwd = tmp();
    writeProject(cwd, "[project]\ntitle = Test\n");
    const { download, requests } = serving(dataArchive(ONE, declares("one")));

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataUrl: DATA_URL,
      download,
    });

    expect(result.ok).toBe(true);
    expect(requests).toEqual([]);
    expect(existsSync(lockPathOf(cwd))).toBe(false);
    expect(existsSync(join(cwd, "package.json"))).toBe(false);
  });

  test("a set libraryDataDir wins over the archive and records nothing", async () => {
    const cwd = project();
    const { download, requests } = serving(dataArchive(ONE, declares("one")));

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataUrl: DATA_URL,
      libraryDataDir: writeAuthoredLibraryData({ "mylib.core": declares("local") }),
      download,
    });

    expect(result.ok).toBe(true);
    expect(requests).not.toContain(DATA_URL);
    expect(readFileSync(surface(cwd), "utf8")).toBe(declares("local"));
    expect(namespaceOf(cwd).libraryData).toBeUndefined();
  });
});

describe("runResolve moves moving URLs to commits", () => {
  const ONE = "1".repeat(40);
  const TWO = "2".repeat(40);
  const REPO = "https://github.com/owner/mylib";
  const BRANCH = `${REPO}/archive/master.zip`;
  const AT_ONE = `${REPO}/archive/${ONE}.zip`;
  const AT_TWO = `${REPO}/archive/${TWO}.zip`;
  const TAG = "https://github.com/owner/other/archive/refs/tags/v1.zip";
  const OTHER_AT_TWO = `https://github.com/owner/other/archive/${TWO}.zip`;
  const THIRD = "https://github.com/owner/third/archive/main.zip";
  const ESCAPE = `${REPO}/archive/../../../attacker/fork/archive/main.zip`;

  // Where a real save lands: while the run is waiting on its first download. A null
  // text deletes the file instead.
  function savingDuring(
    cwd: string,
    text: string | null,
    download: DownloadExtensionArchive,
  ): DownloadExtensionArchive {
    let saved = false;
    return async (url) => {
      if (!saved) {
        saved = true;
        const path = join(cwd, "game.project");
        if (text === null) {
          rmSync(path);
        } else {
          writeFileSync(path, text);
        }
      }
      return download(url);
    };
  }

  // GitHub names the wrapper after the ref asked for; the files under it are the same.
  const archive = (
    wrapper: string,
    comment?: string,
    { doc = ALPHA, level = 'name: "level"\n' } = {},
  ): Uint8Array =>
    writeZipArchive(
      [
        { name: `${wrapper}/api.script_api`, text: doc },
        { name: `${wrapper}/game.project`, text: "[library]\ninclude_dirs = scenes\n" },
        { name: `${wrapper}/scenes/level.collection`, text: level },
      ],
      comment === undefined ? {} : { comment },
    );

  function serving(byUrl: Record<string, Uint8Array>) {
    const requests: string[] = [];
    const download: DownloadExtensionArchive = async (url) => {
      requests.push(url);
      const bytes = byUrl[url];
      if (bytes === undefined) {
        throw new Error(`no archive at ${url}`);
      }
      return { status: "ok", bytes };
    };
    return { download, requests };
  }

  function setUp(body: string) {
    const cwd = tmp();
    writeProject(cwd, body);
    return { cwd, cacheDir: tmp() };
  }

  const run = (
    project: { cwd: string; cacheDir: string },
    download: DownloadExtensionArchive,
    extra: Partial<RunResolveOptions> = {},
  ) => runResolve({ ...project, libraryDataDir: null, typesRoot: null, download, ...extra });

  const gameProject = (cwd: string) => readFileSync(join(cwd, "game.project"), "utf8");
  const locked = (cwd: string) => {
    const read = readProjectLock(cwd);
    if (read.status !== "ok") {
      throw new Error(`lockfile not readable: ${read.status}`);
    }
    return read.lock.extensions;
  };
  const extensionTypes = (cwd: string) => {
    const dir = join(cwd, ".defold-types", "extensions");
    return Object.fromEntries(
      readdirSync(dir)
        .sort()
        .map((name) => [name, readFileSync(join(dir, name), "utf8")]),
    );
  };

  describe("a dependency on a branch", () => {
    const RELEASE = `${REPO}/releases/download/v1/mylib.zip`;
    const UNKNOWN = "https://example.com/mylib.zip";
    const movingWarnings = (warnings: readonly string[]) =>
      warnings.filter((line) => line.includes("resolve --pin-urls"));

    const projectOn = (url: string) => {
      const project = setUp(`[project]\ntitle = T\ndependencies#0 = ${url}\n`);
      const { download } = serving({ [url]: archive("mylib-ref", ONE) });
      return { project, download };
    };

    test("a plain run warns once, naming the URL and the fix, and still succeeds", async () => {
      const { project, download } = projectOn(BRANCH);

      const result = await run(project, download);

      expect(result.ok).toBe(true);
      expect(movingWarnings(result.warnings)).toHaveLength(1);
      expect(movingWarnings(result.warnings)[0]).toContain(BRANCH);
    });

    test("a frozen run warns the same way and still succeeds", async () => {
      const { project, download } = projectOn(BRANCH);
      await run(project, download);

      const result = await run(project, download, { freeze: true });

      expect(result.ok).toBe(true);
      expect(movingWarnings(result.warnings)).toHaveLength(1);
      expect(movingWarnings(result.warnings)[0]).toContain(BRANCH);
    });

    test("the same branch declared twice warns once", async () => {
      const project = setUp(
        `[project]\ntitle = T\ndependencies#0 = ${BRANCH}\ndependencies#1 = ${BRANCH}\n`,
      );
      const { download } = serving({ [BRANCH]: archive("mylib-master", ONE) });

      const result = await run(project, download);

      expect(movingWarnings(result.warnings)).toHaveLength(1);
    });

    test.each([
      ["commit", AT_ONE],
      ["tag", TAG],
      ["release", RELEASE],
      ["unknown", UNKNOWN],
    ])("a %s URL draws no warning", async (kind, url) => {
      expect(classifyDependencyUrl(url)).toBe(kind as DependencyUrlKind);
      const { project, download } = projectOn(url);

      const result = await run(project, download);

      expect(result.ok).toBe(true);
      expect(movingWarnings(result.warnings)).toEqual([]);
    });

    test("each extension reports the classifier's kind of its URL", async () => {
      const urls = [BRANCH, AT_TWO.replace("mylib", "pinned"), TAG, RELEASE, UNKNOWN];
      const project = setUp(
        `[project]\ntitle = T\n${urls.map((url, i) => `dependencies#${i} = ${url}\n`).join("")}`,
      );
      const { download } = serving(
        Object.fromEntries(urls.map((url) => [url, archive("mylib-ref", ONE)])),
      );

      const result = await run(project, download);

      expect(result.extensions.map(({ url, ref }) => [url, ref])).toEqual(
        urls.map((url) => [url, classifyDependencyUrl(url)]),
      );
      expect(new Set(result.extensions.map(({ ref }) => ref))).toEqual(
        new Set(["branch", "commit", "tag", "release", "unknown"]),
      );
    });

    test("--pin-urls moving the branch leaves no warning and reports a commit", async () => {
      const { project, download } = projectOn(BRANCH);

      const result = await run(project, download, { pinUrls: true });

      expect(movingWarnings(result.warnings)).toEqual([]);
      expect(result.extensions.map(({ url, ref }) => [url, ref])).toEqual([[AT_ONE, "commit"]]);
    });

    test("--pin-urls leaving the branch gives its reason and not the advice to run it", async () => {
      const project = setUp(`[project]\ntitle = T\ndependencies#0 = ${BRANCH}\n`);
      const { download } = serving({ [BRANCH]: archive("mylib-master") });

      const result = await run(project, download, { pinUrls: true });

      expect(result.warnings.filter((line) => line.includes(BRANCH))).toEqual([
        `--pin-urls left ${BRANCH}: its archive names no commit`,
      ]);
      expect(result.extensions.map(({ url, ref }) => [url, ref])).toEqual([[BRANCH, "branch"]]);
    });
  });

  describe("--pin-urls", () => {
    test("a branch and a tag move to their commits, and the types stay", async () => {
      const body = `[project]\ntitle = T\ndependencies#0 = ${BRANCH}\ndependencies#1 = ${TAG}\n`;
      const project = setUp(body);
      const { download } = serving({
        [BRANCH]: archive("mylib-master", ONE),
        [TAG]: archive("other-1", TWO, { doc: ALPHA.replaceAll("alpha", "beta") }),
      });
      const plain = setUp(body);
      await run(plain, download);

      const result = await run(project, download, { pinUrls: true });

      expect(result.ok).toBe(true);
      expect(gameProject(project.cwd)).toBe(
        `[project]\ntitle = T\ndependencies#0 = ${AT_ONE}\ndependencies#1 = ${OTHER_AT_TWO}\n`,
      );
      expect(locked(project.cwd)).toEqual({
        [AT_ONE]: { commit: ONE, files: anyFiles, follows: BRANCH },
        [OTHER_AT_TWO]: { commit: TWO, files: anyFiles, follows: TAG },
      });
      expect(result.extensions.map(({ url, pinStatus }) => [url, pinStatus])).toEqual([
        [AT_ONE, "match"],
        [OTHER_AT_TWO, "match"],
      ]);
      expect(result.notices?.some((line) => line.includes(AT_ONE))).toBe(true);
      expect(Object.keys(extensionTypes(project.cwd))).toContain("alpha.d.ts");
      expect(extensionTypes(project.cwd)).toEqual(extensionTypes(plain.cwd));
    });

    test("the scene surface is keyed by the new URL, which the scene walk reads", async () => {
      const project = setUp(`[project]\ndependencies#0 = ${BRANCH}\n`);
      const { download } = serving({ [BRANCH]: archive("mylib-master", ONE) });

      await run(project, download, { pinUrls: true });

      const dependencies = join(project.cwd, ".defold-types", "dependencies");
      const keys = readdirSync(dependencies).filter((name) => name !== "dependencies.json");
      expect(keys).toEqual([extensionArchiveKey(AT_ONE)]);
      const manifest = readFileSync(join(dependencies, "dependencies.json"), "utf8");
      expect(manifest).toContain(AT_ONE);
      expect(manifest).not.toContain(BRANCH);
    });

    test("a CRLF project keeps its line endings", async () => {
      const project = setUp(`[project]\r\ndependencies#0 = ${BRANCH}\r\n`);
      const { download } = serving({ [BRANCH]: archive("mylib-master", ONE) });

      await run(project, download, { pinUrls: true });

      expect(gameProject(project.cwd)).toBe(`[project]\r\ndependencies#0 = ${AT_ONE}\r\n`);
    });

    test("a release asset, another host and a commentless archive stay, each with a warning", async () => {
      const RELEASE = "https://github.com/owner/rel/releases/download/v1/rel.zip";
      const HOST = "https://example.com/owner/host/archive/main.zip";
      const BARE = "https://github.com/owner/bare/archive/main.zip";
      const body = `[project]\ndependencies#0 = ${RELEASE}\ndependencies#1 = ${HOST}\ndependencies#2 = ${BARE}\n`;
      const project = setUp(body);
      const { download } = serving({
        [RELEASE]: archive("rel"),
        [HOST]: archive("host"),
        [BARE]: archive("bare-main"),
      });

      const result = await run(project, download, { pinUrls: true });

      expect(result.ok).toBe(true);
      expect(gameProject(project.cwd)).toBe(body);
      for (const url of [RELEASE, HOST, BARE]) {
        expect(result.warnings.filter((line) => line.includes(url))).toHaveLength(1);
        expect(locked(project.cwd)[url]?.follows).toBeUndefined();
      }
    });

    test("a second run changes nothing, by bytes and mtime", async () => {
      const project = setUp(`[project]\ndependencies#0 = ${BRANCH}\n`);
      const { download } = serving({
        [BRANCH]: archive("mylib-master", ONE),
        [AT_ONE]: archive(`mylib-${ONE}`, ONE),
      });
      await run(project, download, { pinUrls: true });
      const paths = [join(project.cwd, "game.project"), join(project.cwd, PROJECT_LOCK_FILE)];
      const past = new Date(1_000_000_000_000);
      for (const path of paths) {
        utimesSync(path, past, past);
      }
      const before = paths.map((path) => readFileSync(path, "utf8"));

      const result = await run(project, download, { pinUrls: true });

      expect(result.ok).toBe(true);
      expect(result.notices).toBeUndefined();
      expect(paths.map((path) => readFileSync(path, "utf8"))).toEqual(before);
      expect(paths.map((path) => statSync(path).mtimeMs)).toEqual([past.getTime(), past.getTime()]);
    });

    test("a pin that drifted stays until --update accepts it", async () => {
      const project = setUp(`[project]\ndependencies#0 = ${BRANCH}\n`);
      writePins(project.cwd, { [BRANCH]: { commit: TWO, files: SOME_FILES } });
      const { download } = serving({ [BRANCH]: archive("mylib-master", ONE) });

      const held = await run(project, download, { pinUrls: true });

      expect(gameProject(project.cwd)).toBe(`[project]\ndependencies#0 = ${BRANCH}\n`);
      expect(locked(project.cwd)[BRANCH]).toEqual({ commit: TWO, files: SOME_FILES });
      expect(held.warnings.filter((line) => line.includes(BRANCH))).toHaveLength(1);

      await run(project, download, { pinUrls: true, update: true });

      expect(gameProject(project.cwd)).toBe(`[project]\ndependencies#0 = ${AT_ONE}\n`);
      expect(locked(project.cwd)).toEqual({
        [AT_ONE]: { commit: ONE, files: anyFiles, follows: BRANCH },
      });
    });

    test("a plain run rewrites nothing", async () => {
      const body = `[project]\ndependencies#0 = ${BRANCH}\n`;
      const project = setUp(body);
      const { download } = serving({ [BRANCH]: archive("mylib-master", ONE) });

      await run(project, download);

      expect(gameProject(project.cwd)).toBe(body);
      expect(locked(project.cwd)[BRANCH]?.follows).toBeUndefined();
    });

    test("once Defold has fetched libraries, the notice says to fetch again", async () => {
      const project = setUp(`[project]\ndependencies#0 = ${BRANCH}\n`);
      mkdirSync(join(project.cwd, ".internal", "lib"), { recursive: true });
      writeFileSync(join(project.cwd, ".internal", "lib", "dependencies.json"), "[]");
      const { download } = serving({ [BRANCH]: archive("mylib-master", ONE) });

      const result = await run(project, download, { pinUrls: true });

      expect(result.notices?.some((line) => line.includes("bob resolve"))).toBe(true);
    });

    test("a URL that climbs out of its repo stays, with a warning, and follows nothing", async () => {
      const body = `[project]\ndependencies#0 = ${ESCAPE}\n`;
      const project = setUp(body);
      const { download } = serving({ [ESCAPE]: archive("fork-main", ONE) });

      const result = await run(project, download, { pinUrls: true });

      expect(gameProject(project.cwd)).toBe(body);
      expect(
        result.warnings.filter((line) => line.includes(ESCAPE) && line.includes("--pin-urls left")),
      ).toHaveLength(1);
      expect(locked(project.cwd)[ESCAPE]?.follows).toBeUndefined();
      expect(Object.values(locked(project.cwd)).some(({ follows }) => follows !== undefined)).toBe(
        false,
      );
    });

    describe("a save during the run", () => {
      const UNRELATED = `https://github.com/owner/unrelated/archive/${ONE}.zip`;
      const STARTED = `[project]\r\ntitle = T\r\ndependencies#0 = ${BRANCH}\r\ndependencies#1 = ${TAG}\r\n`;
      const archives = () => ({
        [BRANCH]: archive("mylib-master", ONE),
        [TAG]: archive("other-1", TWO, { doc: ALPHA.replaceAll("alpha", "beta") }),
        [THIRD]: archive("third-main", ONE),
      });

      const seededLock = (cwd: string) => {
        const path = join(cwd, PROJECT_LOCK_FILE);
        writeProjectLock(cwd, { extensions: { [UNRELATED]: { commit: ONE, files: SOME_FILES } } });
        const past = new Date(1_000_000_000_000);
        utimesSync(path, past, past);
        return { path, bytes: readFileSync(path, "utf8"), mtimeMs: statSync(path).mtimeMs };
      };

      test.each([
        [
          "swapping two lines",
          `[project]\r\ntitle = T\r\ndependencies#0 = ${TAG}\r\ndependencies#1 = ${BRANCH}\r\n`,
        ],
        [
          "replacing a moved line",
          `[project]\r\ntitle = T\r\ndependencies#0 = ${THIRD}\r\ndependencies#1 = ${TAG}\r\n`,
        ],
        ["removing a moved line", `[project]\r\ntitle = T\r\ndependencies#0 = ${BRANCH}\r\n`],
        [
          "adding a second line at a moved index",
          `[project]\r\ntitle = T\r\ndependencies#0 = ${BRANCH}\r\ndependencies#0 = ${THIRD}\r\ndependencies#1 = ${TAG}\r\n`,
        ],
      ])("%s stops the run and overwrites nothing", async (_label, saved) => {
        const project = setUp(STARTED);
        const lock = seededLock(project.cwd);

        const result = await run(
          project,
          savingDuring(project.cwd, saved, serving(archives()).download),
          { pinUrls: true },
        );

        expect(result.ok).toBe(false);
        expect(result.ok ? "" : result.error).toContain("game.project");
        expect(gameProject(project.cwd)).toBe(saved);
        expect(readFileSync(lock.path, "utf8")).toBe(lock.bytes);
        expect(statSync(lock.path).mtimeMs).toBe(lock.mtimeMs);
      });

      test("deleting game.project stops the run and does not bring it back", async () => {
        const project = setUp(STARTED);
        const lock = seededLock(project.cwd);

        const result = await run(
          project,
          savingDuring(project.cwd, null, serving(archives()).download),
          { pinUrls: true },
        );

        expect(result.ok).toBe(false);
        expect(existsSync(join(project.cwd, "game.project"))).toBe(false);
        expect(readFileSync(lock.path, "utf8")).toBe(lock.bytes);
      });

      test("an edit that leaves the moved lines alone is kept, byte for byte", async () => {
        const project = setUp(STARTED);
        const saved = `[project]\r\ntitle = Renamed\r\ndependencies#0 = ${BRANCH}\r\ndependencies#1 = ${TAG}\r\ndependencies#2 = ${THIRD}\r\n`;

        const result = await run(
          project,
          savingDuring(project.cwd, saved, serving(archives()).download),
          { pinUrls: true },
        );

        expect(result.ok).toBe(true);
        expect(gameProject(project.cwd)).toBe(
          `[project]\r\ntitle = Renamed\r\ndependencies#0 = ${AT_ONE}\r\ndependencies#1 = ${OTHER_AT_TWO}\r\ndependencies#2 = ${THIRD}\r\n`,
        );
      });
    });
  });

  describe("following a ref", () => {
    const pinnedProject = () => {
      const project = setUp(`[project]\ndependencies#0 = ${AT_ONE}\n`);
      const files = archiveIdentityOf(archive(`mylib-${ONE}`, ONE)).files;
      writeProjectLock(project.cwd, {
        extensions: { [AT_ONE]: { commit: ONE, files, follows: BRANCH } },
      });
      return project;
    };

    function archiveIdentityOf(bytes: Uint8Array): ArchiveIdentity {
      const path = join(tmp(), "archive.zip");
      writeFileSync(path, bytes);
      return archiveIdentity(readZip(path));
    }

    test("--update moves game.project and the lock to the ref's newer commit", async () => {
      const project = pinnedProject();
      const { download } = serving({
        [BRANCH]: archive("mylib-master", TWO),
        [AT_TWO]: archive(`mylib-${TWO}`, TWO),
      });

      const result = await run(project, download, { update: true });

      expect(result.ok).toBe(true);
      expect(gameProject(project.cwd)).toBe(`[project]\ndependencies#0 = ${AT_TWO}\n`);
      expect(locked(project.cwd)).toEqual({
        [AT_TWO]: { commit: TWO, files: anyFiles, follows: BRANCH },
      });
      expect(result.extensions[0]?.pinStatus).toBe("match");
      expect(result.notices?.some((line) => line.includes(AT_TWO))).toBe(true);
    });

    test("--update on the same commit changes nothing", async () => {
      const project = pinnedProject();
      const before = readFileSync(join(project.cwd, PROJECT_LOCK_FILE), "utf8");
      const { download } = serving({
        [BRANCH]: archive("mylib-master", ONE),
        [AT_ONE]: archive(`mylib-${ONE}`, ONE),
      });

      const result = await run(project, download, { update: true });

      expect(gameProject(project.cwd)).toBe(`[project]\ndependencies#0 = ${AT_ONE}\n`);
      expect(readFileSync(join(project.cwd, PROJECT_LOCK_FILE), "utf8")).toBe(before);
      expect(result.notices).toBeUndefined();
    });

    test("--update that accepts changed files under one commit keeps the ref", async () => {
      const project = pinnedProject();
      const { download } = serving({
        [BRANCH]: archive("mylib-master", ONE),
        [AT_ONE]: archive(`mylib-${ONE}`, ONE, { level: 'name: "changed"\n' }),
      });

      await run(project, download, { update: true });

      const pin = locked(project.cwd)[AT_ONE];
      expect(pin?.follows).toBe(BRANCH);
      expect(pin?.files).not.toBe(archiveIdentityOf(archive(`mylib-${ONE}`, ONE)).files);
    });

    test("--update=<name> touches that dependency alone", async () => {
      const OTHER_BRANCH = "https://github.com/owner/other/archive/main.zip";
      const OTHER_AT_ONE = `https://github.com/owner/other/archive/${ONE}.zip`;
      const project = setUp(
        `[project]\ndependencies#0 = ${AT_ONE}\ndependencies#1 = ${OTHER_AT_ONE}\n`,
      );
      const files = archiveIdentityOf(archive(`mylib-${ONE}`, ONE)).files;
      writeProjectLock(project.cwd, {
        extensions: {
          [AT_ONE]: { commit: ONE, files, follows: BRANCH },
          [OTHER_AT_ONE]: { commit: ONE, files, follows: OTHER_BRANCH },
        },
      });
      const { download, requests } = serving({
        [BRANCH]: archive("mylib-master", TWO),
        [AT_TWO]: archive(`mylib-${TWO}`, TWO),
        [OTHER_BRANCH]: archive("other-main", TWO),
        [OTHER_AT_ONE]: archive(`other-${ONE}`, ONE),
      });

      await run(project, download, { update: ["owner/mylib"] });

      expect(gameProject(project.cwd)).toBe(
        `[project]\ndependencies#0 = ${AT_TWO}\ndependencies#1 = ${OTHER_AT_ONE}\n`,
      );
      expect(requests).not.toContain(OTHER_BRANCH);
      expect(locked(project.cwd)[OTHER_AT_ONE]?.follows).toBe(OTHER_BRANCH);
    });

    test("a commit URL with no ref to follow holds under --update, with a notice", async () => {
      const project = setUp(`[project]\ndependencies#0 = ${AT_ONE}\n`);
      const { download, requests } = serving({ [AT_ONE]: archive(`mylib-${ONE}`, ONE) });

      const result = await run(project, download, { update: true });

      expect(gameProject(project.cwd)).toBe(`[project]\ndependencies#0 = ${AT_ONE}\n`);
      expect(requests).toEqual([AT_ONE]);
      expect(
        result.notices?.filter((line) => line.includes(AT_ONE) && line.includes("no ref")),
      ).toHaveLength(1);
    });

    test("a ref that cannot be checked holds, with a warning naming it", async () => {
      const project = pinnedProject();
      const { download } = serving({ [AT_ONE]: archive(`mylib-${ONE}`, ONE) });

      const result = await run(project, download, { update: true });

      expect(result.ok).toBe(true);
      expect(gameProject(project.cwd)).toBe(`[project]\ndependencies#0 = ${AT_ONE}\n`);
      expect(locked(project.cwd)[AT_ONE]?.follows).toBe(BRANCH);
      expect(result.warnings.filter((line) => line.includes(BRANCH))).toHaveLength(1);
    });

    test("a ref served only from the cache does not move the project", async () => {
      const project = pinnedProject();
      await run(
        project,
        serving({
          [BRANCH]: archive("mylib-master", TWO),
          [AT_TWO]: archive(`mylib-${TWO}`, TWO),
        }).download,
        { update: true },
      );
      writeProject(project.cwd, `[project]\ndependencies#0 = ${AT_ONE}\n`);
      writeProjectLock(project.cwd, {
        extensions: {
          [AT_ONE]: {
            commit: ONE,
            files: archiveIdentityOf(archive(`mylib-${ONE}`, ONE)).files,
            follows: BRANCH,
          },
        },
      });

      const result = await run(
        project,
        serving({ [AT_ONE]: archive(`mylib-${ONE}`, ONE) }).download,
        {
          update: true,
        },
      );

      expect(gameProject(project.cwd)).toBe(`[project]\ndependencies#0 = ${AT_ONE}\n`);
      expect(result.warnings.filter((line) => line.includes(BRANCH))).toHaveLength(1);
    });

    test("a ref whose archive names no commit holds, with a warning naming it", async () => {
      const project = pinnedProject();
      const { download } = serving({
        [BRANCH]: archive("mylib-master"),
        [AT_ONE]: archive(`mylib-${ONE}`, ONE),
      });

      const result = await run(project, download, { update: true });

      expect(gameProject(project.cwd)).toBe(`[project]\ndependencies#0 = ${AT_ONE}\n`);
      expect(result.warnings.filter((line) => line.includes(BRANCH))).toHaveLength(1);
    });

    test("a plain run on a commit URL requests no ref and reports no drift", async () => {
      const project = pinnedProject();
      const { download, requests } = serving({
        [BRANCH]: archive("mylib-master", TWO),
        [AT_ONE]: archive(`mylib-${ONE}`, ONE),
      });

      const result = await run(project, download);

      expect(requests).toEqual([AT_ONE]);
      expect(result.extensions[0]?.pinStatus).toBe("match");
      expect(locked(project.cwd)[AT_ONE]?.follows).toBe(BRANCH);
    });

    test("a lockfile whose ref climbs out of the repo stops ahead of any download", async () => {
      const project = pinnedProject();
      const files = archiveIdentityOf(archive(`mylib-${ONE}`, ONE)).files;
      writeProjectLock(project.cwd, {
        extensions: { [AT_ONE]: { commit: ONE, files, follows: ESCAPE } },
      });
      const lockBefore = readFileSync(join(project.cwd, PROJECT_LOCK_FILE), "utf8");
      const { download, requests } = serving({
        [ESCAPE]: archive("fork-main", TWO),
        [AT_TWO]: archive(`mylib-${TWO}`, TWO),
      });

      const result = await run(project, download, { update: true });

      expect(result.ok).toBe(false);
      expect(requests).toEqual([]);
      expect(gameProject(project.cwd)).toBe(`[project]\ndependencies#0 = ${AT_ONE}\n`);
      expect(readFileSync(join(project.cwd, PROJECT_LOCK_FILE), "utf8")).toBe(lockBefore);
    });

    test("--update stops when a save replaced the line it would move", async () => {
      const project = pinnedProject();
      const lockPath = join(project.cwd, PROJECT_LOCK_FILE);
      const past = new Date(1_000_000_000_000);
      utimesSync(lockPath, past, past);
      const lockBefore = readFileSync(lockPath, "utf8");
      const saved = `[project]\ndependencies#0 = ${OTHER_AT_TWO}\n`;
      const { download } = serving({
        [BRANCH]: archive("mylib-master", TWO),
        [AT_TWO]: archive(`mylib-${TWO}`, TWO),
      });

      const result = await run(project, savingDuring(project.cwd, saved, download), {
        update: true,
      });

      expect(result.ok).toBe(false);
      expect(result.ok ? "" : result.error).toContain("game.project");
      expect(gameProject(project.cwd)).toBe(saved);
      expect(readFileSync(lockPath, "utf8")).toBe(lockBefore);
      expect(statSync(lockPath).mtimeMs).toBe(past.getTime());
    });
  });
});

describe("runResolve reports each library's status", () => {
  const REPO = "https://github.com/owner/statuslib";
  const COMMIT_A = "a".repeat(40);
  const COMMIT_B = "b".repeat(40);
  // A commit URL, which draws no branch warning.
  const urlAt = (commit: string) => `${REPO}/archive/${commit}.zip`;

  const luaModule = (answer: number, ...added: readonly string[]) =>
    [
      "local M = {}",
      "---@return number",
      `function M.start() return ${answer} end`,
      ...added.map((name) => `function M.${name}() return 1 end`),
      "return M",
      "",
    ].join("\n");

  const gameProject = (name: string) => ({
    name: `${name}-1/game.project`,
    text: `[project]\ntitle = ${name}\n\n[library]\ninclude_dirs = ${name}\n`,
  });

  const archiveOf = (commit: string, source: string) =>
    writeZipArchive(
      [gameProject("statuslib"), { name: "statuslib-1/statuslib/core.lua", text: source }],
      { comment: commit },
    );

  const nativeArchiveOf = (commit: string, source: string) =>
    writeZipArchive(
      [
        gameProject("statuslib"),
        { name: "statuslib-1/statuslib/ext.manifest", text: "name: statuslib\n" },
        { name: "statuslib-1/statuslib/src/extension.cpp", text: source },
      ],
      { comment: commit },
    );

  function fingerprintOf(bytes: Uint8Array) {
    const path = join(tmp(), "archive.zip");
    writeFileSync(path, bytes);
    return archiveFingerprint(readZip(path));
  }

  const reviewsOf = (...records: readonly (readonly [Uint8Array, string])[]): LibraryReview[] =>
    records.reduce<LibraryReview[]>(
      (reviews, [bytes, commit]) => recordReview(reviews, fingerprintOf(bytes), commit).reviews,
      [],
    );

  type Lane = "fork" | "recipe" | "native";

  function writeStatusData(
    lane: Lane,
    reviews: readonly LibraryReview[] | null,
    folder = join(tmp(), "0.55.0"),
  ): string {
    const library = join(folder, "owner/statuslib");
    mkdirSync(join(library, "fork"), { recursive: true });
    if (lane === "fork") {
      writeFileSync(
        join(library, "fork", "statuslib.core.d.ts"),
        'declare module "statuslib.core" {\n  export const forked: number;\n}\n',
      );
      writeUndocumentedUpstreamLua(library, "source/upstream/statuslib.core.lua");
      writeLibraryTargets(folder, {
        forks: [
          {
            repo: REPO,
            ref: "1.0.0",
            authored: "fork/statuslib.core.d.ts",
            moduleId: "statuslib.core",
            namespace: "statuslib.core",
            apiDoc: "api-doc/statuslib.core.json",
            upstreamLua: ["source/upstream/statuslib.core.lua"],
          },
        ],
      });
    } else if (lane === "recipe") {
      writeLibraryTargets(folder, {
        luals: [
          {
            repo: REPO,
            ref: "1.0.0",
            sourceGlobs: ["statuslib/**/*.lua"],
            moduleId: "statuslib.core",
            namespace: "statuslib.core",
          },
        ],
      });
    } else {
      writeFileSync(
        join(library, "statuslib.d.ts"),
        "declare namespace statuslib {\n  const native: number;\n}\n",
      );
      writeLibraryTargets(folder, {
        native: [
          {
            repo: REPO,
            ref: "1.0.0",
            namespace: "statuslib",
            manifestDir: "statuslib",
            declaration: "statuslib.d.ts",
            upstreamSource: "source/upstream/src/extension.cpp",
          },
        ],
      });
    }
    if (reviews !== null) {
      writeReviewedJson(folder, "owner/statuslib", { ref: "1.0.0", reviews: [...reviews] });
    }
    return folder;
  }

  async function resolveAt(commit: string, bytes: Uint8Array, libraryDataDir: string | null) {
    const cwd = tmp();
    const url = urlAt(commit);
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataDir,
      download: async () => ({ status: "ok", bytes }),
    });
    expect(result.ok).toBe(true);
    return { cwd, url, result, status: result.extensions[0]?.libraryStatus };
  }

  describe.each(["fork", "recipe"] as const)("for a %s library", (lane) => {
    const reviewed = () => reviewsOf([archiveOf(COMMIT_A, luaModule(1)), COMMIT_A]);

    test("the commit reviewed is exact by commit", async () => {
      const { status } = await resolveAt(
        COMMIT_A,
        archiveOf(COMMIT_A, luaModule(1)),
        writeStatusData(lane, reviewed()),
      );
      expect(status).toEqual({ status: "exact", by: "commit" });
    });

    test("a changed body at an unreviewed commit is exact by api", async () => {
      const { status } = await resolveAt(
        COMMIT_B,
        archiveOf(COMMIT_B, luaModule(2)),
        writeStatusData(lane, reviewed()),
      );
      expect(status).toEqual({ status: "exact", by: "api" });
    });

    test("an added member follows how the library printed", async () => {
      const { status } = await resolveAt(
        COMMIT_B,
        archiveOf(COMMIT_B, luaModule(1, "added")),
        writeStatusData(lane, reviewed()),
      );
      expect(status).toEqual(
        lane === "fork"
          ? {
              status: "unsupported",
              closest: COMMIT_A,
              members: ["statuslib/core.lua#added"],
            }
          : { status: "generated" },
      );
    });

    test("the printed declaration does not depend on the status", async () => {
      const unreviewed = archiveOf(COMMIT_B, luaModule(1, "added"));
      const printed = async (folder: string) => {
        const { cwd, status } = await resolveAt(COMMIT_B, unreviewed, folder);
        const file = join(cwd, ".defold-types", LIBRARIES_DIR, "statuslib.core.d.ts");
        return { status: status?.status, bytes: readFileSync(file, "utf8") };
      };
      const newer = writeStatusData(lane, null);
      writeStatusData(lane, reviewsOf([unreviewed, COMMIT_B]), join(dirname(newer), "0.60.0"));

      const runs = [
        await printed(writeStatusData(lane, reviewsOf([unreviewed, COMMIT_B]))),
        await printed(writeStatusData(lane, reviewed())),
        await printed(writeStatusData(lane, null)),
        await printed(newer),
      ];

      expect(runs.map(({ status }) => status)).toEqual([
        "exact",
        lane === "fork" ? "unsupported" : "generated",
        "unrecorded",
        "newer-cli",
      ]);
      expect(new Set(runs.map(({ bytes }) => bytes)).size).toBe(1);
    });
  });

  test("a recipe that fell back to the pinned sources is unsupported", async () => {
    const url = "https://github.com/paweljarosz/lua-immutable/archive/v1.1.zip";
    const own = "immutable/immutable.lua";
    const source = readFileSync(
      join(LIBRARY_DATA_DIR, "paweljarosz/lua-immutable", "source", "immutable", own),
      "utf8",
    );
    const zipOf = (text: string) =>
      writeZipArchive([{ name: `lua-immutable-1.1/${own}`, text }], { comment: COMMIT_B });
    const folder = join(tmp(), "0.55.0");
    cpSync(
      join(LIBRARY_DATA_DIR, "paweljarosz/lua-immutable"),
      join(folder, "paweljarosz/lua-immutable"),
      {
        recursive: true,
      },
    );
    writeReviewedJson(folder, "paweljarosz/lua-immutable", {
      ref: "v1.1",
      reviews: reviewsOf([zipOf(source), COMMIT_A]),
    });
    const unprintable = zipOf(
      `${source}\n---@param value vmath.print_probe\nfunction Immutable.print_probe(value)\nend\n`,
    );
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataDir: folder,
      download: async () => ({ status: "ok", bytes: unprintable }),
    });

    expect(result.extensions[0]?.libraryStatus?.status).toBe("unsupported");
    expect(result.warnings.some((warning) => warning.startsWith("printed "))).toBe(true);
  });

  test("a native extension gets a status, printed from the pinned sources", async () => {
    const reviews = reviewsOf([nativeArchiveOf(COMMIT_A, "// one\n"), COMMIT_A]);
    const folder = () => writeStatusData("native", reviews);

    const exact = await resolveAt(COMMIT_A, nativeArchiveOf(COMMIT_A, "// one\n"), folder());
    const moved = await resolveAt(COMMIT_B, nativeArchiveOf(COMMIT_B, "// two\n"), folder());

    expect(exact.result.extensions[0]?.typeSurface).toBe("vendored-native");
    expect(exact.status).toEqual({ status: "exact", by: "commit" });
    expect(moved.status).toEqual({
      status: "unsupported",
      closest: COMMIT_A,
      members: ["statuslib/src/extension.cpp"],
    });
  });

  test("a dependency library data does not type gets no status", async () => {
    const data = () =>
      writeStatusData("fork", reviewsOf([archiveOf(COMMIT_A, luaModule(1)), COMMIT_A]));
    const scriptApi = writeZipArchive([{ name: "other-1/other/alpha.script_api", text: ALPHA }], {
      comment: COMMIT_B,
    });
    const shipped = writeZipArchive(
      [
        { name: "statuslib-1/statuslib/core.lua", text: luaModule(1) },
        { name: "statuslib-1/types/statuslib.d.ts", text: "export const value: number;\n" },
      ],
      { comment: COMMIT_A },
    );
    const assets = writeZipArchive([{ name: "other-1/asset/foo.png", text: "png" }], {
      comment: COMMIT_B,
    });
    const run = async (url: string, bytes: Uint8Array) => {
      const cwd = tmp();
      writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
      const { extensions } = await runResolve({
        cwd,
        cacheDir: tmp(),
        libraryDataDir: data(),
        typesRoot: null,
        download: async () => ({ status: "ok", bytes }),
      });
      return extensions[0];
    };
    const otherUrl = `https://github.com/owner/other/archive/${COMMIT_B}.zip`;

    const fromScriptApi = await run(otherUrl, scriptApi);
    const fromShipped = await run(urlAt(COMMIT_A), shipped);
    const unmatched = await run(otherUrl, assets);

    expect(fromScriptApi?.typeSurface).toBe("extension");
    expect(fromScriptApi).not.toHaveProperty("libraryStatus");
    expect(fromShipped?.typeSurface).toBe("shipped");
    expect(fromShipped).not.toHaveProperty("libraryStatus");
    expect(unmatched?.typeSurface).toBe("none");
    expect(unmatched).not.toHaveProperty("libraryStatus");
  });

  test("each dependency is classified against the reviews of its own library", async () => {
    const COMMIT_C = "c".repeat(40);
    const urlOf = (name: string, commit: string) =>
      `https://github.com/owner/${name}/archive/${commit}.zip`;
    const zipOf = (name: string, commit: string, source: string) =>
      writeZipArchive([gameProject(name), { name: `${name}-1/${name}/core.lua`, text: source }], {
        comment: commit,
      });
    const folder = writeAuthoredLibraryData({
      "first.core": 'declare module "first.core" {}\n',
      "second.core": 'declare module "second.core" {}\n',
    });
    writeReviewedJson(folder, "owner/first", {
      ref: "1.0.0",
      reviews: reviewsOf([zipOf("first", COMMIT_A, luaModule(1)), COMMIT_A]),
    });
    writeReviewedJson(folder, "owner/second", {
      ref: "1.0.0",
      reviews: reviewsOf([zipOf("second", COMMIT_C, luaModule(1)), COMMIT_C]),
    });
    const firstUrl = urlOf("first", COMMIT_A);
    const secondUrl = urlOf("second", COMMIT_B);
    const cwd = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${firstUrl}\ndependencies#1 = ${secondUrl}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      libraryDataDir: folder,
      download: async (url) => ({
        status: "ok",
        bytes: url.includes("/first/")
          ? zipOf("first", COMMIT_A, luaModule(1))
          : zipOf("second", COMMIT_B, luaModule(1, "added")),
      }),
    });

    expect(result.ok).toBe(true);
    expect(
      Object.fromEntries(result.extensions.map(({ url, libraryStatus }) => [url, libraryStatus])),
    ).toEqual({
      [firstUrl]: { status: "exact", by: "commit" },
      [secondUrl]: {
        status: "unsupported",
        closest: COMMIT_C,
        members: ["second/core.lua#added"],
      },
    });
  });

  test("a run with no library data gets no status", async () => {
    const { result } = await resolveAt(COMMIT_A, archiveOf(COMMIT_A, luaModule(1)), null);

    expect(result.extensions[0]).not.toHaveProperty("libraryStatus");
    expect(result.notices).toBeUndefined();
  });

  describe("a higher data folder", () => {
    const unreviewed = archiveOf(COMMIT_B, luaModule(1, "added"));

    function dataWithNewer(write: (library: string) => void): string {
      const folder = writeStatusData(
        "fork",
        reviewsOf([archiveOf(COMMIT_A, luaModule(1)), COMMIT_A]),
      );
      const library = join(dirname(folder), "0.60.0", "owner/statuslib");
      mkdirSync(library, { recursive: true });
      write(library);
      return folder;
    }

    test("that covers the commit gives newer-cli, naming the folder", async () => {
      const folder = dataWithNewer((library) =>
        writeFileSync(
          join(library, "reviewed.json"),
          JSON.stringify({ ref: "1.0.0", reviews: reviewsOf([unreviewed, COMMIT_B]) }),
        ),
      );

      const { status, url, result } = await resolveAt(COMMIT_B, unreviewed, folder);

      expect(status).toEqual({ status: "newer-cli", folder: "0.60.0" });
      expect(result.warnings).toEqual([]);
      const notice = result.notices?.find((line) => line.includes(url));
      expect(notice).toContain("0.60.0");
    });

    test("holding a malformed reviewed.json is ignored", async () => {
      const folder = dataWithNewer((library) =>
        writeFileSync(join(library, "reviewed.json"), "{ not json"),
      );

      const { status } = await resolveAt(COMMIT_B, unreviewed, folder);

      expect(status?.status).toBe("unsupported");
    });
  });

  test("a frozen run reports the same status from its pin and asks for no library data", async () => {
    const dataUrl = "https://example.test/library-data/archive/refs/heads/main.zip";
    const dataCommit = "1".repeat(40);
    const folder = writeStatusData(
      "fork",
      reviewsOf([archiveOf(COMMIT_A, luaModule(1)), COMMIT_A]),
    );
    const files = (readdirSync(folder, { recursive: true }) as string[]).filter((path) =>
      statSync(join(folder, path)).isFile(),
    );
    const data = writeZipArchive(
      files.map((path) => ({
        name: `library-data-${dataCommit}/data/0.0.1/${path.replace(/\\/g, "/")}`,
        text: readFileSync(join(folder, path), "utf8"),
      })),
      { comment: dataCommit },
    );
    const dependency = archiveOf(COMMIT_B, luaModule(1, "added"));
    const url = urlAt(COMMIT_B);
    const cwd = tmp();
    const cacheDir = tmp();
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const plain = await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: dataUrl,
      download: async (requested) => ({
        status: "ok",
        bytes: requested === url ? dependency : data,
      }),
    });
    const requests: string[] = [];
    const frozen = await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: dataUrl,
      freeze: true,
      download: async (requested) => {
        requests.push(requested);
        throw new Error(`no request expected: ${requested}`);
      },
    });

    expect(plain.extensions[0]?.libraryStatus?.status).toBe("unsupported");
    expect(frozen.ok).toBe(true);
    expect(frozen.extensions[0]?.libraryStatus).toEqual(
      plain.extensions[0]?.libraryStatus as LibraryStatus,
    );
    expect(requests).toEqual([url]);
  });

  describe("the plain report", () => {
    const reviewed = () => reviewsOf([archiveOf(COMMIT_A, luaModule(1)), COMMIT_A]);

    test("an exact library adds nothing", async () => {
      const { result } = await resolveAt(
        COMMIT_A,
        archiveOf(COMMIT_A, luaModule(1)),
        writeStatusData("fork", reviewed()),
      );

      expect(result.warnings).toEqual([]);
      expect(result.notices).toBeUndefined();
    });

    test("a generated library adds one notice naming its URL", async () => {
      const { result, url } = await resolveAt(
        COMMIT_B,
        archiveOf(COMMIT_B, luaModule(1, "added")),
        writeStatusData("recipe", reviewed()),
      );

      expect(result.warnings).toEqual([]);
      expect(result.notices).toHaveLength(1);
      expect(result.notices?.[0]).toContain(url);
    });

    test("an unsupported library warns with its closest commit and five members at most", async () => {
      const names = ["m1", "m2", "m3", "m4", "m5", "m6", "m7"];
      const { result, url } = await resolveAt(
        COMMIT_B,
        archiveOf(COMMIT_B, luaModule(1, ...names)),
        writeStatusData("fork", reviewed()),
      );

      expect(result.notices).toBeUndefined();
      expect(result.warnings).toHaveLength(1);
      const [warning] = result.warnings;
      expect(warning).toContain(url);
      expect(warning).toContain(COMMIT_A);
      expect(warning).toContain("statuslib/core.lua#m5");
      expect(warning).not.toContain("statuslib/core.lua#m6");
      expect(warning).toContain("+2 more");
    });

    test("an unsupported library with nothing to compare still warns", async () => {
      const { result, url } = await resolveAt(
        COMMIT_B,
        archiveOf(COMMIT_B, luaModule(1)),
        writeStatusData("fork", []),
      );

      expect(result.extensions[0]?.libraryStatus).toEqual({
        status: "unsupported",
        closest: null,
        members: [],
      });
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain(url);
    });

    test("every unrecorded library shares one notice naming them and resolve --update", async () => {
      const urlOf = (name: string) => `https://github.com/owner/${name}/archive/${COMMIT_A}.zip`;
      const zipOf = (name: string) =>
        writeZipArchive(
          [gameProject(name), { name: `${name}-1/${name}/core.lua`, text: "return {}\n" }],
          { comment: COMMIT_A },
        );
      const cwd = tmp();
      writeProject(
        cwd,
        `[project]\ndependencies#0 = ${urlOf("first")}\ndependencies#1 = ${urlOf("second")}\n`,
      );

      const result = await runResolve({
        cwd,
        cacheDir: tmp(),
        libraryDataDir: writeAuthoredLibraryData({
          "first.core": 'declare module "first.core" {}\n',
          "second.core": 'declare module "second.core" {}\n',
        }),
        download: async (url) => ({
          status: "ok",
          bytes: zipOf(url.includes("/first/") ? "first" : "second"),
        }),
      });

      expect(result.extensions.map(({ libraryStatus }) => libraryStatus?.status)).toEqual([
        "unrecorded",
        "unrecorded",
      ]);
      expect(result.warnings).toEqual([]);
      expect(result.notices).toHaveLength(1);
      expect(result.notices?.[0]).toContain(urlOf("first"));
      expect(result.notices?.[0]).toContain(urlOf("second"));
      expect(result.notices?.[0]).toContain("resolve --update");
    });

    test("a run whose --update moved every unrecorded library does not repeat the advice", async () => {
      const cwd = tmp();
      // A commit URL would add its own notice that `--update` has no ref to follow.
      const url = `${REPO}/archive/refs/tags/v1.zip`;
      writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
      const download: DownloadExtensionArchive = async () => ({
        status: "ok",
        bytes: archiveOf(COMMIT_B, luaModule(1)),
      });
      const libraryDataDir = writeStatusData("fork", null);

      const named = await runResolve({
        cwd,
        cacheDir: tmp(),
        libraryDataDir,
        update: ["owner/statuslib"],
        download,
      });
      const other = await runResolve({
        cwd,
        cacheDir: tmp(),
        libraryDataDir,
        update: ["owner/another"],
        download,
      });

      expect(named.notices).toHaveLength(1);
      expect(named.notices?.[0]).toContain(url);
      expect(named.notices?.[0]).not.toContain("resolve --update");
      expect(other.notices?.[0]).toContain("resolve --update");
    });
  });
});

describe("runResolve points an untyped Lua-sharing dependency at the guide", () => {
  // A GitHub-style archive whose own `game.project` shares `dir`, holding `luaPaths`.
  function luaArchive(repo: string, dir: string, luaPaths: readonly string[]): FakeArchive {
    const gameProject = `${repo}-main/game.project`;
    return {
      entries: [gameProject, ...luaPaths.map((path) => `${repo}-main/${path}`)],
      contents: { [gameProject]: `[library]\ninclude_dirs = ${dir}\n` },
    };
  }

  function untypedHints(notices: readonly string[] | undefined): string[] {
    return (notices ?? []).filter((notice) => notice.includes(UNTYPED_LIBRARY_GUIDE));
  }

  async function resolveArchives(
    archives: readonly (readonly [string, FakeArchive])[],
    libraryDataDir: string | null,
  ) {
    const cwd = tmp();
    const deps = archives.map(([url], i) => `dependencies#${i} = ${url}`).join("\n");
    writeProject(cwd, `[project]\n${deps}\n`);
    return runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(
        Object.fromEntries(archives.map(([url, archive]) => [extensionArchiveKey(url), archive])),
      ),
      libraryDataDir,
    });
  }

  test("one notice names every untyped Lua-sharing dependency in dependency order, and no asset pack", async () => {
    const zeta = "https://github.com/owner/zeta/archive/main.zip";
    const font = "https://github.com/owner/fontpack/archive/main.zip";
    const alpha = "https://github.com/owner/alpha/archive/main.zip";

    const result = await resolveArchives(
      [
        [zeta, luaArchive("zeta", "zeta", ["zeta/zeta.lua"])],
        [font, { entries: ["asset/foo.png"], contents: {} }],
        [alpha, luaArchive("alpha", "alpha", ["alpha/alpha.lua"])],
      ],
      writeAuthoredLibraryData({}),
    );

    expect(result.ok).toBe(true);
    const hints = untypedHints(result.notices);
    expect(hints).toHaveLength(1);
    expect(hints[0]).toContain(`${zeta}, ${alpha}`);
    expect(hints[0]).not.toContain(font);
  });

  test("Lua only in an examples directory under the include dir draws no notice", async () => {
    const url = "https://github.com/owner/gamma/archive/main.zip";

    const result = await resolveArchives(
      [[url, luaArchive("gamma", "gamma", ["gamma/examples/demo.lua"])]],
      writeAuthoredLibraryData({}),
    );

    expect(result.ok).toBe(true);
    expect(result.extensions[0]?.typeSurface).toBe("none");
    expect(result.extensions[0]?.assetOnly).toBe(true);
    expect(untypedHints(result.notices)).toEqual([]);
  });

  test("Lua outside every include dir draws no notice", async () => {
    const url = "https://github.com/owner/delta/archive/main.zip";

    const result = await resolveArchives(
      [[url, luaArchive("delta", "delta", ["scripts/delta.lua"])]],
      writeAuthoredLibraryData({}),
    );

    expect(result.ok).toBe(true);
    expect(result.extensions[0]?.typeSurface).toBe("none");
    expect(result.extensions[0]?.assetOnly).toBe(true);
    expect(untypedHints(result.notices)).toEqual([]);
  });

  test("a dependency library data types draws no notice", async () => {
    const url = "https://github.com/owner/mylib/archive/main.zip";

    const result = await resolveArchives(
      [[url, luaArchive("mylib", "mylib", ["mylib/core.lua"])]],
      writeAuthoredLibraryData({
        "mylib.core": "declare module 'mylib.core' { export const version: string; }\n",
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.extensions[0]?.typeSurface).toBe("vendored-library");
    expect(untypedHints(result.notices)).toEqual([]);
  });

  test("a run that read no library data draws no notice", async () => {
    const url = "https://github.com/owner/alpha/archive/main.zip";

    const result = await resolveArchives(
      [[url, luaArchive("alpha", "alpha", ["alpha/alpha.lua"])]],
      null,
    );

    expect(result.ok).toBe(true);
    expect(result.extensions[0]?.typeSurface).toBe("none");
    expect(untypedHints(result.notices)).toEqual([]);
  });
});
