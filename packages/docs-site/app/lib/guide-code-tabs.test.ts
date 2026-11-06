/**
 * A `ts builder` fence on the State machines guide is the Builder tab of the config fence right
 * before it. One placed after prose, or after a fence that already holds a tab, would render as a
 * loose block, so the rendered page must hold one Config/Builder tab group per builder fence.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderGuidePage } from "./content";
import { listGuidePages } from "./guide-loader";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");
const PAGE = "state-machines.md";
const BUILDER_FENCE = /^(?:> ?)?```ts builder(?=\s)/gm;
const CONFIG_BUILDER_GROUP = /\bdata-code-tabs="config-builder"/g;

describe("Config and Builder tabs on the State machines guide", () => {
  test("every ts builder fence renders as the Builder tab of a Config/Builder group", async () => {
    const page = listGuidePages(GUIDE_DIR).find((entry) => entry.file === PAGE);
    if (page === undefined) throw new Error(`no guide page ${PAGE}`);
    const builders = readFileSync(join(GUIDE_DIR, PAGE), "utf8").match(BUILDER_FENCE) ?? [];
    expect(builders.length).toBeGreaterThan(0);
    const html = await renderGuidePage(GUIDE_DIR, page);
    expect(html.match(CONFIG_BUILDER_GROUP) ?? []).toHaveLength(builders.length);
  });
});
