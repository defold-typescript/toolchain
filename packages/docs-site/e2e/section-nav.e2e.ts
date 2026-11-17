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
  await expect(tabBar(page).getByRole("link")).toHaveText([
    "Get started",
    "Guides",
    "API",
    "Libraries",
  ]);
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

test("on a phone the section tabs sit between the header and the page outline bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/build");
  await expect(tabBar(page)).toBeVisible();
  const box = async (selector: string) => {
    const found = await page.locator(selector).first().boundingBox();
    if (!found) throw new Error(`${selector} has no box`);
    return found;
  };
  const header = await box("#nd-docs-layout > header");
  const tabs = await box('[class*="grid-area:tabs"]');
  const outline = await box("[data-toc-popover]");
  expect(tabs.y).toBeGreaterThanOrEqual(header.y + header.height - 1);
  expect(outline.y).toBeGreaterThanOrEqual(tabs.y + tabs.height - 1);

  await tab(page, "API").click();
  await page.waitForURL(/\/api$/);
  await expect(tab(page, "API")).toHaveClass(/text-fd-primary/);
});

test("Libraries sits in the top row and opens the library docs in a new tab", async ({ page }) => {
  await page.goto("/get-started");
  const libraries = tab(page, "Libraries");
  await expect(libraries).toHaveAttribute(
    "href",
    /^https:\/\/defold-typescript\.github\.io\/library-data/,
  );
  await expect(libraries).toHaveAttribute("target", "_blank");
  await expect(libraries).not.toHaveClass(/text-fd-primary/);
  await expect(page.locator("#nd-sidebar").getByRole("link", { name: "Libraries" })).toHaveCount(0);
});

test("the sidebar's section switcher works from a landing page", async ({ page }) => {
  await page.goto("/get-started");
  const trigger = page.locator("[data-section-dropdown] button");
  await expect(trigger).toHaveText("Get started");
  await expect(async () => {
    await trigger.click();
    await expect(page.getByRole("dialog").getByRole("link")).toHaveText(
      ["Get started", "Guides", "API", "Libraries"],
      { timeout: 500 },
    );
  }).toPass({ timeout: 10_000 });
  await page.getByRole("dialog").getByRole("link", { name: "Guides" }).click();
  await page.waitForURL(/\/guides$/);
  await expect(trigger).toHaveText("Guides");
});
