import { expect, type Page, test } from "@playwright/test";

const WIDE = { width: 1440, height: 900 };
const NARROW = { width: 390, height: 844 };

// Fumadocs' header (below `md`) and outline bar (below `xl`) stay over the
// scrolled page, so a jump target that merely reaches the viewport can still sit
// underneath them. Both ends of a footnote round trip — the `[1]` marker to the
// note, and the note's back-arrow to the marker — must land below them.
const PAGE_WITH_FOOTNOTE = "/build";

async function barsBottom(page: Page) {
  let bottom = 0;
  for (const bar of [page.locator("#nd-subnav"), page.locator("[data-toc-popover]")]) {
    if (!(await bar.isVisible())) continue;
    const box = await bar.boundingBox();
    if (box) bottom = Math.max(bottom, box.y + box.height);
  }
  return bottom;
}

// The page scrolls smoothly, so a measurement taken the moment the hash changes
// races the animation. Poll until the offset stops moving.
async function scrollSettled(page: Page) {
  let previous = Number.NaN;
  let stable = 0;
  for (let i = 0; i < 100 && stable < 3; i++) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    stable = y === previous ? stable + 1 : 0;
    previous = y;
    await page.waitForTimeout(50);
  }
}

async function topOf(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box.y;
}

for (const [name, viewport] of [
  ["desktop", WIDE],
  ["mobile", NARROW],
] as const) {
  test.describe(`footnote jump — ${name}`, () => {
    test.use({ viewport });

    test("the marker jumps to a note clear of the bars, and back again", async ({ page }) => {
      await page.goto(PAGE_WITH_FOOTNOTE);
      const marker = page.locator("[data-page-body] a[data-footnote-ref]").first();
      await marker.click();
      await page.waitForFunction(() => window.location.hash.startsWith("#user-content-fn-"));
      await scrollSettled(page);
      const note = page.locator("[data-page-body] .footnotes li").first();
      const noteTop = await topOf(note);
      expect(noteTop).toBeGreaterThan(await barsBottom(page));
      expect(noteTop).toBeLessThan(viewport.height);

      const backref = page.locator("[data-page-body] a[data-footnote-backref]").first();
      await backref.click();
      await page.waitForFunction(() => window.location.hash.startsWith("#user-content-fnref-"));
      await scrollSettled(page);
      const markerTop = await topOf(marker);
      expect(markerTop).toBeGreaterThan(await barsBottom(page));
      expect(markerTop).toBeLessThan(viewport.height);
    });
  });
}
