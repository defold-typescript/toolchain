import { describe, expect, test } from "bun:test";
import { buildConfigKeyIndex } from "./config-key-index";

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
