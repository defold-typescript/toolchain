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
      maxHeight: style.maxHeight,
      overflowY: style.overflowY,
      scrollHeight: node.scrollHeight,
    };
  });
}

async function boxOf(locator: ReturnType<typeof firstCard>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box;
}

test("large API overviews render one two-line card per function without vertical scrolling", async ({
  page,
}) => {
  await page.goto("/api/go");

  await expect(overview(page)).toBeVisible();
  await expect(firstCard(page)).toBeVisible();
  const cardCount = await overview(page).locator(".api-overview-card").count();
  expect(cardCount).toBeGreaterThan(10);

  const initial = await metrics(overview(page));
  expect(initial.scrollHeight - initial.clientHeight).toBeLessThanOrEqual(1);
  expect(initial.overflowY).toBe("visible");
  expect(initial.maxHeight).toBe("none");

  const firstBox = await boxOf(firstCard(page));
  const secondBox = await boxOf(overview(page).locator(".api-overview-card").nth(1));
  expect(Math.abs(firstBox.x - secondBox.x)).toBeLessThan(1);
  expect(secondBox.y).toBeGreaterThan(firstBox.y);

  const titleBox = await boxOf(firstCard(page).locator(".api-overview-title"));
  const descriptionBox = await boxOf(firstCard(page).locator(".api-overview-description"));
  expect(descriptionBox.y).toBeGreaterThan(titleBox.y);
  expect(descriptionBox.height).toBeLessThanOrEqual(28);
  await expect(firstCard(page).locator(".api-overview-description")).toHaveCSS(
    "overflow",
    "hidden",
  );
  await expect(firstCard(page)).toHaveAttribute("title", /go\.[^—]+ — .+/);

  await overview(page).hover();
  const hovered = await metrics(overview(page));
  expect(hovered.clientHeight).toBe(initial.clientHeight);

  await page.mouse.move(0, 0);
  await firstCard(page).focus();
  const focused = await metrics(overview(page));
  expect(focused.clientHeight).toBe(initial.clientHeight);
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
