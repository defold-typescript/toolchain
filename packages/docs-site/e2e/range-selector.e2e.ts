import { expect, type Page, test } from "@playwright/test";

// The saved range lives in `localStorage`, which only a browser holds: the server
// renders every page that names no version at the default range, and the
// pre-paint script is what applies the reader's own. Only a real navigation shows
// whether a server-rendered link carries the reader out of that range.
test.use({ viewport: { width: 1440, height: 900 } });

const STORAGE_KEY = "apiSurface";

const toColumn = (page: Page) => page.locator('[data-range-column="to"]');
const toSummary = (page: Page) => page.locator('[data-range-summary="to"]');
const fromSummary = (page: Page) => page.locator('[data-range-summary="from"]');

// The tracked axis as the `To` column lists it, newest first.
async function trackedVersions(page: Page): Promise<{ id: string; short: string }[]> {
  await page.goto("/");
  return page.locator('[data-range-option][data-range-bound="to"]').evaluateAll((options) =>
    options.map((option) => ({
      id: option.getAttribute("data-range-option") ?? "",
      short: option.getAttribute("data-range-short") ?? "",
    })),
  );
}

async function saveRange(page: Page, from: string, to: string): Promise<void> {
  await page.evaluate(
    ([key, value]) => localStorage.setItem(key as string, value as string),
    [STORAGE_KEY, `${from}|${to}`],
  );
}

test("a saved range behind the newest release turns the To dropdown red", async ({ page }) => {
  const versions = await trackedVersions(page);
  const newest = versions[0];
  const older = versions[1];
  const oldest = versions[versions.length - 1];
  if (!newest || !older || !oldest) throw new Error("the To column lists fewer than two versions");

  await saveRange(page, oldest.id, older.id);
  await page.goto("/");
  await expect(toSummary(page)).toHaveText(older.short);
  await expect(toColumn(page)).toHaveAttribute("data-range-stale", "");
  const danger = await page.evaluate(() => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-danger)";
    document.body.appendChild(probe);
    const color = getComputedStyle(probe).color;
    probe.remove();
    return color;
  });
  await expect(toColumn(page).locator("summary")).toHaveCSS("border-color", danger);

  await saveRange(page, oldest.id, newest.id);
  await page.goto("/");
  await expect(toSummary(page)).toHaveText(newest.short);
  await expect(toColumn(page)).not.toHaveAttribute("data-range-stale");
});

test("the API tab keeps the saved range from a page that names no version", async ({ page }) => {
  const versions = await trackedVersions(page);
  const older = versions[1];
  const oldest = versions[versions.length - 1];
  if (!older || !oldest) throw new Error("the To column lists fewer than two versions");

  await saveRange(page, oldest.id, older.id);
  await page.goto("/");
  await page.locator("[data-topic-scroll]").getByRole("link", { name: "API", exact: true }).click();
  await page.waitForURL(new RegExp(`/api/${older.id.replace(/\./g, "\\.")}$`));
  await expect(toSummary(page)).toHaveText(older.short);
  await expect(toColumn(page)).toHaveAttribute("data-range-stale", "");
});

test("moving From on a page that names no version keeps the saved To", async ({ page }) => {
  const versions = await trackedVersions(page);
  const older = versions[1];
  const narrowed = versions[2];
  const oldest = versions[versions.length - 1];
  if (!older || !narrowed || !oldest || narrowed.id === oldest.id) {
    throw new Error("the To column lists fewer than four versions");
  }

  await saveRange(page, oldest.id, older.id);
  await page.goto("/");
  await page.locator('[data-range-column="from"] summary').click();
  await page.locator(`[data-range-bound="from"][data-range-option="${narrowed.id}"]`).click();
  await page.waitForURL(/\/api\//);
  await expect(fromSummary(page)).toHaveText(narrowed.short);
  await expect(toSummary(page)).toHaveText(older.short);
});

test("a narrowed From survives a link between versioned API pages", async ({ page }) => {
  // The static build prerenders each version at its full range, so the links
  // between its pages carry no `?since=`; the dev server would honor one and
  // write it into them. Dropping it from the document request serves the static
  // build's markup, where only the saved range can supply the bound.
  await page.route(/\/api\/defold-[^/?]+(\/[^?]*)?\?since=/, (route) => {
    const url = new URL(route.request().url());
    url.search = "";
    return route.continue({ url: url.toString() });
  });
  const versions = await trackedVersions(page);
  const older = versions[1];
  const narrowed = versions[2];
  const oldest = versions[versions.length - 1];
  if (!older || !narrowed || !oldest || narrowed.id === oldest.id) {
    throw new Error("the To column lists fewer than four versions");
  }

  await saveRange(page, narrowed.id, older.id);
  await page.goto(`/api/${older.id}?since=${narrowed.id}`);
  await expect(fromSummary(page)).toHaveText(narrowed.short);

  await page.locator(`a[href="/api/${older.id}/go"]`).first().click();
  await page.waitForURL(new RegExp(`/api/${older.id.replace(/\./g, "\\.")}/go$`));
  await expect(fromSummary(page)).toHaveText(narrowed.short);
  await expect(toSummary(page)).toHaveText(older.short);
});
