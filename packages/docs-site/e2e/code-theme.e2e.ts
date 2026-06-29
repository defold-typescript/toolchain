import { expect, test } from "@playwright/test";

// `/getting-started` carries fenced code blocks rendered as `pre.shiki`. The
// Shiki neutralization rule (styles.css + critical.css) must neutralize only
// the per-line `<span class="line">` wrappers, leaving the `<pre>` background
// to `.prose pre { background: var(--color-code-bg) }`. These specs pin both
// the restored block background and the surviving token color per theme.
//
// The `theme-init` head script reads `prefers-color-scheme` (no localStorage
// seed is required) and sets `document.documentElement.dataset.theme` before
// first paint, so the theme is driven entirely by the emulated color scheme.

const CODE_BG = {
  light: "rgb(246, 246, 247)",
  dark: "rgb(22, 22, 24)",
} as const;

const BODY_TEXT = {
  light: "rgb(28, 28, 31)",
  dark: "rgb(236, 236, 239)",
} as const;

const BUN_TOKEN = {
  // github-light / github-dark hex for the `bun` token, pinned because the
  // hex pair is stable across the themes the highlighter is pinned to.
  light: "rgb(111, 66, 193)",
  dark: "rgb(179, 146, 240)",
} as const;

// Pulls the computed `background-color` of the first `pre.shiki` plus the
// computed `color`/`background-color` of the first `<span>` whose text is
// exactly `bun` inside it. Returns trimmed CSS color strings.
async function probe(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const pre = document.querySelector("pre.shiki") as HTMLElement | null;
    if (!pre) throw new Error("no pre.shiki on the page");
    const preBg = getComputedStyle(pre).backgroundColor;

    let spanColor = "";
    let spanBg = "";
    for (const span of Array.from(pre.querySelectorAll("span"))) {
      if (span.textContent === "bun") {
        spanColor = getComputedStyle(span).color;
        spanBg = getComputedStyle(span).backgroundColor;
        break;
      }
    }
    if (!spanColor) throw new Error("no `bun` token span inside pre.shiki");
    return { preBg, spanColor, spanBg };
  });
}

test.describe("light code block theme", () => {
  test.use({ colorScheme: "light" });

  test("pre.shiki paints --color-code-bg and the token color survives", async ({ page }) => {
    await page.goto("/getting-started");
    const { preBg, spanColor, spanBg } = await probe(page);

    expect(preBg).toBe(CODE_BG.light);
    expect(spanColor).not.toBe(BODY_TEXT.light);
    expect(spanColor).toBe(BUN_TOKEN.light);
    expect(spanBg).toBe("rgba(0, 0, 0, 0)");
  });
});

test.describe("dark code block theme", () => {
  test.use({ colorScheme: "dark" });

  test("pre.shiki paints --color-code-bg and the token color survives", async ({ page }) => {
    await page.goto("/getting-started");
    const { preBg, spanColor, spanBg } = await probe(page);

    expect(preBg).toBe(CODE_BG.dark);
    expect(spanColor).toBe(BUN_TOKEN.dark);
    expect(spanBg).toBe("rgba(0, 0, 0, 0)");
  });

  test("a token span background stays transparent", async ({ page }) => {
    await page.goto("/getting-started");
    const { spanBg } = await probe(page);
    expect(spanBg).toBe("rgba(0, 0, 0, 0)");
  });
});
