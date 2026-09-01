import { describe, expect, test } from "bun:test";
import { classifyExtension, locateScriptApis } from "./extension-deps";

describe("locateScriptApis", () => {
  test("returns .script_api entries (case-insensitive) at any depth, sorted", () => {
    const entries = [
      "ext-a/ext.manifest",
      "ext-a/src/foo.cpp",
      "ext-a/api/zlast.script_api",
      "ext-a/api/aphysics.SCRIPT_API",
      "ext-a/README.md",
      "ext-a/nested/deep/mid.script_api",
    ];
    expect(locateScriptApis(entries)).toEqual([
      "ext-a/api/aphysics.SCRIPT_API",
      "ext-a/api/zlast.script_api",
      "ext-a/nested/deep/mid.script_api",
    ]);
  });

  test("returns [] when no entry is a .script_api", () => {
    expect(locateScriptApis(["a/foo.cpp", "a/bar.lua", "a/baz.script_apix"])).toEqual([]);
  });
});

describe("classifyExtension", () => {
  test("flags an archive with no .script_api as assetOnly", () => {
    expect(
      classifyExtension("https://example.com/asset.zip", ["a/sprite.png", "a/sound.ogg"]),
    ).toEqual({
      url: "https://example.com/asset.zip",
      scriptApis: [],
      assetOnly: true,
    });
  });

  test("carries located paths for an archive with .script_api docs", () => {
    expect(
      classifyExtension("https://example.com/ext.zip", [
        "a/ext.cpp",
        "a/b.script_api",
        "a/a.script_api",
      ]),
    ).toEqual({
      url: "https://example.com/ext.zip",
      scriptApis: ["a/a.script_api", "a/b.script_api"],
      assetOnly: false,
    });
  });
});
