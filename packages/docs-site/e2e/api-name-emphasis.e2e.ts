import { expect, type Locator, test } from "@playwright/test";

// A signature sits in a weight-600 `h3`, and critical.css declares `.prose
// strong` unlayered at 600, so whether only the names end up bold depends on the
// whole cascade. Only a real browser can resolve it.
const PAGE = "/api/socket";

const weight = (locator: Locator) =>
  locator.evaluate((el) => getComputedStyle(el as HTMLElement).fontWeight);

test("a signature heading is normal weight with bold names only", async ({ page }) => {
  await page.goto(PAGE);
  const heading = page.locator("article.prose h3", { hasText: "socket.newtry(" }).first();
  const code = heading.locator(".api-signature").first();
  await expect(code).toBeVisible();

  expect(await weight(code)).toBe("400");
  const bold = await code.evaluate((el) => {
    const runs: string[] = [];
    let open = false;
    for (const span of el.querySelectorAll("span")) {
      const weighted = getComputedStyle(span).fontWeight === "600";
      if (weighted && open) runs[runs.length - 1] += span.textContent ?? "";
      else if (weighted) runs.push(span.textContent ?? "");
      open = weighted;
    }
    return runs;
  });
  expect(bold).toEqual(["newtry", "finalizer", "value", "...rest"]);

  const body = heading.locator(
    "xpath=following-sibling::div[contains(@class,'api-symbol-body')][1]",
  );
  expect(await weight(body.locator(".api-name", { hasText: "finalizer" }).first())).toBe("600");
  expect(await weight(body.locator(".api-slot-label").first())).toBe("400");
});

test("bold in slot docs renders at the surrounding weight", async ({ page }) => {
  await page.goto(PAGE);
  const note = page
    .locator(".api-symbol-body li strong:not(.api-name)", { hasText: "1-based" })
    .first();
  await expect(note).toBeVisible();
  const [own, around] = await note.evaluate((el) => [
    getComputedStyle(el).fontWeight,
    getComputedStyle(el.parentElement as HTMLElement).fontWeight,
  ]);
  expect(own).toBe(around);
});
