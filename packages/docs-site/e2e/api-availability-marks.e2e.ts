import { expect, test } from "@playwright/test";

// The chip replaces the list bullet, which only a real cascade can confirm: the
// unlayered `critical.css` list rules outrank anything in `@layer components`.
test("an availability note leads with its chip and no list bullet", async ({ page }) => {
  await page.goto("/api/tilemap");

  const list = page.locator(".api-availability ul").first();
  await expect(list).toBeVisible();
  const listStyle = await list.evaluate((el) => {
    const style = getComputedStyle(el);
    return { listStyleType: style.listStyleType, paddingLeft: style.paddingLeft };
  });
  expect(listStyle).toEqual({ listStyleType: "none", paddingLeft: "0px" });

  const mark = list.locator(".api-availability-mark--deprecated").first();
  await expect(mark).toHaveText("D");
  const background = await mark.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
});

test("a signature history line leads with the changed chip and no list bullet", async ({
  page,
}) => {
  await page.goto("/api/b2d");

  const list = page.locator(".api-revisions").first();
  await expect(list).toBeVisible();
  const listStyle = await list.evaluate((el) => {
    const style = getComputedStyle(el);
    return { listStyleType: style.listStyleType, paddingLeft: style.paddingLeft };
  });
  expect(listStyle).toEqual({ listStyleType: "none", paddingLeft: "0px" });

  const mark = list.locator(".api-availability-mark--changed").first();
  await expect(mark).toHaveText("C");
  const background = await mark.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(background).not.toBe("rgba(0, 0, 0, 0)");
});
