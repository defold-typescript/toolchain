import { describe, expect, test } from "bun:test";
import { buildSnippet, searchExcerpt } from "./snippet";

describe("buildSnippet", () => {
  test("centers the window on a mid-text match and wraps it in <mark>", () => {
    const text = `${"a ".repeat(80)}needle ${"b ".repeat(80)}`;
    const { html } = buildSnippet(text, "needle", { context: 40 });
    expect(html).toContain("<mark>needle</mark>");
    expect(html.startsWith("…")).toBe(true);
    expect(html.endsWith("…")).toBe(true);
  });

  test("a match near the start has no leading ellipsis", () => {
    const text = `needle ${"tail ".repeat(80)}`;
    const { html } = buildSnippet(text, "needle", { context: 40 });
    expect(html.startsWith("…")).toBe(false);
    expect(html).toContain("<mark>needle</mark>");
  });

  test("respects the context window length", () => {
    const text = `${"x ".repeat(200)}needle${" y".repeat(200)}`;
    const short = buildSnippet(text, "needle", { context: 30 }).html;
    const wide = buildSnippet(text, "needle", { context: 120 }).html;
    expect(wide.length).toBeGreaterThan(short.length);
  });

  test("escapes HTML-special characters around the match", () => {
    const text = 'before <b> & "q" needle after';
    const { html } = buildSnippet(text, "needle", { context: 60 });
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
    expect(html).not.toContain("<b>");
    expect(html).toContain("<mark>needle</mark>");
  });

  test("escapes a match that itself contains HTML-special characters", () => {
    const text = "alpha <tag> omega";
    const { html } = buildSnippet(text, "<tag>", { context: 60 });
    expect(html).toContain("<mark>&lt;tag&gt;</mark>");
    expect(html).not.toContain("<tag>");
  });

  test("returns a head-of-text fallback with no <mark> when the term is absent", () => {
    const text = `${"word ".repeat(80)}`;
    const { html } = buildSnippet(text, "missing", { context: 40 });
    expect(html).not.toContain("<mark>");
    expect(html.length).toBeGreaterThan(0);
  });

  test("matches case-insensitively but marks the original casing", () => {
    const text = "The Needle is here.";
    const { html } = buildSnippet(text, "needle", { context: 60 });
    expect(html).toContain("<mark>Needle</mark>");
  });
});

describe("searchExcerpt", () => {
  // 1,000 characters with `bun install` starting at 600.
  const text = `${"lorem ".repeat(100)}bun install ${"ipsum ".repeat(64)}end.`;

  test("centers a window on the query and marks both cut sides", () => {
    expect(text.length).toBe(1000);
    expect(text.indexOf("bun install")).toBe(600);
    const excerpt = searchExcerpt(text, "install");
    expect(excerpt).toContain("install");
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(162);
  });

  test("falls back to a query word when the whole query does not occur", () => {
    const words = `${"lorem ".repeat(100)}Animate the node ${"ipsum ".repeat(64)}end.`;
    const excerpt = searchExcerpt(words, "gui.animate");
    expect(excerpt.startsWith("…")).toBe(true);
    const at = excerpt.indexOf("Animate");
    expect(at).toBeGreaterThan(40);
    expect(at).toBeLessThan(120);
  });

  test("takes the head when the query does not occur at all", () => {
    expect(searchExcerpt(text, "animte")).toBe(`${text.slice(0, 160)}…`);
  });

  test("returns a short text whole, whitespace collapsed", () => {
    expect(searchExcerpt("  Run\n\tbun   install  first. ", "install")).toBe(
      "Run bun install first.",
    );
  });
});
