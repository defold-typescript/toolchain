import { expect, test } from "@playwright/test";

// The category landings are server-rendered card grids styled by two stylesheets
// at once, so only a rendered page shows whether each card reads as a card.
test.use({ viewport: { width: 1440, height: 900 } });

for (const [path, intro] of [
  ["/get-started", "Install the toolchain, scaffold a project"],
  ["/guides", "Learn defold-typescript in order"],
  ["/api", "Every namespace across the tracked Defold versions"],
] as const) {
  test(`${path} opens with its intro and gives every card a one-line summary`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator("h1 + p")).toContainText(intro);
    const cards = page.locator("[data-card]");
    expect(await cards.count()).toBeGreaterThan(0);
    const summaries = await cards.evaluateAll((all) =>
      all.map((card) => card.querySelector("p")?.textContent?.trim() ?? ""),
    );
    expect(summaries.filter((summary) => summary === "")).toEqual([]);
    await expect(cards.first().locator("h3")).toHaveCSS("margin-top", "0px");
  });
}

test("every section of a grouped landing names what it holds", async ({ page }) => {
  for (const path of ["/guides", "/api"]) {
    await page.goto(path);
    const subtitles = await page
      .locator("section > h2")
      .evaluateAll((headings) =>
        headings.map((heading) => heading.nextElementSibling?.textContent?.trim() ?? ""),
      );
    expect(subtitles.length).toBeGreaterThan(0);
    expect(subtitles.filter((subtitle) => subtitle === "")).toEqual([]);
  }
});

test("a landing's title takes a guide page's heading face, and its card titles the body or code face", async ({
  page,
}) => {
  const face = (selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((el) => getComputedStyle(el).fontFamily);
  await page.goto("/build");
  const guideTitle = await face("h1");
  const body = await face("[data-page-body] p");
  for (const path of ["/get-started", "/guides"]) {
    await page.goto(path);
    expect(await face("h1")).toBe(guideTitle);
    expect(await face("[data-card] h3")).toBe(body);
  }
  await page.goto("/api");
  expect(await face("h1")).toBe(guideTitle);
  expect(await face("[data-card] h3")).toBe(await face("code"));
});
