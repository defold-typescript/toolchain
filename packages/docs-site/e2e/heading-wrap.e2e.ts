import { expect, test } from "@playwright/test";

// The longest library namespace in the corpus. Neither the dots in it nor the
// path slashes are line-break opportunities under UAX #14, so without the
// explicit `<wbr>`s in `LibraryPath` the heading runs past the viewport and
// scrolls the whole page sideways. Only a real browser can settle this.
const LONGEST_LIBRARY_PAGE = "/api/monarch.transitions.easings";

const NARROW = { width: 390, height: 844 };

const heading = (page: import("@playwright/test").Page) => page.locator("article.prose h1");

const documentOverflow = (page: import("@playwright/test").Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.use({ viewport: NARROW });

test("a long library heading wraps instead of widening the page", async ({ page }) => {
  await page.goto(LONGEST_LIBRARY_PAGE);
  await expect(heading(page)).toBeVisible();

  expect(await documentOverflow(page)).toBeLessThanOrEqual(0);

  const box = await heading(page).boundingBox();
  if (!box) throw new Error("heading has no bounding box");
  expect(box.width).toBeLessThanOrEqual(NARROW.width);
  // Wrapped onto more than one line: taller than a single line box.
  const lineHeight = await heading(page).evaluate((el) =>
    Number.parseFloat(getComputedStyle(el as HTMLElement).lineHeight),
  );
  expect(box.height).toBeGreaterThan(lineHeight * 1.5);
});
