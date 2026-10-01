import { expect, type Page, test } from "@playwright/test";

// The outline sits outside `.prose`, so only the real cascade shows whether its
// chips pick up the colored chip rules, and only hydration plus a real hover
// shows the tooltip and the window filter mirrored onto the outline.
test.use({ viewport: { width: 1440, height: 900 } });

const railEntry = (page: Page, id: string) =>
  page.getByTestId("toc-rail").locator(`a[href="#${id}"]`);
const backgroundOf = (el: Element) => getComputedStyle(el).backgroundColor;

// The in-body chip's color once the stylesheet has applied; dev injects styles
// from script, so an early read sees no background at all.
async function headingChipBackground(page: Page): Promise<string> {
  const chip = page.locator("#goget .api-badge-dot--changed");
  await expect.poll(() => chip.evaluate(backgroundOf)).not.toMatch(/^(|rgba\(0, 0, 0, 0\))$/);
  return chip.evaluate(backgroundOf);
}

test("an outline entry shows its heading's colored chip", async ({ page }) => {
  await page.goto("/api/go");

  const outlineChip = railEntry(page, "goget").locator(".api-badge-dot--changed");
  await expect(outlineChip).toBeVisible();
  await expect(outlineChip).toHaveCSS("background-color", await headingChipBackground(page));
});

test("the outline tooltip reads like the entry, in the heading's code font", async ({ page }) => {
  await page.goto("/api/go");

  await railEntry(page, "goget").hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toBeVisible();
  await expect(tip.locator(".api-overload-count")).toHaveText("3 overloads");
  const tipChip = tip.locator(".api-badge-dot--changed");
  await expect(tipChip).toBeVisible();
  await expect(tipChip).toHaveCSS("background-color", await headingChipBackground(page));
  expect(await tip.textContent()).not.toContain("...");
  await expect(tip).toHaveCSS(
    "font-family",
    await page.locator("#goget code").evaluate((el) => getComputedStyle(el).fontFamily),
  );
});

test("a window that drops a heading's chip drops it from the outline too", async ({ page }) => {
  await page.goto("/api/go");
  const span = page.locator("#goget [data-span-newest]");
  const newest = await span.getAttribute("data-span-newest");
  expect((await span.getAttribute("data-span-cats"))?.split("|")[0]).toBe("-");

  // The static build prerenders each version at its full range and leaves a
  // narrower `?since=` to the pre-paint filter, but the dev server would honor it
  // and render the narrow window itself. Dropping it from the document request
  // serves the static build's markup, so only the client filter can hide a chip.
  await page.route(/\/api\/defold-[^/]+\/go\?since=/, (route) => {
    const url = new URL(route.request().url());
    url.search = "";
    return route.continue({ url: url.toString() });
  });
  await page.goto(`/api/defold-${newest}/go?since=defold-${newest}`);
  await expect(page.locator("#goget")).toBeVisible();
  const headingChips = page.locator("#goget .api-badge-dot");
  const outlineChips = railEntry(page, "goget").locator(".api-badge-dot");
  await expect(outlineChips).toHaveCount(await headingChips.count());
  await expect(outlineChips).not.toHaveCount(0);
  for (const chips of [headingChips, outlineChips]) {
    for (const chip of await chips.all()) await expect(chip).toBeHidden();
  }
});
