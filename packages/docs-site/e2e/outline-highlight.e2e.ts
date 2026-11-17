import { expect, type Page, test } from "@playwright/test";

// Fumadocs marks each outline entry `prose`, the class the shared renderer
// styles the page body by, so only the real cascade shows whether an entry
// keeps the outline's own face, its on-screen highlight and its syntax colors.
test.use({ viewport: { width: 1440, height: 900 } });

const railEntry = (page: Page, id: string) => page.locator("#nd-toc").locator(`a[href="#${id}"]`);
const colorOf = (el: Element) => getComputedStyle(el).color;

// What a color token computes to on this page, in the form `toHaveCSS` reads.
function tokenColor(page: Page, token: string): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement("span");
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  }, token);
}

test("a section title's entry takes the link accent while its section is on screen", async ({
  page,
}) => {
  await page.goto("/api/go");

  const title = railEntry(page, "functions");
  await expect(title).toHaveAttribute("data-active", "true");
  await expect(title).toHaveCSS("color", await tokenColor(page, "--color-accent"));

  await page.locator("#goget").scrollIntoViewIfNeeded();
  await expect(title).toHaveAttribute("data-active", "false");
  await expect(title).toHaveCSS("color", await tokenColor(page, "--color-fd-muted-foreground"));
});

test("a signature's entry shows its heading's syntax colors, faded while its section is off screen", async ({
  page,
}) => {
  await page.goto("/api/go");

  // The member name: the second token of `go.get(`.
  const headingName = page.locator("#goget code.api-signature span").nth(1);
  const signature = railEntry(page, "goget").locator(".outline-signature");
  const name = signature.locator("span").nth(1);
  await expect(headingName).toHaveText("get");
  await expect(name).toHaveText("get");
  await expect
    .poll(() => headingName.evaluate(colorOf))
    .not.toBe(await tokenColor(page, "--color-text"));
  await expect(name).toHaveCSS("color", await headingName.evaluate(colorOf));

  await expect(railEntry(page, "goget")).toHaveAttribute("data-active", "false");
  await expect
    .poll(() => signature.evaluate((el) => Number(getComputedStyle(el).opacity)))
    .toBeLessThan(1);

  await page.locator("#goget").scrollIntoViewIfNeeded();
  await expect(railEntry(page, "goget")).toHaveAttribute("data-active", "true");
  await expect(signature).toHaveCSS("opacity", "1");
});

test("an outline entry keeps the outline's text size, not the page body's", async ({ page }) => {
  await page.goto("/api/go");

  const entry = railEntry(page, "goget");
  await expect(entry).toBeVisible();
  const outlineSize = await entry.evaluate(
    (el) => getComputedStyle(el.parentElement as Element).fontSize,
  );
  await expect(entry).toHaveCSS("font-size", outlineSize);
});
