import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { type ExtensionZip, extensionArchiveKey } from "./extension-archive";
import { runResolve } from "./resolve";

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
        assetOnly: false,
        resolvedVersion: expect.stringMatching(/^sha256:[0-9a-f]{64}$/) as unknown as string,
        pinStatus: "unpinned",
      },
    ]);
  });

  test("an asset-only dependency writes nothing and reports assetOnly", async () => {
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
    expect(existsSync(join(cwd, ".defold-types"))).toBe(false);
    expect(result.extensions).toEqual([
      {
        url,
        provenance: "download",
        namespaces: [],
        scriptApiCount: 0,
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
    expect(readFileSync(join(cwd, ".defold-types", "libraries", "mylib.core.d.ts"), "utf8")).toBe(
      MYLIB,
    );
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).toContain("libraries");
    expect(result.libraries).toEqual([
      { url, source: "mylib", modules: ["mylib.core"], provenance: "vendored", verified: true },
    ]);
    // The dependency stays asset-only for the extension surface.
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
    expect(existsSync(join(cwd, ".defold-types", "libraries"))).toBe(false);
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
    expect(existsSync(join(cwd, ".defold-types", "libraries"))).toBe(false);
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
    expect(existsSync(join(cwd, ".defold-types", "libraries"))).toBe(false);
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
    expect(existsSync(join(cwd, ".defold-types", "libraries", "mylib.core.d.ts"))).toBe(false);
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
    expect(existsSync(join(cwd, ".defold-types", "libraries", "mylib.core.d.ts"))).toBe(true);

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
    expect(existsSync(join(cwd, ".defold-types", "libraries"))).toBe(false);
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).not.toContain("libraries");
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
    expect(existsSync(join(cwd, ".defold-types", "libraries", "mylib.core.d.ts"))).toBe(true);

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
    expect(existsSync(join(cwd, ".defold-types", "libraries"))).toBe(false);
    const tsconfig = JSON.parse(readFileSync(join(cwd, "tsconfig.json"), "utf8")) as {
      compilerOptions: { types: string[] };
    };
    expect(tsconfig.compilerOptions.types).not.toContain("libraries");
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
    expect(existsSync(join(cwd, ".defold-types", "libraries"))).toBe(false);
    expect(warnings.join("\n")).toContain("mylib.core");
  });
});
