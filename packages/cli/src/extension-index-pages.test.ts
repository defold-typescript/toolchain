import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CURATED_EXTENSION_MANIFEST, curatedIndexPages } from "./extension-index-pages";
import { LIBRARY_TYPES_ROOT } from "./library/package-root";

function pagesOf(url: string, entry: string, siblings: readonly string[] = []): string[] {
  return curatedIndexPages(url, entry, [entry, ...siblings]);
}

describe("curatedIndexPages", () => {
  test("holds every doc page defold-extensions.json declares", () => {
    const source = JSON.parse(
      readFileSync(join(LIBRARY_TYPES_ROOT, "defold-extensions.json"), "utf8"),
    ) as {
      libraries: { repo: string; docs: { path: string; page: string }[] }[];
    };
    expect(CURATED_EXTENSION_MANIFEST).toEqual({
      libraries: source.libraries
        .filter((library) => library.docs.length > 0)
        .map(({ repo, docs }) => ({
          repo,
          docs: docs.map(({ path, page }) => ({ path, page })),
        })),
    });
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

  test("an empty manifest gives no pages", () => {
    expect(
      curatedIndexPages(
        "https://github.com/defold/extension-steam/archive/main.zip",
        "steam/api/steam.script_api",
        ["steam/api/steam.script_api"],
        { libraries: [] },
      ),
    ).toEqual([]);
  });
});
