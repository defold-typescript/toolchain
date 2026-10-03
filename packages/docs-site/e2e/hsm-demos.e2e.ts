import { expect, test } from "@playwright/test";

// The state machines tutorial replaces each `[data-hsm-demo]` placeholder with a
// live diagram running the real hsm library. Pressing the lamp's TOGGLE lights
// its `on` box and narrates the step in the log.

test("the lamp demo toggles on and logs the transition", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  const demo = page.locator('[data-hsm-demo="lamp"] .hsm-demo');
  await expect(demo).toBeVisible();

  const onBox = demo.locator(".hsm-state", {
    has: page.locator(".hsm-state-name", { hasText: /^on$/ }),
  });
  const log = demo.locator(".hsm-log li");
  await expect(onBox).not.toHaveClass(/hsm-on/);
  const before = await log.count();

  await demo.getByRole("button", { name: "TOGGLE" }).click();
  await expect(onBox).toHaveClass(/hsm-on/);
  await expect(log).toHaveCount(before + 3);
  await expect(log.last()).toHaveText("enter on");
});
