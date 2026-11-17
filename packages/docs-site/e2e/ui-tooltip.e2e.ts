import { expect, test } from "@playwright/test";

// A tap focuses a trigger without showing its tip, but that suppression must
// end at the next keyboard input: tabbing away and back shows the label.
const PAGE_WITH_PLATFORM_BADGES = "/api/sys";

test.use({ hasTouch: true });

test("keyboard focus shows a tooltip after a tap focused the trigger", async ({ page }) => {
  await page.goto(PAGE_WITH_PLATFORM_BADGES);
  const trigger = page.locator('[data-slot="tooltip-trigger"]').first();
  await trigger.scrollIntoViewIfNeeded();

  // The page script mounts the tips once the page hydrates, which on a busy dev
  // server can come after the tap. A hover that shows the tip proves they are live;
  // the pointer leaves first, since a hover where it already rests fires nothing.
  await expect(async () => {
    await page.mouse.move(0, 0);
    await trigger.hover();
    await expect(page.getByRole("tooltip")).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toBeHidden();

  await trigger.tap();
  await expect(trigger).toBeFocused();
  await expect(trigger).not.toHaveAttribute("aria-describedby");

  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(trigger).toBeFocused();
  const label = await trigger.getAttribute("data-tooltip-content");
  await expect(page.getByRole("tooltip")).toHaveText(label ?? "");
  await expect(trigger).toHaveAttribute("aria-describedby", "ui-tooltip");
});
