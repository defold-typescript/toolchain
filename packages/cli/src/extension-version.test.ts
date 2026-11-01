import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "@defold-typescript/types/cli-runtime";
import { writeZipArchive, type ZipFixtureEntry } from "../../types/test/zip-fixture";
import {
  type ArchiveIdentity,
  archiveIdentity,
  archiveVersion,
  mergeResolvedVersionPins,
} from "./extension-version";

const URL_A = "https://github.com/defold/extension-iap/archive/main.zip";
const URL_B = "https://github.com/defold/extension-push/archive/main.zip";

describe("archiveIdentity", () => {
  const COMMIT = "5c33c398e3c1d3ab3c0ee0d5f8f45c4c7c4e0b21";

  function identityOf(entries: readonly ZipFixtureEntry[], comment?: string): ArchiveIdentity {
    const zipPath = join(mkdtempSync(join(tmpdir(), "archive-identity-")), "archive.zip");
    writeFileSync(zipPath, writeZipArchive(entries, comment === undefined ? {} : { comment }));
    return archiveIdentity(readZip(zipPath));
  }

  const filesOf = (entries: readonly ZipFixtureEntry[], comment?: string): string =>
    identityOf(entries, comment).files;

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

  test("a 40-hex zip comment gives the commit beside the same files hash", () => {
    expect(identityOf(library(), COMMIT)).toEqual({
      commit: COMMIT,
      files: filesOf(library()),
    });
  });

  test("anything but a lowercase 40-hex comment gives the files hash alone", () => {
    const files = filesOf(library());
    expect(files).toMatch(/^[0-9a-f]{64}$/);
    for (const comment of [COMMIT.toUpperCase(), `${COMMIT}\n`, COMMIT.slice(1), "v1.0"]) {
      expect(identityOf(library(), comment)).toEqual({ files });
    }
  });

  for (const [name, comment] of [
    ["with no commit", undefined],
    ["under a commit", COMMIT],
  ] as const) {
    describe(`the files hash ${name}`, () => {
      const unedited = filesOf(library(), comment);

      test("ignores a change outside include_dirs", () => {
        expect(filesOf(library({ example: "-- edited\n" }), comment)).toBe(unedited);
      });

      test("ignores a renamed archive wrapper", () => {
        expect(filesOf(library({ wrapper: "monarch-6.0.3" }), comment)).toBe(unedited);
      });

      test("moves with a changed included file, a script as well as a scene", () => {
        expect(filesOf(library({ lua: "return { edited = true }\n" }), comment)).not.toBe(unedited);
      });

      test("moves with an added included file", () => {
        const added = [
          ...library(),
          { name: "monarch-master/monarch/added.lua", text: "return {}\n" },
        ];
        expect(filesOf(added, comment)).not.toBe(unedited);
      });

      test("moves with a removed included file", () => {
        const removed = library().filter(({ name }) => !name.endsWith("monarch.gui"));
        expect(filesOf(removed, comment)).not.toBe(unedited);
      });
    });
  }

  test("a slash-wrapped nested dir moves the hash only with a file beneath it", () => {
    const nested = (overrides: Parameters<typeof library>[0] = {}) =>
      filesOf(library({ includeDirs: "/monarch/transitions/", ...overrides }));
    const unedited = nested();
    expect(nested({ lua: "return { edited = true }\n" })).toBe(unedited);
    expect(nested({ example: "-- edited\n" })).toBe(unedited);
    expect(nested({ readme: "# edited\n" })).toBe(unedited);
    expect(nested({ transition: "return { edited = true }\n" })).not.toBe(unedited);
  });

  test("whitespace-separated dirs move the hash only with a file beneath one", () => {
    const spaced = (overrides: Parameters<typeof library>[0] = {}) =>
      filesOf(library({ includeDirs: "monarch example", ...overrides }));
    const unedited = spaced();
    expect(spaced({ readme: "# edited\n" })).toBe(unedited);
    expect(spaced({ example: "-- edited\n" })).not.toBe(unedited);
  });

  test("an archive with no game.project hashes every entry", () => {
    const bare = (readme: string): ZipFixtureEntry[] => [
      { name: "lib/lib.lua", text: "return {}\n" },
      { name: "lib/readme.md", text: readme },
    ];
    expect(filesOf(bare("a\n"))).toMatch(/^[0-9a-f]{64}$/);
    expect(filesOf(bare("b\n"))).not.toBe(filesOf(bare("a\n")));
  });
});

describe("archiveVersion", () => {
  const FILES = "a".repeat(64);

  test("names the commit when there is one", () => {
    expect(archiveVersion({ commit: "1".repeat(40), files: FILES })).toBe(
      `commit:${"1".repeat(40)}`,
    );
  });

  test("names the files hash otherwise", () => {
    expect(archiveVersion({ files: FILES })).toBe(`files-sha256:${FILES}`);
  });
});

describe("mergeResolvedVersionPins", () => {
  const OLD: ArchiveIdentity = { commit: "1".repeat(40), files: "a".repeat(64) };
  const NEW: ArchiveIdentity = { commit: "2".repeat(40), files: "b".repeat(64) };
  const OTHER: ArchiveIdentity = { files: "c".repeat(64) };

  test("adds a pin when the url is absent", () => {
    expect(mergeResolvedVersionPins({}, { [URL_A]: NEW })).toEqual({ [URL_A]: NEW });
  });

  test("keeps a recorded pin over a newly resolved one", () => {
    expect(mergeResolvedVersionPins({ [URL_A]: OLD }, { [URL_A]: NEW })).toEqual({ [URL_A]: OLD });
  });

  test("seeds a new url beside a kept one", () => {
    expect(mergeResolvedVersionPins({ [URL_A]: OLD }, { [URL_A]: NEW, [URL_B]: OTHER })).toEqual({
      [URL_A]: OLD,
      [URL_B]: OTHER,
    });
  });

  test("drops a pin for a url no longer resolved", () => {
    expect(mergeResolvedVersionPins({ [URL_A]: OLD, [URL_B]: OTHER }, { [URL_A]: OLD })).toEqual({
      [URL_A]: OLD,
    });
  });

  test("returns a fresh object, not a reference to the input", () => {
    const pins = { [URL_A]: OLD };
    expect(mergeResolvedVersionPins(pins, { [URL_A]: OLD })).not.toBe(pins);
  });
});
