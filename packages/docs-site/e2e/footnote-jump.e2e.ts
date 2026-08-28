import { expect, test } from "@playwright/test";

const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 390, height: 844 };

// The topbar is sticky and overlays the scrolled page, so a jump target that
// merely reaches the viewport can still sit underneath it. Both ends of a
// footnote round trip — the `[1]` marker to the note, and the note's back-arrow
// to the marker — must land below the bar's lower edge.
const PAGE_WITH_FOOTNOTE = "/build";

async function topbarBottom(page: import("@playwright/test").Page) {
  const box = await page.locator("[data-topbar]").boundingBox();
  if (!box) throw new Error("topbar has no bounding box");
  return box.y + box.height;
}

// The page scrolls smoothly, so a measurement taken the moment the hash changes
// races the animation. Poll until the offset stops moving.
async function scrollSettled(page: import("@playwright/test").Page) {
  let previous = Number.NaN;
  let stable = 0;
  for (let i = 0; i < 100 && stable < 3; i++) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    stable = y === previous ? stable + 1 : 0;
    previous = y;
    await page.waitForTimeout(50);
  }
}

async function topOf(locator: ReturnType<import("@playwright/test").Page["locator"]>) {
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

    test("the marker jumps to a note clear of the topbar, and back again", async ({ page }) => {
      await page.goto(PAGE_WITH_FOOTNOTE);
      const marker = page.locator(".prose .footnote-ref a").first();
      await marker.click();
      await page.waitForFunction(() => window.location.hash.startsWith("#fn"));
      await scrollSettled(page);
      const note = page.locator(".prose .footnotes li").first();
      expect(await topOf(note)).toBeGreaterThan(await topbarBottom(page));

      const backref = page.locator(".prose .footnote-backref").first();
      await backref.click();
      await page.waitForFunction(() => window.location.hash.startsWith("#fnref"));
      await scrollSettled(page);
      expect(await topOf(marker)).toBeGreaterThan(await topbarBottom(page));
    });
  });
}
