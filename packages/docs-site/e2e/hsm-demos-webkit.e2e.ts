import { expect, test } from "@playwright/test";

// WebKit pulls the page back while the reader scrolls if the live diagrams keep
// rewriting the DOM, pinning the state machines tutorial short of its bottom.
// Chromium never showed the pin, so this spec runs in WebKit only and needs
// `bunx playwright install webkit` once per machine.

test.use({ browserName: "webkit", viewport: { width: 1280, height: 800 } });

const WHEEL_STEPS = 60;
const WHEEL_DELTA = 50;
const TOLERANCE = 2;

test("wheel-scrolling reaches and holds the page bottom", async ({ page }) => {
  await page.goto("/state-machines-tutorial");
  await expect(page.locator('[data-hsm-demo="door"] .hsm-demo')).toBeAttached();

  const maxScroll = () =>
    page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const scrollY = () => page.evaluate(() => window.scrollY);

  const max = await maxScroll();
  await page.evaluate((y) => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, y);
  }, max - 2000);
  await page.mouse.move(640, 400);

  let previous = await scrollY();
  for (let i = 1; i <= WHEEL_STEPS; i++) {
    await page.mouse.wheel(0, WHEEL_DELTA);
    await page.waitForTimeout(30);
    const now = await scrollY();
    expect(now, `scrollY after wheel ${i}`).toBeGreaterThanOrEqual(
      Math.min(previous + WHEEL_DELTA, max) - TOLERANCE,
    );
    previous = now;
  }

  await page.waitForTimeout(1000);
  expect(await scrollY()).toBe(await maxScroll());
});
