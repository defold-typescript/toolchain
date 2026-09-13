import { describe, expect, test } from "bun:test";
import { glyphSvg } from "./glyph";
import { FENCE_LANGUAGES } from "./markdown";
import { PLATFORM_ICONS } from "./platform-icons";

describe("glyphSvg", () => {
  const entries = [
    ...Object.entries(PLATFORM_ICONS).map(([name, entry]) => [`[icon:${name}]`, entry] as const),
    ...Object.entries(FENCE_LANGUAGES).map(([name, entry]) => [`${name} fence`, entry] as const),
  ];

  test.each(entries)("%s resolves to a glyph in its icon set", (_, entry) => {
    expect(glyphSvg(entry.glyph, "x").startsWith('<svg class="x"')).toBe(true);
  });
});
