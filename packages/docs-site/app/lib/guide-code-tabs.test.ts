/**
 * A `ts builder` fence on the State machines guide is the Builder tab of the config fence right
 * before it. One placed after prose, or after a fence that already holds a tab, would render as a
 * loose block, so the rendered page must hold one Config/Builder tab group per builder fence.
 * Each group shows two spellings of one machine, so its Config pane must quote a config fence of
 * the excerpt source and its Builder pane that fence's `builder/` twin, the pair the builder
 * parity test holds to each other.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import {
  type BuilderTwin,
  builderTwins,
  collapseWhitespace,
  REPO_ROOT,
  type TabPanes,
  unboundTabPanes,
} from "../../../cli/src/guide-fence-gate";
import { renderGuidePage } from "./content";
import { listGuidePages } from "./guide-loader";

const GUIDE_DIR = join(import.meta.dir, "../../../../packages/docs/guide");
const PAGE = "state-machines.md";
const EXCERPT_SOURCE = join(REPO_ROOT, "packages/cli/test/fixtures/hsm-guide-excerpts.md");
const BUILDER_FENCE = /^(?:> ?)?```ts builder(?=\s)/gm;
const CONFIG_BUILDER_GROUP = /\bdata-code-tabs="config-builder"/g;

// The cheat-sheet's "Move after a delay" Builder pane, and a builder statement of another twin pair.
const DELAY_BUILDER = 'm.state("/alive/alert")\n  .after(5)\n  .to("/alive/patrol");';
const OTHER_PAIR_BUILDER = 'm.state("/cooling").after(3).to("/idle");';

const page = listGuidePages(GUIDE_DIR).find((entry) => entry.file === PAGE);
if (page === undefined) throw new Error(`no guide page ${PAGE}`);
const markdown = readFileSync(join(GUIDE_DIR, PAGE), "utf8");
const twins: readonly BuilderTwin[] = builderTwins(readFileSync(EXCERPT_SOURCE, "utf8"));

let tempDir: string | undefined;
let html = "";
let editedHtml = "";

beforeAll(async () => {
  html = await renderGuidePage(GUIDE_DIR, page);
  tempDir = mkdtempSync(join(tmpdir(), "defold-typescript-guide-tabs-"));
  writeFileSync(join(tempDir, PAGE), markdown.replace(DELAY_BUILDER, OTHER_PAIR_BUILDER));
  editedHtml = await renderGuidePage(tempDir, page);
  GlobalRegistrator.register();
});

afterAll(async () => {
  await GlobalRegistrator.unregister();
  if (tempDir !== undefined) rmSync(tempDir, { recursive: true, force: true });
});

function tabPanes(rendered: string): TabPanes[] {
  const root = document.createElement("div");
  root.innerHTML = rendered;
  return [...root.querySelectorAll('[data-code-tabs="config-builder"]')].map((group) => {
    const panels = [...group.querySelectorAll(".code-tabs-panel")];
    expect(panels).toHaveLength(2);
    return { config: panels[0]?.textContent ?? "", builder: panels[1]?.textContent ?? "" };
  });
}

describe("Config and Builder tabs on the State machines guide", () => {
  test("every ts builder fence renders as the Builder tab of a Config/Builder group", () => {
    const builders = markdown.match(BUILDER_FENCE) ?? [];
    expect(builders.length).toBeGreaterThan(0);
    expect(html.match(CONFIG_BUILDER_GROUP) ?? []).toHaveLength(builders.length);
  });

  test("every Config/Builder group quotes one builder twin pair of the excerpt source", () => {
    expect(unboundTabPanes(tabPanes(html), twins)).toEqual([]);
  });

  test("the gate can fail: a Builder pane quoting another twin pair is reported", () => {
    expect(markdown.split(DELAY_BUILDER)).toHaveLength(2);
    const replaced = collapseWhitespace(OTHER_PAIR_BUILDER);
    expect(twins.some((twin) => collapseWhitespace(twin.builder.body).includes(replaced))).toBe(
      true,
    );
    const groups = tabPanes(editedHtml);
    expect(groups).toHaveLength((markdown.match(BUILDER_FENCE) ?? []).length);
    expect(unboundTabPanes(groups, twins)).toEqual([
      'config "after: { 5: \\"/alive/patrol\\" }" with builder "m.state(\\"/cooling\\").after(3).to(\\"/idle\\");": no builder twin quotes both',
    ]);
  });
});
