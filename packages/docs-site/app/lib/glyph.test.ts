import { describe, expect, test } from "bun:test";
import { glyphSvg } from "@defold-typescript/docs-render/glyph";
import { PLATFORM_ICONS } from "@defold-typescript/docs-render/platform-icons";
import { FENCE_LANGUAGES } from "./markdown";

describe("glyphSvg", () => {
  const entries = [
    ...Object.entries(PLATFORM_ICONS).map(([name, entry]) => [`[icon:${name}]`, entry] as const),
    ...Object.entries(FENCE_LANGUAGES).map(([name, entry]) => [`${name} fence`, entry] as const),
  ];

  test.each(entries)("%s resolves to a glyph in its icon set", (_, entry) => {
    expect(glyphSvg(entry.glyph, "x").startsWith('<svg class="x"')).toBe(true);
  });
});
