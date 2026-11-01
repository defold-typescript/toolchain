import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "@defold-typescript/types/cli-runtime";
import { writeZipArchive, type ZipFixtureEntry } from "../../types/test/zip-fixture";
import { archivePin, mergeResolvedVersionPins } from "./extension-version";

const URL_A = "https://github.com/defold/extension-iap/archive/main.zip";
const URL_B = "https://github.com/defold/extension-push/archive/main.zip";

describe("archivePin", () => {
  const COMMIT = "5c33c398e3c1d3ab3c0ee0d5f8f45c4c7c4e0b21";

  function pinOf(entries: readonly ZipFixtureEntry[], comment?: string): string {
    const zipPath = join(mkdtempSync(join(tmpdir(), "archive-pin-")), "archive.zip");
    writeFileSync(zipPath, writeZipArchive(entries, comment === undefined ? {} : { comment }));
    return archivePin(readZip(zipPath));
  }

  function library(
    overrides: {
      lua?: string;
      example?: string;
      transition?: string;
      readme?: string;
      wrapper?: string;
      includeDirs?: string;
    } = {},
  ): ZipFixtureEntry[] {
    const wrapper = overrides.wrapper ?? "monarch-master";
    const gameProject = `[project]\ntitle = monarch\n\n[library]\ninclude_dirs = ${overrides.includeDirs ?? "monarch"}\n`;
    return [
      { name: `${wrapper}/`, text: "" },
      { name: `${wrapper}/game.project`, text: gameProject },
      { name: `${wrapper}/monarch/monarch.lua`, text: overrides.lua ?? "return {}\n" },
      { name: `${wrapper}/monarch/monarch.gui`, text: "script: ''\n" },
      {
        name: `${wrapper}/monarch/transitions/fade.lua`,
        text: overrides.transition ?? "return {}\n",
      },
      { name: `${wrapper}/example/example.script`, text: overrides.example ?? "-- example\n" },
      { name: `${wrapper}/README.md`, text: overrides.readme ?? "# monarch\n" },
    ];
  }

  test("names the commit a 40-hex zip comment carries", () => {
    expect(pinOf(library(), COMMIT)).toBe(`commit:${COMMIT}`);
  });

  test("hashes the files when the comment is not a lowercase 40-hex commit", () => {
    const files = pinOf(library());
    expect(files).toMatch(/^files-sha256:[0-9a-f]{64}$/);
    for (const comment of [COMMIT.toUpperCase(), `${COMMIT}\n`, COMMIT.slice(1), "v1.0"]) {
      expect(pinOf(library(), comment)).toBe(files);
    }
  });

  test("a files pin ignores a change outside include_dirs", () => {
    expect(pinOf(library({ example: "-- edited\n" }))).toBe(pinOf(library()));
  });

  test("a files pin changes with any file inside include_dirs, a script as well as a scene", () => {
    expect(pinOf(library({ lua: "return { edited = true }\n" }))).not.toBe(pinOf(library()));
  });

  test("a files pin over a slash-wrapped nested dir moves only with a file beneath it", () => {
    const nested = (overrides: Parameters<typeof library>[0] = {}) =>
      pinOf(library({ includeDirs: "/monarch/transitions/", ...overrides }));
    const unedited = nested();
    expect(nested({ lua: "return { edited = true }\n" })).toBe(unedited);
    expect(nested({ example: "-- edited\n" })).toBe(unedited);
    expect(nested({ readme: "# edited\n" })).toBe(unedited);
    expect(nested({ transition: "return { edited = true }\n" })).not.toBe(unedited);
  });

  test("a files pin over whitespace-separated dirs moves only with a file beneath one", () => {
    const spaced = (overrides: Parameters<typeof library>[0] = {}) =>
      pinOf(library({ includeDirs: "monarch example", ...overrides }));
    const unedited = spaced();
    expect(spaced({ readme: "# edited\n" })).toBe(unedited);
    expect(spaced({ example: "-- edited\n" })).not.toBe(unedited);
  });

  test("a files pin does not depend on the archive wrapper's name", () => {
    expect(pinOf(library({ wrapper: "monarch-6.0.3" }))).toBe(pinOf(library()));
  });

  test("an archive with no game.project hashes every entry", () => {
    const bare = (readme: string): ZipFixtureEntry[] => [
      { name: "lib/lib.lua", text: "return {}\n" },
      { name: "lib/readme.md", text: readme },
    ];
    expect(pinOf(bare("a\n"))).toMatch(/^files-sha256:[0-9a-f]{64}$/);
    expect(pinOf(bare("b\n"))).not.toBe(pinOf(bare("a\n")));
  });
});

describe("mergeResolvedVersionPins", () => {
  test("adds a pin when the url is absent", () => {
    expect(mergeResolvedVersionPins({}, { [URL_A]: "commit:new" })).toEqual({
      [URL_A]: "commit:new",
    });
  });

  test("keeps a recorded pin over a newly resolved one", () => {
    expect(mergeResolvedVersionPins({ [URL_A]: "commit:old" }, { [URL_A]: "commit:new" })).toEqual({
      [URL_A]: "commit:old",
    });
  });

  test("seeds a new url beside a kept one", () => {
    expect(
      mergeResolvedVersionPins(
        { [URL_A]: "commit:old" },
        { [URL_A]: "commit:new", [URL_B]: "commit:b" },
      ),
    ).toEqual({ [URL_A]: "commit:old", [URL_B]: "commit:b" });
  });

  test("drops a pin for a url no longer resolved", () => {
    expect(
      mergeResolvedVersionPins(
        { [URL_A]: "commit:a", [URL_B]: "commit:b" },
        { [URL_A]: "commit:a" },
      ),
    ).toEqual({ [URL_A]: "commit:a" });
  });

  test("returns a fresh object, not a reference to the input", () => {
    const pins = { [URL_A]: "commit:a" };
    expect(mergeResolvedVersionPins(pins, { [URL_A]: "commit:a" })).not.toBe(pins);
  });
});
