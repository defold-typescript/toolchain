import { devices, expect, test } from "@playwright/test";

// A phone browser lays a page out at 980px and zooms it down unless the head
// declares a device-width viewport. Desktop Chrome ignores that tag, so only a
// mobile device profile shows which width a reader gets.
const PHONE = devices["Pixel 7"];
test.use({ ...PHONE });

for (const route of ["/build", "/api/go"]) {
  test(`${route} lays out at the phone's own width`, async ({ page }) => {
    await page.goto(route);
    const { innerWidth, scrollWidth } = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(innerWidth).toBe(PHONE.viewport.width);
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
}
