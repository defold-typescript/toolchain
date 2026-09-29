import { expect, test } from "@playwright/test";

// `/api/vmath` renders its translated examples as TypeScript/Lua tab groups.
// The server markup shows the TypeScript tab first; the CodeTabs island switches
// the clicked group alone, and the selected tab's badge is visibly lit.

test("a tab group starts on TypeScript and switches to Lua on click", async ({ page }) => {
  await page.goto("/api/vmath");
  const group = page.locator("[data-code-tabs]").first();
  const tabs = group.locator(".code-tab");
  const panels = group.locator(".code-tabs-panel");

  await expect(tabs).toHaveText(["TypeScript", "Lua"]);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(panels.nth(0)).toBeVisible();
  await expect(panels.nth(1)).toBeHidden();

  const badgeBackground = (index: number) =>
    tabs
      .nth(index)
      .locator(".code-badge")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await badgeBackground(0)).not.toBe(await badgeBackground(1));

  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "false");
  await expect(panels.nth(1)).toBeVisible();
  await expect(panels.nth(0)).toBeHidden();
  await expect(panels.nth(1).locator("pre")).toContainText("vmath.");

  const other = page.locator("[data-code-tabs]").nth(1);
  await expect(other.locator(".code-tab").nth(0)).toHaveAttribute("aria-selected", "true");
});
