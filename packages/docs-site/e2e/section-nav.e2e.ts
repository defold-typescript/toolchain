import { expect, type Page, test } from "@playwright/test";

// The section tabs, the Changelog shortcut and the site's own icon are layout
// chrome a reader reaches on every page, so only a rendered page shows them.
test.use({ viewport: { width: 1440, height: 900 } });

const tabBar = (page: Page) => page.locator('[class*="grid-area:tabs"]');
const tab = (page: Page, name: string) => tabBar(page).getByRole("link", { name, exact: true });

// Fails the test on any React hydration complaint the page logs.
function watchHydration(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test("the section tabs reach every section from a landing page and mark the current one", async ({
  page,
}) => {
  const hydration = watchHydration(page);
  await page.goto("/get-started");
  await expect(tabBar(page).getByRole("link")).toHaveText(["Get started", "Guides", "API"]);
  await expect(tab(page, "Get started")).toHaveClass(/text-fd-primary/);

  await tab(page, "Guides").click();
  await page.waitForURL(/\/guides$/);
  await expect(tab(page, "Guides")).toHaveClass(/text-fd-primary/);
  await expect(tab(page, "Get started")).not.toHaveClass(/text-fd-primary/);

  await tab(page, "API").click();
  await page.waitForURL(/\/api$/);
  await expect(tab(page, "API")).toHaveClass(/text-fd-primary/);

  await page.goto("/build");
  await expect(tab(page, "Guides")).toHaveClass(/text-fd-primary/);
  expect(hydration).toEqual([]);
});

test("the sidebar links to the changelog from any section", async ({ page }) => {
  await page.goto("/api/go");
  await page.locator("#nd-sidebar").getByRole("link", { name: "Changelog", exact: true }).click();
  await page.waitForURL(/\/changelog$/);
  await expect(page.locator("h1")).toHaveText("Changelog");
});

test("the page carries the defold-typescript icon", async ({ page }) => {
  await page.goto("/get-started");
  const icon = page.locator('head link[rel="icon"][type="image/svg+xml"]');
  await expect(icon).toHaveAttribute("href", /\/logo-ver-classic\.svg$/);
  const href = await icon.getAttribute("href");
  expect((await page.request.get(href ?? "")).status()).toBe(200);
  await expect(page.locator('#nd-sidebar img[src$="/logo-ver-classic.svg"]')).toBeVisible();
});

test("the sidebar's icon links put GitHub before npm and name themselves on hover", async ({
  page,
}) => {
  await page.goto("/get-started");
  const icons = page.locator('#nd-sidebar a[href*="github.com"], #nd-sidebar a[href*="npmjs.com"]');
  await expect(icons).toHaveCount(2);
  expect(
    await icons.evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual([
    "https://github.com/defold-typescript/toolchain",
    "https://www.npmjs.com/package/@defold-typescript/cli",
  ]);
  // The tooltip mounts after hydration, so a hover that lands first is repeated.
  for (const [index, name] of ["GitHub", "npm package"].entries()) {
    await expect(async () => {
      await page.mouse.move(0, 0);
      await icons.nth(index).hover();
      await expect(page.locator('[role="tooltip"]')).toHaveText(name, { timeout: 500 });
    }).toPass({ timeout: 10_000 });
  }
});
