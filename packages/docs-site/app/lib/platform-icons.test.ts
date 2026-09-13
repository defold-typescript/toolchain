import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { htmlToDocText } from "@defold-typescript/types";
import { PLATFORM_ICONS, platformDocText, stripPlatformMarkers } from "./platform-icons";

const PACKAGES_DIR = join(import.meta.dir, "../../..");

function jsonFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(dir, name));
}

describe("platformDocText", () => {
  test("turns engine icon spans into markers before the doc-text conversion", () => {
    expect(platformDocText('Only <span class="icon-ios"></span> on <code>iOS</code>')).toBe(
      "Only [icon:ios] on `iOS`",
    );
  });

  test("equals htmlToDocText for text without markers", () => {
    const html = '<p>Plays a <em>sound</em>.</p><span class="note">x</span>';
    expect(platformDocText(html)).toBe(htmlToDocText(html));
  });
});

describe("stripPlatformMarkers", () => {
  test("removes known and unknown markers and collapses the leftover space", () => {
    expect(stripPlatformMarkers("Works on [icon:ios] and [icon:unknown] Android.")).toBe(
      "Works on and Android.",
    );
    expect(stripPlatformMarkers("Canvas platforms. [icon:ios] [icon:amazon]")).toBe(
      "Canvas platforms.",
    );
  });
});

describe("platform marker corpus", () => {
  test("every marker name in the engine fixtures and extension api-docs has a PLATFORM_ICONS entry", () => {
    const names = new Set<string>();
    const engineDirs = readdirSync(join(PACKAGES_DIR, "types/fixtures"))
      .filter((name) => name.startsWith("defold-"))
      .map((name) => join(PACKAGES_DIR, "types/fixtures", name));
    const files = [
      ...engineDirs.flatMap(jsonFiles),
      ...jsonFiles(join(PACKAGES_DIR, "library-types/defold-extensions/api-doc")),
    ];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/\[icon:([\w-]+)\]/g)) names.add(match[1] as string);
      for (const match of text.matchAll(/class=\\?"icon-([\w-]+)/g)) names.add(match[1] as string);
    }
    expect(names.size).toBeGreaterThan(5);
    expect([...names].filter((name) => !Object.hasOwn(PLATFORM_ICONS, name))).toEqual([]);
  });
});
