import { describe, expect, test } from "bun:test";
import { renderMarkdown } from "./markdown";
import { isSafeLink } from "./upstream-text";

describe("isSafeLink", () => {
  test("allows http, https, mailto and relative targets", () => {
    for (const url of ["https://a.b/c", "http://a.b", "mailto:a@b.c", "/api/x", "#top", "x/y.md"]) {
      expect(isSafeLink(url)).toBe(true);
    }
  });

  test("refuses every other scheme, however it is disguised", () => {
    for (const url of [
      "javascript:alert(1)",
      "JaVaScRiPt:x",
      "java\tscript:x",
      " data:text/html,x",
    ]) {
      expect(isSafeLink(url)).toBe(false);
    }
  });

  test("the renderer refuses an unsafe target the escape never saw", async () => {
    const html = await renderMarkdown("[a](ftp://x/y) [b][1]\n\n[1]: tel:123");
    expect(html).not.toContain('href="ftp:');
    expect(html).not.toContain('href="tel:');
  });
});
