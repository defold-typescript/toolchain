import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

const overview = (page: import("@playwright/test").Page) => page.locator(".api-overview").first();
const firstCard = (page: import("@playwright/test").Page) =>
  overview(page).locator(".api-overview-card").first();

async function metrics(locator: ReturnType<typeof overview>) {
  return locator.evaluate((el) => {
    const node = el as HTMLElement;
    const style = getComputedStyle(node);
    return {
      clientHeight: node.clientHeight,
      maxHeight: Number.parseFloat(style.maxHeight),
      overflowY: style.overflowY,
      scrollHeight: node.scrollHeight,
    };
  });
}

test("large API overviews are constrained and stay the same height on hover/focus", async ({
  page,
}) => {
  await page.goto("/api/go");

  await expect(overview(page)).toBeVisible();
  await expect(firstCard(page)).toBeVisible();
  const cardCount = await overview(page).locator(".api-overview-card").count();
  expect(cardCount).toBeGreaterThan(10);

  const initial = await metrics(overview(page));
  expect(initial.scrollHeight).toBeGreaterThan(initial.clientHeight);
  expect(initial.overflowY).toBe("auto");

  const secondBox = await overview(page).locator(".api-overview-card").nth(1).boundingBox();
  const firstBox = await firstCard(page).boundingBox();
  if (!firstBox || !secondBox) throw new Error("overview cards have no bounding boxes");
  expect(Math.abs(firstBox.x - secondBox.x)).toBeLessThan(1);
  expect(secondBox.y).toBeGreaterThan(firstBox.y);

  await expect(firstCard(page)).toHaveAttribute("title", /go\.[^—]+ — .+/);

  await overview(page).hover();
  const hovered = await metrics(overview(page));
  expect(hovered.maxHeight).toBe(initial.maxHeight);

  await page.mouse.move(0, 0);
  await firstCard(page).focus();
  const focused = await metrics(overview(page));
  expect(focused.maxHeight).toBe(initial.maxHeight);
});

test("overview card links jump to the matching detail heading", async ({ page }) => {
  await page.goto("/api/go");

  const href = await firstCard(page).getAttribute("href");
  if (!href) throw new Error("overview card has no href");

  await firstCard(page).click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));

  const target = page.locator(`[id="${href.slice(1)}"]`);
  await expect(target).toBeVisible();
});
