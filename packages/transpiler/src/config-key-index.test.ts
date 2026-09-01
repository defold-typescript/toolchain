import { describe, expect, test } from "bun:test";
import { buildConfigKeyIndex, readGameProjectSetting } from "./config-key-index";

function ids(text: string): string[] {
  return [...buildConfigKeyIndex(text)];
}

describe("buildConfigKeyIndex", () => {
  test("reports every key under its section as a SECTION.KEY id", () => {
    expect(ids("[display]\nwidth = 960\nheight = 640\n\n[project]\ntitle = Game\n")).toEqual([
      "display.width",
      "display.height",
      "project.title",
    ]);
  });

  test("trims the whitespace around the key and keeps a value containing an equals sign", () => {
    expect(ids("[project]\n  title   =   My = Game  \n")).toEqual(["project.title"]);
  });

  test("reports a key carrying a hash verbatim rather than treating it as a fragment", () => {
    expect(ids("[project]\ndependencies#0 = https://example.com/x.zip\n")).toEqual([
      "project.dependencies#0",
    ]);
  });

  test("a section repeated later contributes to the same prefix", () => {
    expect(
      ids("[display]\nwidth = 960\n\n[project]\ntitle = Game\n\n[display]\nheight = 640\n"),
    ).toEqual(["display.width", "project.title", "display.height"]);
  });

  test("a line before the first section header contributes nothing", () => {
    expect(ids("orphan = 1\n[display]\nwidth = 960\n")).toEqual(["display.width"]);
  });

  test("a blank line and a line with no equals sign contribute nothing", () => {
    expect(ids("[display]\n\nwidth\n\nheight = 640\n")).toEqual(["display.height"]);
  });

  test("an empty text yields an empty set", () => {
    expect(ids("")).toEqual([]);
  });

  test("a key declared twice under the same section is reported once", () => {
    expect(ids("[display]\nwidth = 960\nwidth = 1280\n")).toEqual(["display.width"]);
  });
});

describe("readGameProjectSetting", () => {
  test("returns the value declared under the named section", () => {
    expect(
      readGameProjectSetting(
        "[display]\nwidth = 960\n\n[bootstrap]\nmain_collection = /main/main.collection\n",
        "bootstrap",
        "main_collection",
      ),
    ).toBe("/main/main.collection");
  });

  test("a key the file never declares is undefined", () => {
    expect(
      readGameProjectSetting(
        "[bootstrap]\nmain_collection = /a.collection\n",
        "bootstrap",
        "render",
      ),
    ).toBeUndefined();
  });

  test("a section the file never declares is undefined", () => {
    expect(
      readGameProjectSetting("[display]\nwidth = 960\n", "bootstrap", "main_collection"),
    ).toBeUndefined();
  });

  test("the same key under another section is not the answer", () => {
    expect(
      readGameProjectSetting(
        "[other]\nmain_collection = /wrong.collection\n\n[bootstrap]\nmain_collection = /right.collection\n",
        "bootstrap",
        "main_collection",
      ),
    ).toBe("/right.collection");
  });

  test("a key the asked-for one is a prefix of is not the answer", () => {
    expect(
      readGameProjectSetting(
        "[bootstrap]\nmain_collection_backup = /backup.collection\n",
        "bootstrap",
        "main_collection",
      ),
    ).toBeUndefined();
  });

  test("the value is trimmed and keeps an equals sign of its own", () => {
    expect(
      readGameProjectSetting("[project]\n  title   =   My = Game  \n", "project", "title"),
    ).toBe("My = Game");
  });

  test("a line before the first section header belongs to no section", () => {
    expect(
      readGameProjectSetting(
        "main_collection = /orphan.collection\n",
        "bootstrap",
        "main_collection",
      ),
    ).toBeUndefined();
  });

  test("an empty value is undefined rather than an empty answer", () => {
    expect(
      readGameProjectSetting("[bootstrap]\nmain_collection =\n", "bootstrap", "main_collection"),
    ).toBeUndefined();
  });
});
