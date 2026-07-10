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
  stripGuideChrome,
} from "./build-llms";

// The concatenated guide bodies in llms-full: from `## Guide` to `## API`.
// The per-section `section()` helper stops at the next `## `, which now lands
// on a demoted page H1, so slice the whole region explicitly.
function guideCorpus(full: string): string {
  const start = full.indexOf("## Guide\n");
  const end = full.indexOf("\n## API\n", start);
  return full.slice(start, end === -1 ? undefined : end);
}

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
    // lua-stdlib types are shipped by the external `lua-types` dep; link its
    // repo-local `.d.ts` files (core/<ns>, with base/package/bit overrides).
    expect(txt).toContain("](lua-types/core/math.d.ts)");
    expect(txt).toContain("](lua-types/core/table.d.ts)");
    expect(txt).toContain("](lua-types/core/global.d.ts)"); // base
    expect(txt).toContain("](lua-types/core/modules.d.ts)"); // package
    expect(txt).toContain("](lua-types/jit.d.ts)"); // bit
    // no lua-stdlib namespace should keep a dead `/api/...` site route.
    expect(txt).not.toContain(`](${withBase("/api/base")})`);
  });

  test("machine preamble present on the package copy", () => {
    const txt = buildLlmsTxt(PACKAGE_TARGET);
    expect(txt).toContain("offline knowledge pack");
    expect(txt).toContain("https://defold.com/llms.txt");
    expect(txt).toContain("llms-full: false");
  });

  test("preamble spells out the guide-relative vs package-specifier link convention", () => {
    const txt = buildLlmsTxt(PACKAGE_TARGET);
    expect(txt).toContain("paths under `guide/` are relative to this file");
    expect(txt).toContain(
      "paths starting `@defold-typescript/` or `lua-types/` are package specifiers resolved under `node_modules/`",
    );
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
    // agent-runbooks.md's `## Verify...` section shifts +2 to `####` when inlined.
    expect(buildLlmsFull(SITE_TARGET)).toContain("#### Verify against the real API surface");
  });

  test("omits `llms-full: false` pages — no tutorial body", () => {
    expect(buildLlmsFull(SITE_TARGET)).not.toContain("## 05 — The board script");
  });
});

describe("llms-full.txt strips web chrome from inlined guide bodies", () => {
  test("no shields.io badge or logo image survives (package target)", () => {
    const full = buildLlmsFull(PACKAGE_TARGET);
    expect(full).not.toContain("img.shields.io");
    expect(full).not.toContain("defold-typescript logo");
  });

  test("no shields.io badge survives (site target)", () => {
    expect(buildLlmsFull(SITE_TARGET)).not.toContain("img.shields.io");
  });

  test("each page's heading tree nests under `## Guide` (title -> `###`)", () => {
    const full = buildLlmsFull(SITE_TARGET);
    const corpus = guideCorpus(full);
    expect(full).toContain("## Guide"); // structural header unchanged
    // init.md's `# Init` title now sits one level under `## Guide`,
    // and its `## A destination is required` section one deeper still.
    expect(corpus).toContain("### Init");
    expect(corpus).toContain("#### A destination is required");
    // no page title or section stays flat at the structural `##` level.
    expect(corpus).not.toContain("\n# Init\n");
    expect(corpus).not.toContain("\n## Init\n");
  });

  test("code-fence `# ` comments are left intact, never shifted", () => {
    // agent-runbooks.md inlines JSON event samples whose lines open with `# `.
    expect(buildLlmsFull(SITE_TARGET)).toContain('# {"command":"build"');
  });

  test("the chrome strip does not leak into the llms.txt link map", () => {
    for (const target of [PACKAGE_TARGET, SITE_TARGET]) {
      const txt = buildLlmsTxt(target);
      expect(txt).not.toContain("img.shields.io");
    }
    // the index guide is still linked (repo-local path on the package copy).
    expect(buildLlmsTxt(PACKAGE_TARGET)).toContain("](guide/README.md)");
  });
});

describe("stripGuideChrome", () => {
  test("drops a linked-image badge line", () => {
    const input = "# T\n\n[![npm](https://img.shields.io/x)](https://npmjs.com/y)\n\nbody";
    expect(stripGuideChrome(input)).toBe("### T\n\nbody");
  });

  test("drops a standalone image line including a `#attr` src", () => {
    const input = "# T\n\n![logo alt](logo-ver-classic.png#max-width=200)\n\nbody";
    expect(stripGuideChrome(input)).toBe("### T\n\nbody");
  });

  test("shifts the whole heading tree by two levels, preserving relative depth", () => {
    const input = "# Title\n\n## Section\n\n### Sub\n\ntext";
    expect(stripGuideChrome(input)).toBe("### Title\n\n#### Section\n\n##### Sub\n\ntext");
  });

  test("leaves heading-like lines inside code fences untouched", () => {
    const input = "# T\n\n```md\n# a comment\n## Which surface\n```";
    const out = stripGuideChrome(input);
    expect(out.startsWith("### T\n")).toBe(true);
    expect(out).toContain("\n# a comment\n");
    expect(out).toContain("\n## Which surface\n");
    expect(out).not.toContain("### a comment");
    expect(out).not.toContain("#### Which surface");
  });

  test("inline-code backticks in prose do not open a phantom fence", () => {
    // A paragraph that quotes a fence inline (e.g. ```` ```lua ````) is not a
    // code block; a real heading after it must still shift.
    const bt = "`";
    const prose = `${bt.repeat(4)} ${bt.repeat(3)}lua ${bt.repeat(4)} fence talk`;
    const input = `# T\n\n${prose}\n\n## Real Section`;
    const out = stripGuideChrome(input);
    expect(out).toContain(prose); // prose preserved verbatim
    expect(out).toContain("#### Real Section"); // heading still shifted
  });

  test("caps shifted heading depth at H6", () => {
    const input = "# T\n\n##### Deep";
    expect(stripGuideChrome(input)).toBe("### T\n\n###### Deep");
  });

  test("collapses leading blanks and 3+ blank-line runs left by removals", () => {
    const input = "\n\n# T\n\n\n\nbody";
    expect(stripGuideChrome(input)).toBe("### T\n\nbody");
  });
});

describe("llms.txt still links excluded pages", () => {
  test("the tutorial stays in the link map", () => {
    expect(buildLlmsTxt(SITE_TARGET)).toContain(`](${withBase("/tetris-tutorial")})`);
  });
});
