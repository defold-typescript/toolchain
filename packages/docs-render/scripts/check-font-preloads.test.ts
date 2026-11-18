import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DocumentHead } from "../src/document-head";
import { PRELOAD_FONT_FILES } from "../src/generated/fonts";
import { fontPreloadProblems } from "./check-font-preloads";

const BASE = "/toolchain/";
const HASHED_NAMES = PRELOAD_FONT_FILES.map((file) => file.replace(/\.woff2$/, "-AbCd_1-2.woff2"));
const EMITTED: ReadonlySet<string> = new Set(HASHED_NAMES.map((name) => `assets/${name}`));

function hrefsUnder(prefix: string, names: readonly string[] = HASHED_NAMES): string[] {
  return names.map((name) => `${prefix}assets/${name}`);
}

function renderPage(basePath: string, fontPreloads: readonly string[]): string {
  return renderToStaticMarkup(
    createElement(
      "html",
      { lang: "en" },
      createElement(DocumentHead, { basePath, fontPreloads }),
      createElement("body"),
    ),
  );
}

describe("fontPreloadProblems", () => {
  test("passes a head that preloads every font at an emitted file under the base", () => {
    const html = renderPage(BASE, hrefsUnder(BASE));
    expect(fontPreloadProblems({ html, basePath: BASE, emitted: EMITTED })).toEqual([]);
  });

  test("names a preload whose file the build did not emit", () => {
    const hrefs = hrefsUnder(BASE);
    const missing = hrefs[1] ?? "";
    const emitted = new Set([...EMITTED].filter((path) => `${BASE}${path}` !== missing));
    const html = renderPage(BASE, hrefs);
    const problems = fontPreloadProblems({ html, basePath: BASE, emitted });
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain(missing);
  });

  test("names a preload font the head leaves out", () => {
    const dropped = PRELOAD_FONT_FILES[2];
    const kept = HASHED_NAMES.filter((_, index) => index !== 2);
    const html = renderPage(BASE, hrefsUnder(BASE, kept));
    const problems = fontPreloadProblems({ html, basePath: BASE, emitted: EMITTED });
    expect(problems.length).toBe(1);
    expect(problems[0]).toContain(dropped);
  });

  test("names every preload outside the deploy base", () => {
    const hrefs = hrefsUnder("/");
    const html = renderPage(BASE, hrefs);
    const problems = fontPreloadProblems({ html, basePath: BASE, emitted: EMITTED });
    expect(problems.length).toBe(hrefs.length);
    for (const [index, href] of hrefs.entries()) {
      expect(problems[index]).toContain(href);
      expect(problems[index]).toContain("outside the deploy base");
    }
  });
});
