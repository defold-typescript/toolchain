import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { engineIndexBaseTable } from "@defold-typescript/types";
import { buildLlmsFull, SITE_TARGET } from "../../scripts/build-llms";
import { withBase } from "./base";
import { renderGuidePage } from "./content";
import { expandGuideDirectives } from "./guide-directives";
import { listGuidePages } from "./guide-loader";
import { guideSymbolRoutes } from "./guide-symbol-links";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");
const DIRECTIVE = "<!-- engine-index-base-table -->";

async function renderReal(file: string): Promise<string> {
  const page = listGuidePages(GUIDE_DIR).find((p) => p.file === file);
  if (!page) throw new Error(`no guide page ${file}`);
  return renderGuidePage(GUIDE_DIR, page);
}

function sectionAfter(html: string, heading: string): string {
  const start = html.indexOf(heading);
  if (start < 0) throw new Error(`no heading ${heading}`);
  const end = html.slice(start).search(/<h[23][ >]/);
  return end < 0 ? html.slice(start) : html.slice(start, start + end);
}

describe("expandGuideDirectives", () => {
  test("replaces the engine index base directive with the generated table", () => {
    expect(expandGuideDirectives(`Intro.\n\n${DIRECTIVE}\n\nAfter.`)).toBe(
      `Intro.\n\n${engineIndexBaseTable()}\n\nAfter.`,
    );
  });

  test("leaves a body without a directive unchanged", () => {
    expect(expandGuideDirectives("No directive here.")).toBe("No directive here.");
  });
});

describe("engine index base table in the guide", () => {
  test("the rendered page carries the table, its API names linked", async () => {
    const section = sectionAfter(
      await renderReal("typescript-vs-lua.md"),
      "Engine indexes use Defold",
    );
    const table = section.slice(section.indexOf("<table>"), section.indexOf("</table>"));
    const route = guideSymbolRoutes(GUIDE_DIR).get("b2d.fixture.get_density");
    expect(route).toBeDefined();
    expect(table).toContain(
      `<a href="${withBase(route ?? "")}"><code>b2d.fixture.get_density</code></a>`,
    );
    expect(section).not.toContain("engine-index-base-table");
  });

  test("llms-full.txt inlines the table in place of the directive", () => {
    const full = buildLlmsFull(SITE_TARGET);
    expect(full).toContain(engineIndexBaseTable());
    expect(full).not.toContain(DIRECTIVE);
  });
});
