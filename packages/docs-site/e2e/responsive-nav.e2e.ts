import { expect, test } from "@playwright/test";

const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 390, height: 844 };

const logo = (page: import("@playwright/test").Page) =>
  page.getByRole("link", { name: "defold-typescript" });
const topicNav = (page: import("@playwright/test").Page) => page.locator("header nav");
const sidebar = (page: import("@playwright/test").Page) => page.getByTestId("sidebar");
const toggle = (page: import("@playwright/test").Page) => page.getByTestId("sidebar-toggle");
const backdrop = (page: import("@playwright/test").Page) => page.getByTestId("sidebar-backdrop");
const logoTitle = (page: import("@playwright/test").Page) => page.getByTestId("logo-title");
const logoIcon = (page: import("@playwright/test").Page) => page.locator("header .logo-mark");
const githubLink = (page: import("@playwright/test").Page) =>
  page.getByRole("link", { name: "GitHub repository" });

async function boxOf(locator: ReturnType<typeof topicNav>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box;
}

const topbarHeightRaw = (page: import("@playwright/test").Page) =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--topbar-height").trim(),
  );

const headerOffsetHeight = (page: import("@playwright/test").Page) =>
  page.locator("[data-topbar]").evaluate((el) => (el as HTMLElement).offsetHeight);

async function firstHeadingScrollMargin(page: import("@playwright/test").Page) {
  const link = sidebar(page).getByRole("link").first();
  const href = await link.getAttribute("href");
  await link.click();
  await page.waitForURL(`**${href}`);
  const heading = page.locator(".prose h2, .prose h3").first();
  await expect(heading).toBeVisible();
  return heading.evaluate((el) => Number.parseFloat(getComputedStyle(el).scrollMarginTop));
}

// Opening the drawer needs the SidebarToggle island hydrated; on a cold dev
// server the click can land before the handler is attached, leaving it shut.
// Retry until it actually opens, clicking only while closed so a late-arriving
// click is never toggled back off.
async function openDrawer(page: import("@playwright/test").Page) {
  await expect(async () => {
    if (!(await sidebar(page).isVisible())) await toggle(page).click();
    await expect(sidebar(page)).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 15_000 });
}

// The TOC only renders on a page that has headings, so reach a real guide page
// from the index. Below `lg` the sidebar is a drawer, so open it first.
async function gotoFirstGuidePage(
  page: import("@playwright/test").Page,
  { drawer }: { drawer: boolean },
) {
  await page.goto("/");
  if (drawer) await openDrawer(page);
  const link = sidebar(page).getByRole("link").first();
  const href = await link.getAttribute("href");
  await link.click();
  await page.waitForURL(`**${href}`);
}

const tocRail = (page: import("@playwright/test").Page) => page.getByTestId("toc-rail");
const tocInline = (page: import("@playwright/test").Page) => page.getByTestId("toc-inline");

test.describe("wide viewport (lg and up)", () => {
  test.use({ viewport: WIDE });

  test("topic nav stays on the logo's row; sidebar shown, toggle hidden", async ({ page }) => {
    await page.goto("/");
    const logoBox = await boxOf(logo(page));
    const navBox = await boxOf(topicNav(page));
    // Same row: the nav's top sits within the logo's vertical band.
    expect(navBox.y).toBeLessThan(logoBox.y + logoBox.height);

    await expect(sidebar(page)).toBeVisible();
    await expect(toggle(page)).toBeHidden();
  });

  test("logo shows the title alongside the mark", async ({ page }) => {
    await page.goto("/");
    await expect(logoIcon(page)).toBeVisible();
    await expect(logoTitle(page)).toBeVisible();
  });

  test("topbar links to the GitHub repository, opening in a new tab", async ({ page }) => {
    await page.goto("/");
    await expect(githubLink(page)).toBeVisible();
    await expect(githubLink(page)).toHaveAttribute("href", /^https:\/\/github\.com\//);
    await expect(githubLink(page)).toHaveAttribute("target", "_blank");
  });

  test("--topbar-height tracks the real header (≈56px)", async ({ page }) => {
    await page.goto("/");
    const raw = await topbarHeightRaw(page);
    expect(raw).not.toBe("");
    const varPx = Number.parseFloat(raw);
    const offset = await headerOffsetHeight(page);
    expect(Math.abs(varPx - offset)).toBeLessThanOrEqual(1);
    expect(Math.abs(varPx - 56)).toBeLessThanOrEqual(1);
  });

  test("prose heading scroll-margin-top follows --topbar-height (≈80px)", async ({ page }) => {
    await page.goto("/");
    const margin = await firstHeadingScrollMargin(page);
    const varPx = Number.parseFloat(await topbarHeightRaw(page));
    expect(Math.abs(margin - (varPx + 24))).toBeLessThanOrEqual(1);
    expect(Math.abs(margin - 80)).toBeLessThanOrEqual(1);
  });

  test("guide page shows the TOC rail and hides the inline disclosure", async ({ page }) => {
    await gotoFirstGuidePage(page, { drawer: false });
    await expect(tocRail(page)).toBeVisible();
    await expect(tocInline(page)).toBeHidden();
  });
});

test.describe("narrow viewport (below lg)", () => {
  test.use({ viewport: NARROW });

  test("topic nav wraps below the logo; sidebar hidden, toggle shown", async ({ page }) => {
    await page.goto("/");
    const logoBox = await boxOf(logo(page));
    const navBox = await boxOf(topicNav(page));
    // Second row: the nav sits entirely below the logo's bottom edge.
    expect(navBox.y).toBeGreaterThanOrEqual(logoBox.y + logoBox.height);
    // The wrapped topic row never scrolls vertically (the active tab's -mb-px
    // bleed is clipped, not turned into an implicit overflow-y: auto scrollbar).
    await expect(topicNav(page)).toHaveCSS("overflow-y", "hidden");

    await expect(sidebar(page)).toBeHidden();
    await expect(toggle(page)).toBeVisible();
  });

  test("logo collapses to the mark, hiding the title", async ({ page }) => {
    await page.goto("/");
    await expect(logoIcon(page)).toBeVisible();
    await expect(logoTitle(page)).toBeHidden();
    // The link keeps its accessible name via aria-label even with the title hidden.
    await expect(logo(page)).toBeVisible();
  });

  test("toggle opens the drawer and backdrop, setting data-sidebar", async ({ page }) => {
    await page.goto("/");
    await openDrawer(page);

    await expect(backdrop(page)).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-sidebar", "open");
  });

  test("backdrop click and Escape both dismiss the drawer", async ({ page }) => {
    await page.goto("/");

    await openDrawer(page);
    await backdrop(page).click();
    await expect(sidebar(page)).toBeHidden();
    await expect(page.locator("html")).not.toHaveAttribute("data-sidebar", "open");

    await openDrawer(page);
    await page.keyboard.press("Escape");
    await expect(sidebar(page)).toBeHidden();
    await expect(page.locator("html")).not.toHaveAttribute("data-sidebar", "open");
  });

  test("clicking a sidebar link navigates and leaves the drawer closed", async ({ page }) => {
    await page.goto("/");
    await openDrawer(page);

    const link = sidebar(page).getByRole("link").first();
    const href = await link.getAttribute("href");
    await link.click();
    await page.waitForURL(`**${href}`);

    await expect(sidebar(page)).toBeHidden();
    await expect(toggle(page)).toBeVisible();
    await expect(page.locator("html")).not.toHaveAttribute("data-sidebar", "open");
  });

  test("--topbar-height tracks the taller wrapped header", async ({ page }) => {
    await page.goto("/");
    const raw = await topbarHeightRaw(page);
    expect(raw).not.toBe("");
    const varPx = Number.parseFloat(raw);
    const offset = await headerOffsetHeight(page);
    expect(Math.abs(varPx - offset)).toBeLessThanOrEqual(1);
    expect(varPx).toBeGreaterThan(80);
  });

  test("prose heading scroll-margin-top follows the taller bar", async ({ page }) => {
    await page.goto("/");
    await openDrawer(page);
    const margin = await firstHeadingScrollMargin(page);
    const varPx = Number.parseFloat(await topbarHeightRaw(page));
    expect(Math.abs(margin - (varPx + 24))).toBeLessThanOrEqual(1);
    expect(varPx).toBeGreaterThan(80);
  });

  test("guide page hides the rail and exposes the inline TOC, collapsed by default", async ({
    page,
  }) => {
    await gotoFirstGuidePage(page, { drawer: true });
    await expect(tocRail(page)).toBeHidden();

    const inline = tocInline(page);
    await expect(inline).toBeVisible();

    // Collapsed by default: the outline links exist but stay hidden until opened,
    // so the disclosure never pushes the prose down on load.
    const firstEntry = inline.getByRole("link").first();
    await expect(firstEntry).toBeHidden();

    await inline.locator("summary").click();
    await expect(firstEntry).toBeVisible();

    // A section link jumps within the page, leaving its anchor on the URL.
    const anchor = await firstEntry.getAttribute("href");
    if (!anchor) throw new Error("inline TOC entry has no href");
    await firstEntry.click();
    await expect(page).toHaveURL(new RegExp(`${anchor}$`));
  });
});

// Between `lg` and `xl` the left sidebar is docked again but the rail is still
// `hidden` (rail is `xl`-only), so the inline disclosure must cover this band —
// otherwise the page outline would vanish here with no fallback.
test.describe("medium viewport (lg to xl)", () => {
  test.use({ viewport: { width: 1100, height: 800 } });

  test("guide page keeps the inline TOC and still hides the rail", async ({ page }) => {
    // Sidebar is docked at this width, so navigate without opening the drawer.
    await gotoFirstGuidePage(page, { drawer: false });
    await expect(tocRail(page)).toBeHidden();
    await expect(tocInline(page)).toBeVisible();
  });
});
