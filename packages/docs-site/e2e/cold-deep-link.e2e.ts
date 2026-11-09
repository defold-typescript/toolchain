import { type BrowserContext, expect, type Page, test } from "@playwright/test";

const NARROW = { width: 390, height: 844 };

// A cold load of `/page#heading` scrolls to the heading while the page is still
// being parsed. Below `lg` the topbar wraps and grows taller than the `3.5rem`
// fallback, so the measured `--topbar-height` must already be published by the
// time the heading exists, or the heading lands behind the bar.
const PAGE = "/build";

async function topbarBottom(page: Page) {
  const box = await page.locator("[data-topbar]").boundingBox();
  if (!box) throw new Error("topbar has no bounding box");
  return box.y + box.height;
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
    const reachable = [...document.querySelectorAll<HTMLElement>(".prose h2[id]")].filter(
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

test.describe("cold deep link — mobile", () => {
  test.use({ viewport: NARROW });

  test("the topbar height is published before the target heading is parsed", async ({
    context,
  }) => {
    const id = await scrollableHeadingId(context);
    await context.addInitScript((targetId: string) => {
      const record = window as unknown as { __topbarHeightAtTarget?: string };
      const observer = new MutationObserver(() => {
        if (!document.getElementById(targetId)) return;
        record.__topbarHeightAtTarget =
          document.documentElement.style.getPropertyValue("--topbar-height");
        observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }, id);

    const page = await context.newPage();
    await page.goto(`${PAGE}#${id}`);
    const height = await page.evaluate(
      () => (window as unknown as { __topbarHeightAtTarget?: string }).__topbarHeightAtTarget,
    );
    expect(height).toMatch(/^\d+(\.\d+)?px$/);
  });

  test("the heading lands below the topbar", async ({ context }) => {
    const id = await scrollableHeadingId(context);
    const page = await context.newPage();
    await page.goto(`${PAGE}#${id}`);
    await scrollSettled(page);

    const top = await topOf(page.locator(`[id="${id}"]`));
    expect(top).toBeGreaterThan(await topbarBottom(page));
    expect(top).toBeLessThan(NARROW.height);
  });
});
