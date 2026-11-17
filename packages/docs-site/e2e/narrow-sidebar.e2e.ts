import { expect, type Page, test } from "@playwright/test";

// Fumadocs shows the sidebar in place on a wide screen and, on a phone, as a
// drawer the header's menu button opens. Only a real browser at each width shows
// which one a reader gets, and whether following a drawer link closes it.
const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1440, height: 900 };

const sidebar = (page: Page) => page.locator("#nd-sidebar");
const drawer = (page: Page) => page.locator("#nd-sidebar-mobile");
// A sidebar link's text runs on into its badge counts, so it is found by target.
const cameraLink = (nav: ReturnType<Page["locator"]>) => nav.locator('a[href="/api/camera"]');
const menuButton = (page: Page) =>
  page.locator("#nd-subnav").getByRole("button", { name: "Open Sidebar" });

// The button needs the layout hydrated; on a cold dev server a click can land
// before its handler is attached. Click only while the drawer is shut, so a late
// click is never toggled back off.
async function openDrawer(page: Page) {
  await expect(async () => {
    if (!(await drawer(page).isVisible())) await menuButton(page).click();
    await expect(drawer(page)).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
}

test.describe("narrow viewport", () => {
  test.use({ viewport: NARROW });

  test("the menu button opens the sidebar, and following a link navigates and closes it", async ({
    page,
  }) => {
    await page.goto("/api/go");
    await expect(sidebar(page)).toBeHidden();
    await expect(drawer(page)).toBeHidden();

    await openDrawer(page);
    await cameraLink(drawer(page)).click();
    await page.waitForURL("**/api/camera");
    await expect(page.locator("[data-page-body] h1")).toContainText("camera");
    await expect(drawer(page)).toBeHidden();
  });
});

test.describe("wide viewport", () => {
  test.use({ viewport: WIDE });

  test("the sidebar shows with no button press", async ({ page }) => {
    await page.goto("/api/go");
    await expect(sidebar(page)).toBeVisible();
    await expect(cameraLink(sidebar(page))).toBeVisible();
    await expect(menuButton(page)).toBeHidden();
  });
});
