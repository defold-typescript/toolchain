import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extensionArchiveKey } from "./extension-archive";
import { materializeLibrarySceneSources } from "./library-scene-materialize";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "library-scenes-"));
}

const DRUID_URL = "https://github.com/Insality/druid/archive/1.2.3.zip";
const EXTRA_URL = "https://github.com/example/extra/archive/main.zip";

const DRUID_BUNDLE = {
  url: DRUID_URL,
  sceneSources: [
    { path: "druid/druid.collection", text: 'name: "druid"\n' },
    { path: "druid/nested/deep.go", text: 'components {\n  id: "deep"\n}\n' },
  ],
};

const EXTRA_BUNDLE = {
  url: EXTRA_URL,
  sceneSources: [{ path: "extra/x.gui", text: 'nodes {\n  id: "root"\n}\n' }],
};

function dependenciesDir(cwd: string): string {
  return join(cwd, ".defold-types", "dependencies");
}

function readManifest(cwd: string): { dependencies: { key: string; url: string }[] } {
  return JSON.parse(readFileSync(join(dependenciesDir(cwd), "dependencies.json"), "utf8")) as {
    dependencies: { key: string; url: string }[];
  };
}

describe("materializeLibrarySceneSources", () => {
  test("writes each dependency's shared scenes under its archive key, with a manifest", () => {
    const cwd = tmp();
    const result = materializeLibrarySceneSources({
      cwd,
      bundles: [DRUID_BUNDLE, EXTRA_BUNDLE],
    });

    expect(result.materializedDir).toBe(".defold-types/dependencies");
    const druidKey = extensionArchiveKey(DRUID_URL);
    const extraKey = extensionArchiveKey(EXTRA_URL);
    expect(
      readFileSync(join(dependenciesDir(cwd), druidKey, "druid", "druid.collection"), "utf8"),
    ).toBe('name: "druid"\n');
    expect(
      readFileSync(join(dependenciesDir(cwd), druidKey, "druid", "nested", "deep.go"), "utf8"),
    ).toBe('components {\n  id: "deep"\n}\n');
    expect(readFileSync(join(dependenciesDir(cwd), extraKey, "extra", "x.gui"), "utf8")).toBe(
      'nodes {\n  id: "root"\n}\n',
    );

    expect(readManifest(cwd).dependencies).toEqual(
      [
        { key: druidKey, url: DRUID_URL },
        { key: extraKey, url: EXTRA_URL },
      ].sort((a, b) => (a.key < b.key ? -1 : 1)),
    );
    expect(result.counts.get(DRUID_URL)).toBe(2);
    expect(result.counts.get(EXTRA_URL)).toBe(1);
  });

  test("reconciles the surface to the live dependency set, down to nothing", () => {
    const cwd = tmp();
    materializeLibrarySceneSources({ cwd, bundles: [DRUID_BUNDLE, EXTRA_BUNDLE] });

    materializeLibrarySceneSources({ cwd, bundles: [EXTRA_BUNDLE] });
    expect(existsSync(join(dependenciesDir(cwd), extensionArchiveKey(DRUID_URL)))).toBe(false);
    expect(readdirSync(dependenciesDir(cwd)).sort()).toEqual(
      ["dependencies.json", extensionArchiveKey(EXTRA_URL)].sort(),
    );
    expect(readManifest(cwd).dependencies).toEqual([
      { key: extensionArchiveKey(EXTRA_URL), url: EXTRA_URL },
    ]);

    const emptied = materializeLibrarySceneSources({ cwd, bundles: [] });
    expect(emptied.materializedDir).toBeNull();
    expect(existsSync(dependenciesDir(cwd))).toBe(false);
  });

  test("a dependency that shares nothing gets no directory but is still listed", () => {
    const cwd = tmp();
    const result = materializeLibrarySceneSources({
      cwd,
      bundles: [DRUID_BUNDLE, { url: EXTRA_URL, sceneSources: [] }],
    });

    expect(existsSync(join(dependenciesDir(cwd), extensionArchiveKey(EXTRA_URL)))).toBe(false);
    // Listed anyway: the scene walk reads the manifest to tell a dependency that
    // shares no scenes from one this resolve never reached, and only the second
    // is a hole in the address universe.
    expect(readManifest(cwd).dependencies).toEqual(
      [
        { key: extensionArchiveKey(DRUID_URL), url: DRUID_URL },
        { key: extensionArchiveKey(EXTRA_URL), url: EXTRA_URL },
      ].sort((a, b) => (a.key < b.key ? -1 : 1)),
    );
    expect(result.counts.get(EXTRA_URL)).toBe(0);
  });

  test("a dependency that stops sharing keeps its manifest row and loses its directory", () => {
    const cwd = tmp();
    materializeLibrarySceneSources({ cwd, bundles: [DRUID_BUNDLE, EXTRA_BUNDLE] });

    materializeLibrarySceneSources({
      cwd,
      bundles: [DRUID_BUNDLE, { url: EXTRA_URL, sceneSources: [] }],
    });

    expect(existsSync(join(dependenciesDir(cwd), extensionArchiveKey(EXTRA_URL)))).toBe(false);
    expect(
      readManifest(cwd)
        .dependencies.map((entry) => entry.url)
        .sort(),
    ).toEqual([DRUID_URL, EXTRA_URL].sort());
  });
});
