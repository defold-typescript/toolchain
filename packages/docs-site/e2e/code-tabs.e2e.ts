import { expect, type Locator, test } from "@playwright/test";

// `/api/vmath` renders its translated examples as Fumadocs' TypeScript/Lua code
// tabs. The server markup shows the TypeScript tab first; a click switches only
// the clicked group, nothing carries across page loads, and the selected tab is
// visibly lit.

// The tabs switch once the page hydrates, which on a cold dev server can come
// after the first click. Selecting a tab twice is harmless, so
// click until it takes.
async function select(tab: Locator) {
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", { timeout: 500 });
  }).toPass({ timeout: 15_000 });
}

test("a tab group starts on TypeScript and a click switches that group alone", async ({ page }) => {
  await page.goto("/api/vmath");
  const lists = page
    .locator("[data-page-body] [role=tablist]")
    .filter({ has: page.getByRole("tab", { name: "Lua", exact: true }) });
  const panelsOf = (list: Locator) => list.locator("xpath=..").locator(":scope > [role=tabpanel]");
  const tabs = lists.first().getByRole("tab");
  const panels = panelsOf(lists.first());

  await expect(tabs).toHaveText(["TypeScript", "Lua"]);
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(panels.nth(0)).toBeVisible();
  await expect(panels.nth(1)).toBeHidden();

  const tabColor = (index: number) => tabs.nth(index).evaluate((el) => getComputedStyle(el).color);
  expect(await tabColor(0)).not.toBe(await tabColor(1));

  await select(tabs.nth(1));
  await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "false");
  await expect(panels.nth(1)).toBeVisible();
  await expect(panels.nth(0)).toBeHidden();
  await expect(panels.nth(1).locator("pre")).toContainText("vmath.");

  const other = lists.nth(1);
  await expect(other.getByRole("tab").nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(panelsOf(other).nth(1)).toBeHidden();

  await page.reload();
  await expect(lists.first().getByRole("tab").nth(0)).toHaveAttribute("aria-selected", "true");
  await expect(panelsOf(lists.first()).nth(1)).toBeHidden();
});

// The panes of a Config/Builder group differ in height. Switching one group leaves
// the rest as they are, so nothing above the clicked tab resizes and it stays where
// the reader's pointer is. A guide page renders each group as Fumadocs' code tabs.
test("switching a Config/Builder group leaves the other groups and the clicked tab in place", async ({
  page,
}) => {
  await page.goto("/state-machines");
  const groups = page
    .locator("[data-page-body] [role=tablist]")
    .filter({ has: page.getByRole("tab", { name: "Builder", exact: true }) });
  const group = groups.last();
  const builder = group.getByRole("tab").nth(1);
  await expect(builder).toHaveText("Builder");
  await group.evaluate((el) => el.scrollIntoView({ block: "center", behavior: "instant" }));

  const viewportTop = () => builder.evaluate((el) => el.getBoundingClientRect().top);
  const before = await viewportTop();
  await select(builder);
  expect(await viewportTop()).toBeCloseTo(before, 0);

  await expect(groups.first().getByRole("tab").nth(0)).toHaveAttribute("aria-selected", "true");
});
