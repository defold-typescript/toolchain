import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withBase } from "../app/lib/base";
import { listGuidePages } from "../app/lib/guide-loader";
import {
  buildLlmsFull,
  buildLlmsTxt,
  DOCS_DIR,
  GUIDE_DIR,
  PACKAGE_TARGET,
  PUBLIC_DIR,
  SITE_TARGET,
} from "./build-llms";

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
  test("committed packages/docs/llms.txt matches the package-target build", () => {
    const committed = readFileSync(join(DOCS_DIR, "llms.txt"), "utf8");
    const fresh = buildLlmsTxt(PACKAGE_TARGET);
    if (committed !== fresh) {
      throw new Error(
        "packages/docs/llms.txt is stale — run `bun scripts/build-llms.ts` in packages/docs-site/",
      );
    }
    expect(committed).toBe(fresh);
  });

  test("committed packages/docs/llms-full.txt matches the package-target build", () => {
    const committed = readFileSync(join(DOCS_DIR, "llms-full.txt"), "utf8");
    const fresh = buildLlmsFull(PACKAGE_TARGET);
    if (committed !== fresh) {
      throw new Error(
        "packages/docs/llms-full.txt is stale — run `bun scripts/build-llms.ts` in packages/docs-site/",
      );
    }
    expect(committed).toBe(fresh);
  });

  test("committed public/llms.txt matches the site-target build", () => {
    const committed = readFileSync(join(PUBLIC_DIR, "llms.txt"), "utf8");
    const fresh = buildLlmsTxt(SITE_TARGET);
    if (committed !== fresh) {
      throw new Error(
        "public/llms.txt is stale — run `bun scripts/build-llms.ts` in packages/docs-site/",
      );
    }
    expect(committed).toBe(fresh);
  });

  test("committed public/llms-full.txt matches the site-target build", () => {
    const committed = readFileSync(join(PUBLIC_DIR, "llms-full.txt"), "utf8");
    const fresh = buildLlmsFull(SITE_TARGET);
    if (committed !== fresh) {
      throw new Error(
        "public/llms-full.txt is stale — run `bun scripts/build-llms.ts` in packages/docs-site/",
      );
    }
    expect(committed).toBe(fresh);
  });
});

describe("site target — byte-compatible with the pre-change form", () => {
  test("guide and API links stay site-absolute", () => {
    const txt = buildLlmsTxt(SITE_TARGET);
    expect(txt).toContain(`](${withBase("/script-lifecycle")})`);
    expect(txt).toContain(`](${withBase("/api/gui")})`);
  });

  test("leads with the `> ` package.json summary and carries none of the machine preamble", () => {
    const txt = buildLlmsTxt(SITE_TARGET);
    expect(txt).toContain("\n> ");
    expect(txt).not.toContain("## Key docs for agents");
    expect(txt).not.toContain("https://defold.com/llms.txt");
  });

  test("the default target is the site target", () => {
    expect(buildLlmsTxt()).toBe(buildLlmsTxt(SITE_TARGET));
    expect(buildLlmsFull()).toBe(buildLlmsFull(SITE_TARGET));
  });
});

describe("package target — repo-local, cat-able links", () => {
  test("guide links are repo-local, never site-relative", () => {
    const txt = buildLlmsTxt(PACKAGE_TARGET);
    expect(txt).toContain("](guide/script-lifecycle.md)");
    expect(txt).toContain("](guide/README.md)");
    const guideLinks = section(txt, "## Guide").match(LINK) ?? [];
    for (const link of guideLinks) {
      expect(link).not.toMatch(/\]\(\//); // no `](/...` site-relative guide link
    }
  });

  test("API links resolve by category to shipped repo files", () => {
    const txt = buildLlmsTxt(PACKAGE_TARGET);
    expect(txt).toContain("](@defold-typescript/types/generated/gui.d.ts)");
    expect(txt).toContain("](@defold-typescript/types/generated/b2d_body.d.ts)");
    expect(txt).toContain("](@defold-typescript/types/src/engine-globals.d.ts)");
    expect(txt).toContain("](@defold-typescript/types/src/core-types.ts)");
    // lua-stdlib types live in the external `lua-types` dep — keep the site route.
    expect(txt).toContain(`](${withBase("/api/base")})`);
  });

  test("machine preamble present on the package copy", () => {
    const txt = buildLlmsTxt(PACKAGE_TARGET);
    expect(txt).toContain("offline knowledge pack");
    expect(txt).toContain("https://defold.com/llms.txt");
    expect(txt).toContain("llms-full: false");
  });

  test("`Key docs for agents` list ordered by agentEntry, unflagged pages excluded", () => {
    const txt = buildLlmsTxt(PACKAGE_TARGET);
    const keyDocs = section(txt, "## Key docs for agents");
    expect(keyDocs).toContain("](guide/agent-runbooks.md)");
    expect(keyDocs).toContain("](guide/messages.md)");
    expect(keyDocs.indexOf("guide/agent-runbooks.md")).toBeLessThan(
      keyDocs.indexOf("guide/messages.md"),
    );
    // an unflagged page is absent from the curated list...
    expect(keyDocs).not.toContain("guide/build.md");
    // ...but still present in the full `## Guide` dump.
    expect(section(txt, "## Guide")).toContain("](guide/build.md)");
  });
});

describe("llms.txt coverage", () => {
  test("one Guide link per guide page, no page dropped", () => {
    const txt = buildLlmsTxt(SITE_TARGET);
    const guideLinks = section(txt, "## Guide").match(LINK) ?? [];
    const pages = listGuidePages(GUIDE_DIR);
    expect(guideLinks.length).toBe(pages.length);
    for (const page of pages) {
      expect(txt).toContain(`](${withBase(page.route)})`);
    }
  });

  test("the API section is non-empty", () => {
    const apiLinks = section(buildLlmsTxt(SITE_TARGET), "## API").match(LINK) ?? [];
    expect(apiLinks.length).toBeGreaterThan(0);
  });
});

describe("llms-full.txt is the full guide text", () => {
  test("inlines a known guide-page heading, not just the index", () => {
    expect(buildLlmsFull(SITE_TARGET)).toContain("## Verify against the real API surface");
  });

  test("omits `llms-full: false` pages — no tutorial body", () => {
    expect(buildLlmsFull(SITE_TARGET)).not.toContain("## 05 — The board script");
  });
});

describe("llms.txt still links excluded pages", () => {
  test("the tutorial stays in the link map", () => {
    expect(buildLlmsTxt(SITE_TARGET)).toContain(`](${withBase("/tetris-tutorial")})`);
  });
});
