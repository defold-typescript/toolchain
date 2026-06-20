import { expect, test } from "@playwright/test";

const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 390, height: 844 };

const logo = (page: import("@playwright/test").Page) =>
  page.getByRole("link", { name: "defold-typescript" });
const topicNav = (page: import("@playwright/test").Page) => page.locator("header nav");
const sidebar = (page: import("@playwright/test").Page) => page.getByTestId("sidebar");
const toggle = (page: import("@playwright/test").Page) => page.getByTestId("sidebar-toggle");
const backdrop = (page: import("@playwright/test").Page) => page.getByTestId("sidebar-backdrop");

async function boxOf(locator: ReturnType<typeof topicNav>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box;
}

test.describe("wide viewport (lg and up)", () => {
  test.use({ viewport: WIDE });

  test("topic nav stays on the logo's row; sidebar shown, toggle hidden", async ({ page }) => {
    await page.goto("/");
    const logoBox = await boxOf(logo(page));
    const navBox = await boxOf(topicNav(page));
    // Same row: the nav's top sits within the logo's vertical band.
    expect(navBox.y).toBeLessThan(logoBox.y + logoBox.height);

    await expect(sidebar(page)).toBeVisible();
    await expect(toggle(page)).toBeHidden();
  });
});

test.describe("narrow viewport (below lg)", () => {
  test.use({ viewport: NARROW });

  test("topic nav wraps below the logo; sidebar hidden, toggle shown", async ({ page }) => {
    await page.goto("/");
    const logoBox = await boxOf(logo(page));
    const navBox = await boxOf(topicNav(page));
    // Second row: the nav sits entirely below the logo's bottom edge.
    expect(navBox.y).toBeGreaterThanOrEqual(logoBox.y + logoBox.height);

    await expect(sidebar(page)).toBeHidden();
    await expect(toggle(page)).toBeVisible();
  });

  test("toggle opens the drawer and backdrop, setting data-sidebar", async ({ page }) => {
    await page.goto("/");
    await toggle(page).click();

    await expect(sidebar(page)).toBeVisible();
    await expect(backdrop(page)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-sidebar", "open");
  });

  test("backdrop click and Escape both dismiss the drawer", async ({ page }) => {
    await page.goto("/");

    await toggle(page).click();
    await expect(sidebar(page)).toBeVisible();
    await backdrop(page).click();
    await expect(sidebar(page)).toBeHidden();
    await expect(page.locator("html")).not.toHaveAttribute("data-sidebar", "open");

    await toggle(page).click();
    await expect(sidebar(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sidebar(page)).toBeHidden();
    await expect(page.locator("html")).not.toHaveAttribute("data-sidebar", "open");
  });

  test("clicking a sidebar link navigates and leaves the drawer closed", async ({ page }) => {
    await page.goto("/");
    await toggle(page).click();
    await expect(sidebar(page)).toBeVisible();

    const link = sidebar(page).getByRole("link").first();
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL(`**${href}`);

    await expect(sidebar(page)).toBeHidden();
    await expect(toggle(page)).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-sidebar", "open");
  });
});
