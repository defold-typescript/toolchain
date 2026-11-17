import { expect, type Page, test } from "@playwright/test";

// The saved range lives in `localStorage`, which only a browser holds: the server
// renders every page at the window its path states, and the pre-paint script and
// the client sidebar are what apply the reader's own. Only a real browser shows
// whether hydration and navigation keep the reader in that window.
test.use({ viewport: { width: 1440, height: 900 } });

const STORAGE_KEY = "apiSurface";

const sidebar = (page: Page) => page.locator("#nd-sidebar");
// A sidebar page link, leaving out the picker's options, which share hrefs.
const leaf = (page: Page, href: string) =>
  sidebar(page).locator(`a[href="${href}"]:not([data-range-option])`);
const toColumn = (page: Page) => page.locator('[data-range-column="to"]');
const toSummary = (page: Page) => page.locator('[data-range-summary="to"]');
const fromSummary = (page: Page) => page.locator('[data-range-summary="from"]');

// The tracked axis as the `To` column lists it, newest first.
async function trackedVersions(page: Page): Promise<{ id: string; short: string }[]> {
  await page.goto("/api/go");
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

// The visible count pills on one sidebar leaf, by their spelled-out label.
async function visiblePills(page: Page, href: string): Promise<string[]> {
  return leaf(page, href)
    .locator(".nav-badge-count")
    .evaluateAll((pills) =>
      pills
        .filter((pill) => (pill as HTMLElement).style.display !== "none")
        .map((pill) => pill.getAttribute("aria-label") ?? ""),
    );
}

// Fails the test on any React hydration complaint the page logs.
function watchHydration(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test("choosing an older To moves the sidebar and its pills onto that version, and a reload returns there", async ({
  page,
  browser,
}) => {
  const hydration = watchHydration(page);
  const versions = await trackedVersions(page);
  // The second-oldest version: its window is wider than one version, and the
  // committed corpus records changes to `go` only in later ones.
  const older = versions[versions.length - 2];
  if (!older || versions.length < 3)
    throw new Error("the To column lists fewer than three versions");
  const canonicalPills = await visiblePills(page, "/api/go");

  await toColumn(page).locator("summary").click();
  await page.locator(`[data-range-bound="to"][data-range-option="${older.id}"]`).click();
  await page.waitForURL(new RegExp(`/api/${older.id.replace(/\./g, "\\.")}/go$`));
  await expect(toSummary(page)).toHaveText(older.short);
  await expect(leaf(page, `/api/${older.id}/go`)).toHaveCount(1);
  await expect(leaf(page, "/api/go")).toHaveCount(0);

  // A reader with no saved range gets the server's pills for this page's window.
  const fresh = await browser.newPage();
  await fresh.goto(`/api/${older.id}/go`);
  const windowPills = await visiblePills(fresh, `/api/${older.id}/go`);
  await fresh.close();
  expect(windowPills).not.toEqual(canonicalPills);
  await expect.poll(() => visiblePills(page, `/api/${older.id}/go`)).toEqual(windowPills);

  await page.goto("/api/go");
  await page.waitForURL(new RegExp(`/api/${older.id.replace(/\./g, "\\.")}/go$`));
  expect(hydration).toEqual([]);
});

test("a saved range behind the newest release turns the To column red", async ({ page }) => {
  const versions = await trackedVersions(page);
  const newest = versions[0];
  const older = versions[1];
  const oldest = versions[versions.length - 1];
  if (!newest || !older || !oldest) throw new Error("the To column lists fewer than two versions");

  await saveRange(page, oldest.id, older.id);
  await page.goto("/getting-started");
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
  await page.goto("/getting-started");
  await expect(toSummary(page)).toHaveText(newest.short);
  await expect(toColumn(page)).not.toHaveAttribute("data-range-stale");
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
  await page.goto("/getting-started");
  // The picker shows the saved window once it has hydrated.
  await expect(toSummary(page)).toHaveText(older.short);
  await page.locator('[data-range-column="from"] summary').click();
  await page.locator(`[data-range-bound="from"][data-range-option="${narrowed.id}"]`).click();
  await page.waitForURL(/\/api\//);
  await expect(fromSummary(page)).toHaveText(narrowed.short);
  await expect(toSummary(page)).toHaveText(older.short);
});

test("a narrowed From survives a sidebar link between versioned API pages", async ({ page }) => {
  const versions = await trackedVersions(page);
  const older = versions[1];
  const narrowed = versions[2];
  const oldest = versions[versions.length - 1];
  if (!older || !narrowed || !oldest || narrowed.id === oldest.id) {
    throw new Error("the To column lists fewer than four versions");
  }

  await saveRange(page, narrowed.id, older.id);
  await page.goto(`/api/${older.id}/gui`);
  await expect(fromSummary(page)).toHaveText(narrowed.short);

  await leaf(page, `/api/${older.id}/go`).click();
  await page.waitForURL(new RegExp(`/api/${older.id.replace(/\./g, "\\.")}/go$`));
  await expect(fromSummary(page)).toHaveText(narrowed.short);
  await expect(toSummary(page)).toHaveText(older.short);
});

// The symbol markers in the page body, by the newest version each is present in,
// and how many of them sit inside hidden markup.
async function bodyMarkers(page: Page): Promise<{ newest: string[]; hidden: number }> {
  return page.evaluate(() => {
    const markers = Array.from(document.querySelectorAll("[data-page-body] [data-span-newest]"));
    return {
      newest: markers.map((marker) => marker.getAttribute("data-span-newest") ?? ""),
      hidden: markers.filter((marker) => marker.closest('[style*="display: none"]')).length,
    };
  });
}

// A `From` that hides part of `gui` at the newest version, and how many of the
// page's symbol markers it hides. Loads the served page with no saved range.
async function narrowedGuiWindow(page: Page) {
  const versions = await trackedVersions(page);
  const newest = versions[0];
  const older = versions[1];
  const oldest = versions[versions.length - 1];
  if (!newest || !older || !oldest) throw new Error("the To column lists fewer than two versions");
  const axis = versions.map((version) => version.short);

  await page.goto(`/api/${newest.id}/gui`);
  const served = await bodyMarkers(page);
  const removed = served.newest.filter((version) => version !== newest.short);
  if (removed.length === 0) throw new Error("no gui symbol ends before the newest version");
  // The window starting just after the newest version a removed symbol reached.
  const lastSeen = Math.min(...removed.map((version) => axis.indexOf(version)));
  const from = versions[lastSeen - 1];
  if (!from) throw new Error("no version follows the removed symbols");
  const excluded = served.newest.filter((version) => axis.indexOf(version) >= lastSeen).length;
  return { newest, older, oldest, from, excluded };
}

// A sidebar page link to `path`, with or without a query.
const leafTo = (page: Page, path: string) =>
  sidebar(page).locator(
    `a[href="${path}"]:not([data-range-option]), a[href^="${path}?"]:not([data-range-option])`,
  );

const urlEndingIn = (url: string) => new RegExp(`${url.replace(/[.?]/g, "\\$&")}$`);

test("a narrowed From hides what it excludes on a full load and after a sidebar link", async ({
  page,
}) => {
  const hydration = watchHydration(page);
  const { newest, from, excluded } = await narrowedGuiWindow(page);

  await saveRange(page, from.id, newest.id);
  await page.goto(`/api/${newest.id}/gui`);
  await expect.poll(async () => (await bodyMarkers(page)).hidden).toBe(excluded);

  await page.goto(`/api/${newest.id}/go`);
  await expect(fromSummary(page)).toHaveText(from.short);
  // A sidebar link navigates on the client, where the pre-paint script never runs.
  await page.evaluate(() => document.documentElement.setAttribute("data-e2e-document", ""));
  await leaf(page, `/api/${newest.id}/gui`).click();
  await page.waitForURL(new RegExp(`/api/${newest.id.replace(/\./g, "\\.")}/gui$`));
  await expect(page.locator("html[data-e2e-document]")).toHaveCount(1);
  await expect.poll(async () => (await bodyMarkers(page)).hidden).toBe(excluded);
  expect(hydration).toEqual([]);
});

// The static build renders one sidebar per version, so only the client can keep
// the `From` a deep link's `?since=` states on the pages its sidebar leads to.
test("a From the URL states survives a sidebar link with no saved range", async ({ page }) => {
  const hydration = watchHydration(page);
  const { newest, from, excluded } = await narrowedGuiWindow(page);
  const gui = `/api/${newest.id}/gui`;

  await page.goto(`/api/${newest.id}/go?since=${from.id}`);
  await expect(fromSummary(page)).toHaveText(from.short);
  await expect(leafTo(page, gui)).toHaveAttribute("href", `${gui}?since=${from.id}`);
  await leafTo(page, gui).click();
  await page.waitForURL(urlEndingIn(`${gui}?since=${from.id}`));
  await expect(fromSummary(page)).toHaveText(from.short);
  await expect(toSummary(page)).toHaveText(newest.short);
  await expect.poll(async () => (await bodyMarkers(page)).hidden).toBe(excluded);
  expect(hydration).toEqual([]);
});

test("a From the URL states beats a saved window across a sidebar link", async ({ page }) => {
  const hydration = watchHydration(page);
  const { newest, older, oldest, from, excluded } = await narrowedGuiWindow(page);
  const gui = `/api/${newest.id}/gui`;

  await saveRange(page, oldest.id, older.id);
  await page.goto(`/api/${newest.id}/go?since=${from.id}`);
  await expect(fromSummary(page)).toHaveText(from.short);
  await expect(leafTo(page, gui)).toHaveAttribute("href", `${gui}?since=${from.id}`);
  await leafTo(page, gui).click();
  await page.waitForURL(urlEndingIn(`${gui}?since=${from.id}`));
  await expect(fromSummary(page)).toHaveText(from.short);
  await expect(toSummary(page)).toHaveText(newest.short);
  await expect.poll(async () => (await bodyMarkers(page)).hidden).toBe(excluded);
  expect(hydration).toEqual([]);
});

test("a stated oldest From beats a saved narrower one across a sidebar link", async ({ page }) => {
  const { newest, oldest, from } = await narrowedGuiWindow(page);
  const gui = `/api/${newest.id}/gui`;

  await saveRange(page, from.id, newest.id);
  await page.goto(`/api/${newest.id}/go?since=${oldest.id}`);
  await expect(fromSummary(page)).toHaveText(oldest.short);
  await expect(leafTo(page, gui)).toHaveAttribute("href", `${gui}?since=${oldest.id}`);
  await leafTo(page, gui).click();
  await page.waitForURL(urlEndingIn(`${gui}?since=${oldest.id}`));
  await expect(fromSummary(page)).toHaveText(oldest.short);
  await expect(toSummary(page)).toHaveText(newest.short);
});

test("a stated oldest From survives the redirect a saved To triggers", async ({ page }) => {
  const versions = await trackedVersions(page);
  const older = versions[1];
  const narrowed = versions[2];
  const oldest = versions[versions.length - 1];
  if (!older || !narrowed || !oldest || narrowed.id === oldest.id) {
    throw new Error("the To column lists fewer than four versions");
  }

  await saveRange(page, narrowed.id, older.id);
  await page.goto(`/api/go?since=${oldest.id}`);
  await page.waitForURL(urlEndingIn(`/api/${older.id}/go?since=${oldest.id}`));
  await expect(fromSummary(page)).toHaveText(oldest.short);
  await expect(toSummary(page)).toHaveText(older.short);
});
