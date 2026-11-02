import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CuratedExtensionManifest,
  curatedIndexPages,
  loadCuratedExtensionManifest,
} from "./extension-index-pages";
import { DEFOLD_EXTENSIONS_FILE } from "./library/library-data";

const MANIFEST: CuratedExtensionManifest = {
  libraries: [
    {
      repo: "https://github.com/owner/ext-alpha",
      docs: [{ path: "alpha/api/alpha.script_api", page: "alpha" }],
    },
    {
      repo: "https://github.com/owner/ext-bravo",
      docs: [
        { path: "bravo/api/bravo_gui.script_api", page: "bravo.gui" },
        { path: "bravo/api/bravo.script_api", page: "bravo" },
      ],
    },
    {
      repo: "https://github.com/owner/ext-charlie",
      docs: [
        { path: "charlie/api/charlie.script_api", page: "charlie" },
        { path: "charlie/api/charlie.script_api", page: "charlie.cmd" },
      ],
    },
  ],
};

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "extension-index-pages-"));
}

function pagesOf(url: string, entry: string, siblings: readonly string[] = []): string[] {
  return curatedIndexPages(url, entry, [entry, ...siblings], MANIFEST);
}

describe("curatedIndexPages", () => {
  test("matches a curated doc by repo and wrapper-stripped archive path", () => {
    expect(
      pagesOf(
        "https://github.com/owner/ext-alpha/archive/refs/tags/3.0.0.zip",
        "ext-alpha-3.0.0/alpha/api/alpha.script_api",
        ["ext-alpha-3.0.0/alpha/ext.manifest"],
      ),
    ).toEqual(["alpha"]);
  });

  test("keys a doc by its page, not by the namespace it declares", () => {
    const url = "https://github.com/owner/ext-bravo/archive/main.zip";
    expect(pagesOf(url, "ext-bravo-main/bravo/api/bravo_gui.script_api")).toEqual(["bravo.gui"]);
    expect(pagesOf(url, "ext-bravo-main/bravo/api/bravo.script_api")).toEqual(["bravo"]);
  });

  test("gives every page one .script_api documents", () => {
    expect(
      pagesOf(
        "https://github.com/owner/ext-charlie/archive/refs/heads/main.zip",
        "ext-charlie-main/charlie/api/charlie.script_api",
      ).sort(),
    ).toEqual(["charlie", "charlie.cmd"]);
  });

  test("reads an archive packed without a wrapper directory", () => {
    expect(
      curatedIndexPages(
        "https://github.com/owner/ext-alpha/archive/main.zip",
        "alpha/api/alpha.script_api",
        ["alpha/api/alpha.script_api", "game.project"],
        MANIFEST,
      ),
    ).toEqual(["alpha"]);
  });

  test("gives nothing for an unlisted repo or an unlisted path in a listed one", () => {
    expect(
      pagesOf(
        "https://github.com/someone/extension-unknown/archive/main.zip",
        "extension-unknown-main/alpha/api/alpha.script_api",
      ),
    ).toEqual([]);
    expect(
      pagesOf(
        "https://github.com/owner/ext-alpha/archive/main.zip",
        "ext-alpha-main/alpha/api/other.script_api",
      ),
    ).toEqual([]);
  });

  test("an empty manifest gives no pages", () => {
    expect(
      curatedIndexPages(
        "https://github.com/owner/ext-alpha/archive/main.zip",
        "alpha/api/alpha.script_api",
        ["alpha/api/alpha.script_api"],
        { libraries: [] },
      ),
    ).toEqual([]);
  });
});

describe("loadCuratedExtensionManifest", () => {
  const STEAM = "https://github.com/defold/extension-steam/archive/refs/tags/3.0.0.zip";
  const STEAM_ENTRY = "extension-steam-3.0.0/steam/api/steam.script_api";
  const steamPages = (manifest: CuratedExtensionManifest) =>
    curatedIndexPages(STEAM, STEAM_ENTRY, [STEAM_ENTRY], manifest);

  test("reads each doc's page from the data folder's defold-extensions.json", () => {
    const dir = tmp();
    writeFileSync(
      join(dir, DEFOLD_EXTENSIONS_FILE),
      JSON.stringify({
        libraries: [
          {
            repo: "https://github.com/defold/extension-steam",
            ref: "3.0.0",
            docs: [
              { path: "steam/api/steam.script_api", namespace: "steamworks", page: "steam.page" },
            ],
          },
          { repo: "https://github.com/defold/codepad", ref: "1.2.0", docs: [] },
        ],
      }),
    );

    expect(steamPages(loadCuratedExtensionManifest(dir))).toEqual(["steam.page"]);
  });

  test.each([
    ["no data folder", () => null],
    ["a data folder without the file", () => tmp()],
    [
      "a file that does not parse",
      () => {
        const dir = tmp();
        writeFileSync(join(dir, DEFOLD_EXTENSIONS_FILE), "{");
        return dir;
      },
    ],
  ])("%s gives no pages", (_name, dataDir) => {
    const manifest = loadCuratedExtensionManifest(dataDir());
    expect(manifest).toEqual({ libraries: [] });
    expect(steamPages(manifest)).toEqual([]);
  });
});
