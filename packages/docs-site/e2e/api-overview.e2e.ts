import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 1280, height: 800 } });

const overview = (page: import("@playwright/test").Page) => page.locator(".api-overview").first();
const firstItem = (page: import("@playwright/test").Page) => overview(page).locator("li a").first();

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

async function boxOf(locator: ReturnType<typeof firstItem>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box;
}

test("large API overviews render one compact highlighted bullet per function", async ({ page }) => {
  await page.goto("/api/go");

  await expect(overview(page)).toBeVisible();
  await expect(firstItem(page)).toBeVisible();
  const itemCount = await overview(page).locator("li").count();
  expect(itemCount).toBeGreaterThan(10);

  const initial = await metrics(overview(page));
  expect(initial.scrollHeight - initial.clientHeight).toBeLessThanOrEqual(1);
  expect(initial.overflowY).toBe("visible");
  expect(initial.maxHeight).toBe("none");

  const firstBox = await boxOf(firstItem(page));
  const secondBox = await boxOf(overview(page).locator("li a").nth(1));
  expect(Math.abs(firstBox.x - secondBox.x)).toBeLessThan(24);
  expect(secondBox.y).toBeGreaterThan(firstBox.y);

  await expect(firstItem(page).locator(".api-signature")).toBeVisible();
  await expect(firstItem(page).locator(".api-signature span").first()).toHaveAttribute(
    "style",
    /--shiki-light:/,
  );
  await expect(overview(page).locator(".api-overview-description")).toHaveCount(0);
  await expect(overview(page).locator(".api-overview-card")).toHaveCount(0);

  await overview(page).hover();
  const hovered = await metrics(overview(page));
  expect(hovered.clientHeight).toBe(initial.clientHeight);

  await page.mouse.move(0, 0);
  await firstItem(page).focus();
  const focused = await metrics(overview(page));
  expect(focused.clientHeight).toBe(initial.clientHeight);
});

test("overview bullet links jump to the matching detail heading", async ({ page }) => {
  await page.goto("/api/go");

  const href = await firstItem(page).getAttribute("href");
  if (!href) throw new Error("overview bullet has no href");

  await firstItem(page).click();
  await expect(page).toHaveURL(new RegExp(`${href}$`));

  const target = page.locator(`[id="${href.slice(1)}"]`);
  await expect(target).toBeVisible();
});
