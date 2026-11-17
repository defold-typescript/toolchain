import { type BrowserContext, expect, type Page, test } from "@playwright/test";

const NARROW = { width: 390, height: 844 };
const WIDE = { width: 1440, height: 900 };

// A cold load of `/page#heading` scrolls to the heading while the page is still
// being parsed. Fumadocs' header (below `md`) and outline bar (below `xl`) stay
// over the scrolled page, so the heading's offset must clear whichever of them
// shows, or the heading lands behind them.
const PAGE = "/build";

async function barsBottom(page: Page) {
  let bottom = 0;
  for (const bar of [page.locator("#nd-subnav"), page.locator("[data-toc-popover]")]) {
    if (!(await bar.isVisible())) continue;
    const box = await bar.boundingBox();
    if (box) bottom = Math.max(bottom, box.y + box.height);
  }
  return bottom;
}

// The page scrolls smoothly, so a measurement taken the moment the hash changes
// races the animation. Poll until the offset stops moving.
async function scrollSettled(page: Page) {
  let previous = Number.NaN;
  let stable = 0;
  for (let i = 0; i < 100 && stable < 3; i++) {
    const y = await page.evaluate(() => Math.round(window.scrollY));
    stable = y === previous ? stable + 1 : 0;
    previous = y;
    await page.waitForTimeout(50);
  }
}

async function topOf(locator: ReturnType<Page["locator"]>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("element has no bounding box");
  return box.y;
}

// The last heading the browser can scroll all the way to the top: one below the
// first screen, so the load really scrolls, and one no lower than the maximum
// scroll offset, so the landing spot is set by `scroll-margin-top` rather than
// by the end of the page.
async function scrollableHeadingId(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(PAGE);
  const id = await page.evaluate(() => {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const reachable = [...document.querySelectorAll<HTMLElement>("[data-page-body] h2[id]")].filter(
      (heading) => {
        const top = heading.getBoundingClientRect().top + window.scrollY;
        return top > window.innerHeight && top <= maxScroll;
      },
    );
    return reachable.at(-1)?.id ?? null;
  });
  await page.close();
  if (!id) throw new Error(`${PAGE} has no heading a fragment load can scroll to the top`);
  return id;
}

for (const [name, viewport] of [
  ["mobile", NARROW],
  ["desktop", WIDE],
] as const) {
  test.describe(`cold deep link — ${name}`, () => {
    test.use({ viewport });

    test("the heading lands below the bars over the page", async ({ context }) => {
      const id = await scrollableHeadingId(context);
      const page = await context.newPage();
      await page.goto(`${PAGE}#${id}`);
      await scrollSettled(page);

      const top = await topOf(page.locator(`[id="${id}"]`));
      expect(top).toBeGreaterThan(await barsBottom(page));
      expect(top).toBeLessThan(viewport.height);
    });
  });
}
