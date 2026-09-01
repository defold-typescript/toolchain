import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { readCliVersion } from "./cli-version";
import { type ExtensionZip, extensionArchiveKey } from "./extension-archive";
import { buildLualsRegistryEntries } from "./library-match";
import { librariesDirName } from "./library-materialize";
import { runResolve } from "./resolve";
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
}

const someBytes = async (): Promise<Uint8Array> => new TextEncoder().encode("z");

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
    };
  };
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
        scriptApiCount: 1,
        sceneSources: 0,
        assetOnly: false,
        resolvedVersion: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) as unknown as string,
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
        scriptApiCount: 0,
        sceneSources: 0,
        assetOnly: true,
        resolvedVersion: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) as unknown as string,
        pinStatus: "unpinned",
      },
    ]);
  });

  test("carries resolvedVersion and matches pinnedVersion when the project pins the url", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    writeFileSync(
      join(cwd, "package.json"),
      `${JSON.stringify(
        { "defold-typescript": { extensions: { [url]: "sha256:pinned" } } },
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
    expect(result.extensions).toHaveLength(1);
    const report = result.extensions[0] as {
      resolvedVersion: string;
      pinnedVersion?: string;
      pinStatus: "unpinned" | "match" | "drift";
    };
    expect(report.resolvedVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.pinnedVersion).toBe("sha256:pinned");
    expect(report.pinStatus).toBe("drift");
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
    expect(matchingDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

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
    expect(report.resolvedVersion).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.pinnedVersion).toBeUndefined();
    expect(report.pinStatus).toBe("unpinned");
  });

  test("seeds an absent pin into package.json from the resolved archive digest", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = join(cwd, "package.json");
    writeFileSync(pkgPath, "{}\n");
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
    expect(pkg["defold-typescript"]?.extensions?.[url]).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test("preserves an existing pin instead of clobbering it", async () => {
    const cwd = tmp();
    const url = "https://example.com/alpha.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const pkgPath = join(cwd, "package.json");
    writeFileSync(
      pkgPath,
      `${JSON.stringify(
        { "defold-typescript": { extensions: { [url]: "sha256:kept" } } },
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

    await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(byKey),
    });

    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      "defold-typescript"?: { extensions?: Record<string, string> };
    };
    expect(pkg["defold-typescript"]?.extensions?.[url]).toBe("sha256:kept");
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
      { "defold-typescript": { extensions: { [url]: "sha256:stale" } } },
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
            extensions: { [url]: "sha256:live", [orphanUrl]: "sha256:orphan" },
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
    expect(pkg["defold-typescript"]?.extensions?.[url]).toBe("sha256:live");
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
          extensions: { [url]: "sha256:live", [orphanUrl]: "sha256:orphan" },
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

describe("runResolve library matching", () => {
  const MYLIB = "declare module 'mylib.core' { export const version: string; }\n";

  function seedGenerated(): string {
    const dir = tmp();
    writeFileSync(join(dir, "mylib.core.d.ts"), MYLIB);
    return dir;
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
      libraryGeneratedDir: seedGenerated(),
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

    // No libraryRegistry/libraryGeneratedDir override: this exercises the real
    // merged corpus, where all three modules now come from the authored lane
    // under the `nakama-defold` sourceId and must fold into one matched entry.
    // `nakama.nakama` severed onto the bare namespace, so its golden is
    // `generated/nakama.d.ts` while it still materializes under the module id
    // `nakama.nakama.d.ts` — the stem is what makes that mapping happen.
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
      libraryGeneratedDir: seedGenerated(),
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
      libraryGeneratedDir: seedGenerated(),
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
      libraryGeneratedDir: seedGenerated(),
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
      libraryGeneratedDir: seedGenerated(),
    });

    expect(result.ok).toBe(true);
    expect(result.libraries).toEqual([]);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR, "mylib.core.d.ts"))).toBe(false);
  });

  test("re-running after the matched dependency stops matching prunes the surface and derefs tsconfig", async () => {
    const cwd = tmp();
    const cacheDir = tmp();
    const generatedDir = seedGenerated();
    const matchUrl = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${matchUrl}\n`);

    await runResolve({
      cwd,
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(verifiedMylibArchive(matchUrl)),
      libraryRegistry: registry,
      libraryGeneratedDir: generatedDir,
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
      libraryGeneratedDir: generatedDir,
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
    const generatedDir = seedGenerated();
    const matchUrl = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${matchUrl}\n`);

    await runResolve({
      cwd,
      cacheDir,
      download: someBytes,
      readZip: makeReadZip(verifiedMylibArchive(matchUrl)),
      libraryRegistry: registry,
      libraryGeneratedDir: generatedDir,
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
      libraryGeneratedDir: generatedDir,
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).not.toContain(LIBRARIES_DIR);
  });

  test("a matched library whose generated file is missing is reported on stderr, not thrown", async () => {
    const cwd = tmp();
    const url = "https://github.com/owner/mylib/archive/main.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);
    const emptyGeneratedDir = tmp();

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
        libraryGeneratedDir: emptyGeneratedDir,
      });
    } finally {
      console.warn = originalWarn;
    }

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    expect(warnings.join("\n")).toContain("mylib.core");
  });
});

describe("runResolve druid LuaLS library", () => {
  const DRUID = "declare module 'druid.druid' { export const version: string; }\n";

  // druid's committed types live in `generated/druid.d.ts` (named for its
  // namespace), so the generated stem is `druid`, not the `druid.druid` module.
  function seedDruidGenerated(): string {
    const dir = tmp();
    writeFileSync(join(dir, "druid.d.ts"), DRUID);
    return dir;
  }

  const druidRegistry = [
    { sourceId: "druid", modules: ["druid.druid"], generatedStems: { "druid.druid": "druid" } },
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

  test("materializes druid's committed types from the generated stem and reports it verified", async () => {
    const cwd = tmp();
    const url = "https://github.com/Insality/druid/archive/1.2.5.zip";
    writeProject(cwd, `[project]\ndependencies#0 = ${url}\n`);

    const result = await runResolve({
      cwd,
      cacheDir: tmp(),
      download: someBytes,
      readZip: makeReadZip(verifiedDruidArchive(url)),
      libraryRegistry: druidRegistry,
      libraryGeneratedDir: seedDruidGenerated(),
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
      libraryGeneratedDir: seedDruidGenerated(),
    });

    expect(result.ok).toBe(true);
    expect(existsSync(join(cwd, ".defold-types", LIBRARIES_DIR))).toBe(false);
    expect(result.libraries).toEqual([
      { url, source: "druid", modules: [], provenance: "vendored", verified: false },
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

  function seedSaverGenerated(): string {
    const dir = tmp();
    writeFileSync(join(dir, "saver.saver.d.ts"), SAVER);
    writeFileSync(join(dir, "saver.storage.d.ts"), STORAGE);
    return dir;
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
      libraryGeneratedDir: seedSaverGenerated(),
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
      libraryGeneratedDir: null,
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
      libraryGeneratedDir: null,
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
      libraryGeneratedDir: null,
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
        libraryGeneratedDir: null,
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
    expect(warnings.join("\n")).toContain(url);
    expect(warnings.join("\n")).toContain("game.project");
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
        libraryGeneratedDir: null,
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
    expect(warnings.filter((line) => line.includes(escaping))).toEqual([
      `refusing unsafe scene path from ${url}: ${escaping}`,
    ]);
  });
});
