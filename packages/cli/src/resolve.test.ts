import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import * as ts from "typescript";
import { writeZipArchive } from "../../types/test/zip-fixture";
import { resolveTypesPackageRoot } from "./api-registry";
import { readCliVersion } from "./cli-version";
import { runExportTypes } from "./export-types";
import {
  type DownloadExtensionArchive,
  type ExtensionZip,
  extensionArchiveKey,
} from "./extension-archive";
import { LIBRARY_DATA_DIR } from "./library/package-root";
import { printLibraryModules } from "./library/print-library";
import { readNativeTargets } from "./library/sync-native-types";
import { readNativeExpectations } from "./library/target-expectations";
import { writeAuthoredLibraryData } from "./library-data-fixture";
import { buildLualsRegistryEntries } from "./library-match";
import { librariesDirName } from "./library-materialize";
import { loadVendoredNativeRegistry } from "./library-registry";
import { type RunResolveOptions, runResolve } from "./resolve";
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

function makeReadZip(byKey: Record<string, FakeArchive>): (zipPath: string) => ExtensionZip {
  return (zipPath: string) => {
    const archive = byKey[basename(dirname(zipPath))];
    if (archive === undefined) {
      throw new Error(`no fake archive for ${zipPath}`);
    }
    return {
      entries: () => archive.entries,
      read: (entry: string) => {
        const text = archive.contents[entry];
        if (text === undefined) {
          throw new Error(`unexpected read of ${entry}`);
        }
        return text;
      },
      comment: () => archive.comment ?? "",
      bytes: (entry: string) => new TextEncoder().encode(archive.contents[entry] ?? ""),
    };
  };
}

function writePins(cwd: string, pins: Record<string, string>): string {
  const pkgPath = join(cwd, "package.json");
  writeFileSync(
    pkgPath,
    `${JSON.stringify({ "defold-typescript": { extensions: pins } }, null, 2)}\n`,
  );
  return pkgPath;
}

function readPins(pkgPath: string): Record<string, string> | undefined {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    "defold-typescript"?: { extensions?: Record<string, string> };
  };
  return pkg["defold-typescript"]?.extensions;
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
        provenance: "download",
        namespaces: ["alpha"],
        typeSurface: "extension",
        scriptApiCount: 1,
        sceneSources: 0,
        assetOnly: false,
        resolvedVersion: expect.stringMatching(/^files-sha256:[0-9a-f]{64}$/) as unknown as string,
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
        provenance: "download",
        namespaces: [],
        typeSurface: "none",
        scriptApiCount: 0,
        sceneSources: 0,
        assetOnly: true,
        resolvedVersion: expect.stringMatching(/^files-sha256:[0-9a-f]{64}$/) as unknown as string,
        pinStatus: "unpinned",
      },
    ]);
  });

  test("a commit pin that differs from the resolved commit reports drift and is kept", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = writePins(cwd, { [url]: `commit:${OTHER_COMMIT}` });
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
        comment: COMMIT,
      },
    };

    const result = await runResolve({
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
    expect(readPins(pkgPath)).toEqual({ [url]: `commit:${OTHER_COMMIT}` });
  });

  test("a plain run rewrites a retired zip-byte pin to the archive's commit", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    const retired = `sha256:${"a".repeat(64)}`;
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = writePins(cwd, { [url]: retired });
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
        comment: COMMIT,
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });

    expect(result.ok).toBe(true);
    expect(result.extensions[0]?.pinStatus).toBe("retired");
    expect(result.extensions[0]?.pinnedVersion).toBe(retired);
    expect(readPins(pkgPath)).toEqual({ [url]: `commit:${COMMIT}` });
  });

  test("freeze:true reports a retired pin and writes nothing", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = writePins(cwd, { [url]: `sha256:${"a".repeat(64)}` });
    const original = readFileSync(pkgPath, "utf8");
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
        comment: COMMIT,
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
      freeze: true,
    });

    expect(result.ok).toBe(true);
    expect(result.extensions[0]?.pinStatus).toBe("retired");
    expect(readFileSync(pkgPath, "utf8")).toBe(original);
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
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });
    expect(first.ok).toBe(true);
    const matchingDigest = first.extensions[0]?.resolvedVersion as string;
    expect(matchingDigest).toMatch(/^files-sha256:[0-9a-f]{64}$/);

    // Re-run with a package.json that pins the same digest
    writeFileSync(
      join(cwd, "package.json"),
      `${JSON.stringify(
        { "defold-typescript": { extensions: { [url]: matchingDigest } } },
        null,
        2,
      )}\n`,
    );
    const second = await runResolve({
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

  test("seeds an absent pin into package.json from the archive's commit", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = join(cwd, "package.json");
    writeFileSync(pkgPath, "{}\n");
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
        comment: COMMIT,
      },
    };

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });

    expect(result.ok).toBe(true);
    expect(readPins(pkgPath)).toEqual({ [url]: `commit:${COMMIT}` });
  });

  test("preserves an existing pin instead of clobbering it", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = writePins(cwd, { [url]: `files-sha256:${"b".repeat(64)}` });
    const byKey: Record<string, FakeArchive> = {
      [extensionArchiveKey(url)]: {
        entries: ["ext/api/alpha.script_api"],
        contents: { "ext/api/alpha.script_api": ALPHA },
      },
    };

    await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });

    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      "defold-typescript"?: { extensions?: Record<string, string> };
    };
    expect(pkg["defold-typescript"]?.extensions?.[url]).toBe(`files-sha256:${"b".repeat(64)}`);
  });

  test("freeze:true skips seeding absent pins but still computes pinStatus", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = join(cwd, "package.json");
    const original = "{}\n";
    writeFileSync(pkgPath, original);
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
      freeze: true,
    });

    expect(result.ok).toBe(true);
    // package.json is byte-unchanged — no pin seeded
    expect(readFileSync(pkgPath, "utf8")).toBe(original);
    // report still carries pinStatus
    const report = result.extensions[0] as { pinStatus: string };
    expect(report.pinStatus).toBe("unpinned");
  });

  test("freeze:true leaves drift detection intact (pinStatus:drift is reported)", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = join(cwd, "package.json");
    const original = `${JSON.stringify(
      { "defold-typescript": { extensions: { [url]: `commit:${OTHER_COMMIT}` } } },
      null,
      2,
    )}\n`;
    writeFileSync(pkgPath, original);
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
      freeze: true,
    });

    expect(result.ok).toBe(true);
    // file is byte-unchanged even when drift would have seeded otherwise
    expect(readFileSync(pkgPath, "utf8")).toBe(original);
    const report = result.extensions[0] as { pinStatus: string };
    expect(report.pinStatus).toBe("drift");
  });

  test("a prune-only run rewrites package.json, dropping an orphan pin", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    const orphanUrl = "https://example.com/gone.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = join(cwd, "package.json");
    writeFileSync(
      pkgPath,
      `${JSON.stringify(
        {
          "defold-typescript": {
            extensions: { [url]: "files-sha256:live", [orphanUrl]: "sha256:orphan" },
          },
        },
        null,
        2,
      )}\n`,
    );
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
    });

    expect(result.ok).toBe(true);
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      "defold-typescript"?: { extensions?: Record<string, string> };
    };
    expect(pkg["defold-typescript"]?.extensions?.[url]).toBe("files-sha256:live");
    expect(pkg["defold-typescript"]?.extensions?.[orphanUrl]).toBeUndefined();
  });

  test("freeze:true never prunes an orphan pin", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    const orphanUrl = "https://example.com/gone.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = join(cwd, "package.json");
    const original = `${JSON.stringify(
      {
        "defold-typescript": {
          extensions: { [url]: "files-sha256:live", [orphanUrl]: "sha256:orphan" },
        },
      },
      null,
      2,
    )}\n`;
    writeFileSync(pkgPath, original);
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
      freeze: true,
    });

    expect(result.ok).toBe(true);
    expect(readFileSync(pkgPath, "utf8")).toBe(original);
  });

  test("a project with no [dependencies] resolves clean with no writes", async () => {
    const cwd = tmp();
    writeProject(cwd, "[project]\ntitle = Test\n");
    const before = readFileSync(join(cwd, "tsconfig.json"), "utf8");

    const result = await runResolve({
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

    const result = await runResolve({ cwd, cacheDir: tmp() });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.materializedSurface).toBeNull();
    expect(result.extensions).toEqual([]);
    expect(existsSync(join(cwd, ".defold-types"))).toBe(false);
  });

  test("a game.project with no [project] section returns ok:false", async () => {
    const cwd = tmp();
    writeFileSync(join(cwd, "game.project"), "[display]\nwidth = 640\n");

    const result = await runResolve({ cwd, cacheDir: tmp() });

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
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

  const registry = [{ sourceId: "mylib", modules: ["mylib.core"] }];

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
      { url, source: "mylib", modules: ["mylib.core"], provenance: "vendored", verified: true },
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
        source: "nakama-defold",
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
      { url, source: "mylib", modules: [], provenance: "vendored", verified: false },
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

  const registry = [{ sourceId: "mylib", modules: ["mylib.core"] }];

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
      { url, source: "mylib", modules: ["mylib.core"], provenance: "vendored", verified: true },
    ]);

    expect(existsSync(join(cwd, ".defold-types", "extensions"))).toBe(false);
    expect(result.materializedSurface).toBeNull();
    expect(result.extensions[0]?.namespaces).toEqual([]);
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
      { sourceId: "defold-daabbcc", namespace: "daabbcc", manifestDir: "daabbcc", declarationPath },
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
            sourceId: "defold-pixels",
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
    const nativeRegistry = loadVendoredNativeRegistry();
    const target = nativeRegistry[0];
    if (target === undefined) {
      throw new Error("the committed corpus has no native target");
    }
    const exported = tmp();
    const { written } = await runExportTypes({ library: target.sourceId, cwd: exported });
    const url = `https://github.com/owner/${target.sourceId}/archive/refs/heads/main.zip`;
    const wrapper = `${target.sourceId}-main`;
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
      libraryRegistry: [{ sourceId: "mylib", modules: ["mylib.core"] }],
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
  const nativeRegistry = loadVendoredNativeRegistry();

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
    { sourceId: "druid", modules: ["druid.druid"], namespaces: { "druid.druid": "druid" } },
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
      { url, source: "druid", modules: ["druid.druid"], provenance: "vendored", verified: true },
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
      { url, source: "druid", modules: [], provenance: "vendored", verified: false },
    ]);
  });
});

describe("runResolve prints a LuaLS library from the dependency's archive", () => {
  const url = "https://github.com/paweljarosz/lua-immutable/archive/v1.1.zip";
  const wrapper = "lua-immutable-1.1";
  const own = "immutable/immutable.lua";
  const pinnedSource = readFileSync(
    join(LIBRARY_DATA_DIR, "lua-immutable", "source", "immutable", own),
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
        source: "lua-immutable",
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
        source: "defold-saver",
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
    const result = await runResolve({ cwd, cacheDir: tmp(), download: someBytes });

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

describe("runResolve with a library data archive", () => {
  const DATA_URL = "https://example.test/library-data/archive/refs/heads/main.zip";
  const DEP_URL = "https://github.com/owner/mylib/archive/main.zip";
  const ONE = "1111111111111111111111111111111111111111";
  const TWO = "2222222222222222222222222222222222222222";
  const declares = (version: string) =>
    `declare module "mylib.core" {\n  export const version: "${version}";\n}\n`;
  const DEPENDENCY = writeZipArchive(
    [
      { name: "mylib-main/mylib/core.lua", text: "return {}\n" },
      { name: "mylib-main/asset/foo.png", text: "png" },
    ],
    { comment: "3333333333333333333333333333333333333333" },
  );

  // A real data folder, packed the way GitHub packs the data repo's root.
  function dataArchive(commit: string, contents: string): Uint8Array {
    const folder = writeAuthoredLibraryData({ "mylib.core": contents });
    const files = (readdirSync(folder, { recursive: true }) as string[]).filter((path) =>
      statSync(join(folder, path)).isFile(),
    );
    return writeZipArchive(
      files.map((path) => ({
        name: `library-data-${commit}/0.0.1/${path.replace(/\\/g, "/")}`,
        text: readFileSync(join(folder, path), "utf8"),
      })),
      { comment: commit },
    );
  }

  function serving(data: Uint8Array | null): {
    download: DownloadExtensionArchive;
    requests: string[];
  } {
    const requests: string[] = [];
    return {
      requests,
      download: async (url) => {
        requests.push(url);
        if (url === DEP_URL) {
          return { status: "ok", bytes: DEPENDENCY };
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
  const namespaceOf = (cwd: string) =>
    (
      JSON.parse(readFileSync(join(cwd, "package.json"), "utf8")) as {
        "defold-typescript": { libraryData?: string; extensions?: Record<string, string> };
      }
    )["defold-typescript"];

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
    expect(namespaceOf(cwd).libraryData).toBe(ONE);
    expect(namespaceOf(cwd).extensions?.[DEP_URL]).toStartWith("commit:");
  });

  test("a second run against a newer archive moves the commit and prints from it", async () => {
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
      download: serving(dataArchive(TWO, declares("two"))).download,
    });

    expect(namespaceOf(cwd).libraryData).toBe(TWO);
    expect(readFileSync(surface(cwd), "utf8")).toBe(declares("two"));
  });

  test("a run at the recorded commit leaves package.json byte-identical", async () => {
    const cwd = project();
    const cacheDir = tmp();
    const { download } = serving(dataArchive(ONE, declares("one")));
    await runResolve({ cwd, cacheDir, libraryDataUrl: DATA_URL, download });
    const pkgPath = join(cwd, "package.json");
    const compact = JSON.stringify(JSON.parse(readFileSync(pkgPath, "utf8")));
    writeFileSync(pkgPath, compact);

    await runResolve({ cwd, cacheDir, libraryDataUrl: DATA_URL, download });

    expect(readFileSync(pkgPath, "utf8")).toBe(compact);
  });

  test("a frozen run holds to the recorded commit with no request for main", async () => {
    const cwd = project();
    const cacheDir = tmp();
    await runResolve({
      cwd,
      cacheDir,
      libraryDataUrl: DATA_URL,
      download: serving(dataArchive(ONE, declares("one"))).download,
    });
    const before = readFileSync(join(cwd, "package.json"), "utf8");
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
    expect(readFileSync(join(cwd, "package.json"), "utf8")).toBe(before);
  });

  test("a frozen run with nothing recorded fails and asks for a plain resolve", async () => {
    const cwd = project();
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

  test("an unreachable archive warns, keeps the surface and leaves the commit", async () => {
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
    expect(namespaceOf(cwd).libraryData).toBe(ONE);
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
