import { describe, expect, test } from "bun:test";
import { statSync } from "node:fs";
import { type FaviconLink, faviconLinks } from "./favicon";

describe("faviconLinks", () => {
  test("returns the svg icon, png icon, then apple-touch-icon in order", () => {
    const links = faviconLinks();
    expect(links.map((l) => [l.rel, l.type])).toEqual([
      ["icon", "image/svg+xml"],
      ["icon", "image/png"],
      ["apple-touch-icon", undefined],
    ]);
  });

  test("every href is a site-absolute path", () => {
    for (const link of faviconLinks()) {
      expect(link.href.startsWith("/")).toBe(true);
    }
  });

  test("every href resolves to an existing, non-empty file under public/", () => {
    for (const link of faviconLinks()) {
      const url = new URL(`../../public${link.href}`, import.meta.url);
      const stat = statSync(url);
      expect(stat.size).toBeGreaterThan(0);
    }
  });
});

const _typecheck: FaviconLink = { rel: "icon", href: "/x" };
void _typecheck;
