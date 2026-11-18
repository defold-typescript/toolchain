/*
 * Post-build gate for both docs sites: every font preload in the built head must
 * name a file the build emitted under the deploy base, and every font in
 * PRELOAD_FONT_FILES must be preloaded. Every page renders the same root, so
 * reading index.html covers the site.
 *
 * Usage: bun scripts/check-font-preloads.ts <dist/public dir>, with the same
 * DOCS_BASE the build used.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Window } from "happy-dom";
import { PRELOAD_FONT_FILES } from "../src/generated/fonts";

function basename(href: string): string {
  return href.slice(href.lastIndexOf("/") + 1);
}

export function fontPreloadProblems({
  html,
  basePath,
  emitted,
}: {
  html: string;
  basePath: string;
  emitted: ReadonlySet<string>;
}): string[] {
  const window = new Window();
  window.document.write(html);
  const hrefs = [...window.document.querySelectorAll('link[rel="preload"][as="font"]')].map(
    (link) => link.getAttribute("href") ?? "",
  );
  window.close();

  const problems: string[] = [];
  for (const href of hrefs) {
    if (!href.startsWith(basePath)) {
      problems.push(`${href}: font preload is outside the deploy base ${basePath}`);
      continue;
    }
    const path = href.slice(basePath.length);
    if (!emitted.has(path)) {
      problems.push(`${href}: font preload names ${path}, which the build did not emit`);
    }
  }
  for (const file of PRELOAD_FONT_FILES) {
    const stem = file.replace(/\.woff2$/, "");
    const preloaded = hrefs.some((href) => {
      const name = basename(href);
      return name.startsWith(`${stem}-`) && name.endsWith(".woff2");
    });
    if (!preloaded) problems.push(`${file}: no font preload names it`);
  }
  return problems;
}

if (import.meta.main) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("usage: bun scripts/check-font-preloads.ts <dist/public dir>");
    process.exit(2);
  }
  const basePath = process.env.DOCS_BASE ?? "/";
  const problems = fontPreloadProblems({
    html: readFileSync(join(dir, "index.html"), "utf8"),
    basePath,
    emitted: new Set(readdirSync(join(dir, "assets")).map((name) => `assets/${name}`)),
  });
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) process.exit(1);
  console.log(`font preloads: ${PRELOAD_FONT_FILES.length} fonts preloaded under ${basePath}`);
}
