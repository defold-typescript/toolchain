import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { curatedIndexPages, loadCuratedExtensionManifest } from "./extension-index-pages";

const manifest = loadCuratedExtensionManifest();

function pagesOf(url: string, entry: string, siblings: readonly string[] = []): string[] {
  return curatedIndexPages(url, entry, [entry, ...siblings], manifest);
}

describe("curatedIndexPages", () => {
  test("reads the shipped defold-extensions manifest", () => {
    expect(manifest.libraries.length).toBeGreaterThan(0);
  });

  test("matches a curated doc by repo and wrapper-stripped archive path", () => {
    expect(
      pagesOf(
        "https://github.com/defold/extension-steam/archive/refs/tags/3.0.0.zip",
        "extension-steam-3.0.0/steam/api/steam.script_api",
        ["extension-steam-3.0.0/steam/ext.manifest"],
      ),
    ).toEqual(["steam"]);
  });

  test("keys a doc by its page, not by the namespace it declares", () => {
    const url = "https://github.com/defold/extension-spine/archive/main.zip";
    expect(pagesOf(url, "extension-spine-main/defold-spine/api/spine_gui.script_api")).toEqual([
      "spine.gui",
    ]);
    expect(pagesOf(url, "extension-spine-main/defold-spine/api/spine.script_api")).toEqual([
      "spine",
    ]);
  });

  test("gives every page one .script_api documents", () => {
    expect(
      pagesOf(
        "https://github.com/defold/extension-rive/archive/refs/heads/main.zip",
        "extension-rive-main/defold-rive/api/rive.script_api",
      ).sort(),
    ).toEqual(["rive", "rive.cmd"]);
  });

  test("reads an archive packed without a wrapper directory", () => {
    expect(
      curatedIndexPages(
        "https://github.com/defold/extension-steam/archive/main.zip",
        "steam/api/steam.script_api",
        ["steam/api/steam.script_api", "game.project"],
        manifest,
      ),
    ).toEqual(["steam"]);
  });

  test("gives nothing for an unlisted repo or an unlisted path in a listed one", () => {
    expect(
      pagesOf(
        "https://github.com/someone/extension-unknown/archive/main.zip",
        "extension-unknown-main/steam/api/steam.script_api",
      ),
    ).toEqual([]);
    expect(
      pagesOf(
        "https://github.com/defold/extension-steam/archive/main.zip",
        "extension-steam-main/steam/api/other.script_api",
      ),
    ).toEqual([]);
  });

  test("a missing manifest gives no pages", () => {
    const empty = loadCuratedExtensionManifest(mkdtempSync(join(tmpdir(), "no-manifest-")));
    expect(empty.libraries).toEqual([]);
    expect(
      curatedIndexPages(
        "https://github.com/defold/extension-steam/archive/main.zip",
        "steam/api/steam.script_api",
        ["steam/api/steam.script_api"],
        empty,
      ),
    ).toEqual([]);
  });
});
