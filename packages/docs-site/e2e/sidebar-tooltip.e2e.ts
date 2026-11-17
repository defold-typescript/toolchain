import { expect, type Page, test } from "@playwright/test";

// Fumadocs renders `#nd-sidebar` only at 768px and wider, and renders a new node
// each time the window widens past that, so only a real browser shows whether the
// sidebar's tooltips follow the node that replaced the one they were mounted on.
const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 390, height: 844 };

const sidebar = (page: Page) => page.locator("#nd-sidebar");
const firstLink = (page: Page) => sidebar(page).getByRole("link").filter({ hasText: /\w/ }).first();
const tooltip = (page: Page) => page.getByRole("tooltip");

// A point over the page body, clear of the sidebar.
async function moveOffSidebar(page: Page) {
  await page.mouse.move(WIDE.width * 0.6, WIDE.height / 2);
}

async function hoverFirstLink(page: Page): Promise<string> {
  const link = firstLink(page);
  const text = ((await link.textContent()) ?? "").trim();
  expect(text).not.toBe("");
  await link.hover();
  return text;
}

// The tooltips mount once the layout hydrates; on a cold dev server the first
// hover can land before that, so it is retried from off the sidebar.
async function expectTipAfterHydration(page: Page) {
  await expect(async () => {
    await moveOffSidebar(page);
    const text = await hoverFirstLink(page);
    await expect(tooltip(page)).toHaveText(text, { timeout: 500 });
  }).toPass({ timeout: 15_000 });
}

test.use({ viewport: WIDE });

test("a link in the replaced sidebar shows its tooltip", async ({ page }) => {
  await page.goto("/");
  await expectTipAfterHydration(page);
  // A tip left over from this hover carries the same text the last hover expects.
  await moveOffSidebar(page);
  await expect(tooltip(page)).toHaveCount(0);

  await sidebar(page).evaluate((el) => {
    (el as HTMLElement).dataset.e2eFirst = "1";
  });
  await page.setViewportSize(NARROW);
  await expect(sidebar(page)).toHaveCount(0);
  await page.setViewportSize(WIDE);
  await expect(sidebar(page)).toBeVisible();
  await expect(sidebar(page)).not.toHaveAttribute("data-e2e-first");

  await expect(tooltip(page)).toHaveText(await hoverFirstLink(page));
});
