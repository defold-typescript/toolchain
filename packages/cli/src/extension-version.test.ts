import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readZip } from "@defold-typescript/types/cli-runtime";
import { writeZipArchive, type ZipFixtureEntry } from "../../types/test/zip-fixture";
import {
  archivePin,
  isRetiredPin,
  mergeResolvedVersionPins,
  readExtensionVersionPins,
} from "./extension-version";

const URL_A = "https://github.com/defold/extension-iap/archive/main.zip";
const URL_B = "https://github.com/defold/extension-push/archive/main.zip";

describe("archivePin", () => {
  const COMMIT = "5c33c398e3c1d3ab3c0ee0d5f8f45c4c7c4e0b21";
  const GAME_PROJECT = "[project]\ntitle = monarch\n\n[library]\ninclude_dirs = monarch\n";

  function pinOf(entries: readonly ZipFixtureEntry[], comment?: string): string {
    const zipPath = join(mkdtempSync(join(tmpdir(), "archive-pin-")), "archive.zip");
    writeFileSync(zipPath, writeZipArchive(entries, comment === undefined ? {} : { comment }));
    return archivePin(readZip(zipPath));
  }

  function library(
    overrides: { lua?: string; example?: string; wrapper?: string } = {},
  ): ZipFixtureEntry[] {
    const wrapper = overrides.wrapper ?? "monarch-master";
    return [
      { name: `${wrapper}/`, text: "" },
      { name: `${wrapper}/game.project`, text: GAME_PROJECT },
      { name: `${wrapper}/monarch/monarch.lua`, text: overrides.lua ?? "return {}\n" },
      { name: `${wrapper}/monarch/monarch.gui`, text: "script: ''\n" },
      { name: `${wrapper}/example/example.script`, text: overrides.example ?? "-- example\n" },
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

describe("isRetiredPin", () => {
  test("recognizes the zip-byte form and neither current form", () => {
    expect(isRetiredPin(`sha256:${"0".repeat(64)}`)).toBe(true);
    expect(isRetiredPin(`files-sha256:${"0".repeat(64)}`)).toBe(false);
    expect(isRetiredPin(`commit:${"0".repeat(40)}`)).toBe(false);
  });
});

describe("readExtensionVersionPins", () => {
  test("returns the { url: version } map for a well-formed package.json", () => {
    const pkg = {
      "defold-typescript": {
        extensions: { [URL_A]: "sha256:abc", [URL_B]: "sha256:def" },
      },
    };
    expect(readExtensionVersionPins(pkg)).toEqual({
      [URL_A]: "sha256:abc",
      [URL_B]: "sha256:def",
    });
  });

  test("returns {} when the extensions key is absent", () => {
    expect(readExtensionVersionPins({ "defold-typescript": {} })).toEqual({});
  });

  test("returns {} when the defold-typescript namespace is absent", () => {
    expect(readExtensionVersionPins({ name: "x" })).toEqual({});
  });

  test("returns {} when extensions is a non-object value", () => {
    expect(readExtensionVersionPins({ "defold-typescript": { extensions: "nope" } })).toEqual({});
  });

  test("drops non-string values without throwing", () => {
    expect(
      readExtensionVersionPins({
        "defold-typescript": {
          extensions: {
            [URL_A]: "sha256:abc",
            [URL_B]: 42,
            [`${URL_A}#x`]: null,
          },
        },
      }),
    ).toEqual({ [URL_A]: "sha256:abc" });
  });

  test("returns {} for non-object inputs without throwing", () => {
    expect(readExtensionVersionPins(null)).toEqual({});
    expect(readExtensionVersionPins(undefined)).toEqual({});
    expect(readExtensionVersionPins("nope")).toEqual({});
    expect(readExtensionVersionPins(42)).toEqual({});
    expect(readExtensionVersionPins([])).toEqual({});
  });

  test("returns {} when the namespace itself is a non-object value", () => {
    expect(readExtensionVersionPins({ "defold-typescript": "1.9.8" })).toEqual({});
  });
});

describe("mergeResolvedVersionPins", () => {
  test("adds a pin when the url is absent", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { "defold-target": "1.9.8" } },
      { [URL_A]: "sha256:new" },
    );
    expect(merged).toEqual({
      "defold-typescript": {
        "defold-target": "1.9.8",
        extensions: { [URL_A]: "sha256:new" },
      },
    });
  });

  test("preserves an existing pin for the same url (no clobber)", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:old" } } },
      { [URL_A]: "sha256:new" },
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:old" } },
    });
  });

  test("preserves unrelated defold-typescript keys (defold-target)", () => {
    const merged = mergeResolvedVersionPins(
      {
        "defold-typescript": { "defold-target": "1.9.8" },
        name: "my-game",
      },
      { [URL_A]: "sha256:abc" },
    );
    expect(merged).toEqual({
      "defold-typescript": {
        "defold-target": "1.9.8",
        extensions: { [URL_A]: "sha256:abc" },
      },
      name: "my-game",
    });
  });

  test("merges multiple urls at once, keeping existing pins", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:a" } } },
      { [URL_A]: "sha256:A", [URL_B]: "sha256:B" },
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:a", [URL_B]: "sha256:B" } },
    });
  });

  test("is a no-op on a second identical call", () => {
    const first = mergeResolvedVersionPins({}, { [URL_A]: "sha256:abc" });
    const second = mergeResolvedVersionPins(first, { [URL_A]: "sha256:abc" });
    expect(second).toEqual(first);
  });

  test("treats a missing defold-typescript namespace as an empty namespace", () => {
    const merged = mergeResolvedVersionPins({ name: "x" }, { [URL_A]: "sha256:abc" });
    expect(merged).toEqual({
      name: "x",
      "defold-typescript": { extensions: { [URL_A]: "sha256:abc" } },
    });
  });

  test("returns a fresh object, not a reference to the input", () => {
    const original = { "defold-typescript": { "defold-target": "1.9.8" } };
    const merged = mergeResolvedVersionPins(original, { [URL_A]: "sha256:abc" });
    expect(merged).not.toBe(original);
    expect(merged["defold-typescript"]).not.toBe(original["defold-typescript"]);
  });

  test("drops an orphan pin absent from the live url set", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:a", [URL_B]: "sha256:b" } } },
      {},
      [URL_A],
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:a" } },
    });
  });

  test("preserves live pins while seeding a new one", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:a" } } },
      { [URL_B]: "sha256:B" },
      [URL_A, URL_B],
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:a", [URL_B]: "sha256:B" } },
    });
  });

  test("never clobbers a live pin during reconcile", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:old" } } },
      { [URL_A]: "sha256:new" },
      [URL_A],
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:old" } },
    });
  });

  test("omitting the live url set prunes nothing", () => {
    const merged = mergeResolvedVersionPins(
      { "defold-typescript": { extensions: { [URL_A]: "sha256:a", [URL_B]: "sha256:b" } } },
      {},
    );
    expect(merged).toEqual({
      "defold-typescript": { extensions: { [URL_A]: "sha256:a", [URL_B]: "sha256:b" } },
    });
  });
});
