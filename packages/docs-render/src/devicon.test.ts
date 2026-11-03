import { describe, expect, test } from "bun:test";
import { deviconMono } from "./devicon";

function rootTag(svg: string): string {
  return svg.slice(0, svg.indexOf(">") + 1);
}

describe("deviconMono", () => {
  test("decorates the root and replaces the asset's brand fill with the text colour", () => {
    const svg = deviconMono("typescript/typescript-plain", "x");
    expect(svg.startsWith('<svg class="x" aria-hidden="true" width="0.9em" height="0.9em" ')).toBe(
      true,
    );
    expect(rootTag(svg)).toContain('fill="currentColor"');
    expect(svg).not.toContain('fill="#');
  });

  test("gives an asset with no fill of its own the text colour", () => {
    expect(rootTag(deviconMono("apple/apple-original", "x"))).toContain('fill="currentColor"');
  });

  test("keeps fill-rule, which shapes the mark rather than colouring it", () => {
    expect(deviconMono("linux/linux-plain", "x")).toContain('fill-rule="evenodd"');
  });

  test("refuses a mark drawn with more than one shape", () => {
    expect(() => deviconMono("lua/lua-original", "x")).toThrow("lua/lua-original");
  });
});
