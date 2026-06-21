import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withBase } from "../app/lib/base";
import { listGuidePages } from "../app/lib/guide-loader";
import { buildLlmsFull, buildLlmsTxt, DOCS_DIR, GUIDE_DIR } from "./build-llms";

// Slice a markdown string from one `## ` heading up to the next `## ` (or EOF).
function section(text: string, heading: string): string {
  const start = text.indexOf(`${heading}\n`);
  if (start === -1) return "";
  const after = start + heading.length;
  const next = text.indexOf("\n## ", after);
  return next === -1 ? text.slice(after) : text.slice(after, next);
}

const LINK = /^- \[.*\]\(.*\)$/gm;

describe("llms.txt regeneration drift guard", () => {
  test("committed llms.txt matches a fresh build byte-for-byte", () => {
    const committed = readFileSync(join(DOCS_DIR, "llms.txt"), "utf8");
    const fresh = buildLlmsTxt();
    if (committed !== fresh) {
      throw new Error(
        "packages/docs/llms.txt is stale — run `bun scripts/build-llms.ts` in packages/docs-site/",
      );
    }
    expect(committed).toBe(fresh);
  });

  test("committed llms-full.txt matches a fresh build byte-for-byte", () => {
    const committed = readFileSync(join(DOCS_DIR, "llms-full.txt"), "utf8");
    const fresh = buildLlmsFull();
    if (committed !== fresh) {
      throw new Error(
        "packages/docs/llms-full.txt is stale — run `bun scripts/build-llms.ts` in packages/docs-site/",
      );
    }
    expect(committed).toBe(fresh);
  });
});

describe("llms.txt coverage", () => {
  test("one Guide link per guide page, no page dropped", () => {
    const txt = buildLlmsTxt();
    const guideLinks = section(txt, "## Guide").match(LINK) ?? [];
    const pages = listGuidePages(GUIDE_DIR);
    expect(guideLinks.length).toBe(pages.length);
    for (const page of pages) {
      expect(txt).toContain(`](${withBase(page.route)})`);
    }
  });

  test("the API section is non-empty", () => {
    const apiLinks = section(buildLlmsTxt(), "## API").match(LINK) ?? [];
    expect(apiLinks.length).toBeGreaterThan(0);
  });
});

describe("llms-full.txt is the full guide text", () => {
  test("inlines a known guide-page heading, not just the index", () => {
    expect(buildLlmsFull()).toContain("## Verify against the real API surface");
  });
});
