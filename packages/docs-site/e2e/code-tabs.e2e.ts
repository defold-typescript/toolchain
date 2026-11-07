import { expect, test } from "@playwright/test";

// `/api/vmath` renders its translated examples as TypeScript/Lua tab groups.
// The server markup shows the TypeScript tab first; the CodeTabs island switches
// only the clicked group, nothing carries across page loads, and the selected
// tab's badge is visibly lit.

test("a tab group starts on TypeScript and a click switches that group alone", async ({ page }) => {
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

  const other = page.locator('[data-code-tabs="typescript-lua"]').nth(1);
  await expect(other.locator(".code-tab").nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(other.locator(".code-tabs-panel").nth(1)).toBeHidden();

  await page.reload();
  const reloaded = page.locator('[data-code-tabs="typescript-lua"]').first();
  await expect(reloaded.locator(".code-tab").nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(reloaded.locator(".code-tabs-panel").nth(1)).toBeHidden();
});

// The panes of a Config/Builder group differ in height. Switching one group leaves
// the rest as they are, so nothing above the clicked tab resizes and it stays where
// the reader's pointer is.
test("switching a Config/Builder group leaves the other groups and the clicked tab in place", async ({
  page,
}) => {
  await page.goto("/state-machines");
  const groups = page.locator('[data-code-tabs="config-builder"]');
  const group = groups.last();
  const builder = group.locator(".code-tab").nth(1);
  await expect(builder).toHaveText("Builder");
  await group.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));

  const viewportTop = () => builder.evaluate((el) => el.getBoundingClientRect().top);
  const before = await viewportTop();
  await builder.click();
  await expect(builder).toHaveAttribute("aria-selected", "true");
  expect(await viewportTop()).toBeCloseTo(before, 0);

  await expect(groups.first().locator(".code-tab").nth(0)).toHaveAttribute("aria-selected", "true");
});
