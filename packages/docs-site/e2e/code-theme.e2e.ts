import { expect, test } from "@playwright/test";

// `/getting-started` carries fenced code blocks rendered as Fumadocs code blocks:
// a `figure.shiki` around the `<pre>`. The figure is the block's one surface and
// paints `--color-code-bg`; the `<pre>` inside it draws no box of its own (no
// background, border or margin), so no band of another color shows above or
// below the code. The Shiki neutralization rule (styles.css + critical.css)
// neutralizes only the per-line `<span class="line">` wrappers. These specs pin
// the block background, the bare `<pre>` and the surviving token color per theme.
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

const TRANSPARENT = "rgba(0, 0, 0, 0)";

// Pulls the computed `background-color` of the first code block's figure, the
// box of the `<pre>` inside it, plus the computed `color`/`background-color` of
// the first `<span>` whose text is exactly `bun` inside it. Returns trimmed CSS
// strings.
async function probe(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const figure = document.querySelector("[data-page-body] figure.shiki") as HTMLElement | null;
    const pre = figure?.querySelector("pre") as HTMLElement | null;
    if (!figure || !pre) throw new Error("no code block on the page");
    const preStyle = getComputedStyle(pre);

    let spanColor = "";
    let spanBg = "";
    for (const span of Array.from(pre.querySelectorAll("span"))) {
      if (span.textContent === "bun") {
        spanColor = getComputedStyle(span).color;
        spanBg = getComputedStyle(span).backgroundColor;
        break;
      }
    }
    if (!spanColor) throw new Error("no `bun` token span inside the code block");
    return {
      figureBg: getComputedStyle(figure).backgroundColor,
      preBg: preStyle.backgroundColor,
      preBox: [
        preStyle.marginTop,
        preStyle.marginBottom,
        preStyle.borderTopWidth,
        preStyle.borderBottomWidth,
      ],
      spanColor,
      spanBg,
    };
  });
}

test.describe("light code block theme", () => {
  test.use({ colorScheme: "light" });

  test("the code block paints --color-code-bg and the token color survives", async ({ page }) => {
    await page.goto("/getting-started");
    const { figureBg, preBg, spanColor, spanBg } = await probe(page);

    expect(figureBg).toBe(CODE_BG.light);
    expect(preBg).toBe(TRANSPARENT);
    expect(spanColor).not.toBe(BODY_TEXT.light);
    expect(spanColor).toBe(BUN_TOKEN.light);
    expect(spanBg).toBe(TRANSPARENT);
  });
});

test.describe("dark code block theme", () => {
  test.use({ colorScheme: "dark" });

  test("the code block paints --color-code-bg and the token color survives", async ({ page }) => {
    await page.goto("/getting-started");
    const { figureBg, preBg, spanColor, spanBg } = await probe(page);

    expect(figureBg).toBe(CODE_BG.dark);
    expect(preBg).toBe(TRANSPARENT);
    expect(spanColor).toBe(BUN_TOKEN.dark);
    expect(spanBg).toBe(TRANSPARENT);
  });

  test("a token span background stays transparent", async ({ page }) => {
    await page.goto("/getting-started");
    const { spanBg } = await probe(page);
    expect(spanBg).toBe(TRANSPARENT);
  });
});

test("the code block's <pre> draws no box inside the figure", async ({ page }) => {
  await page.goto("/getting-started");
  const { preBox } = await probe(page);
  expect(preBox).toEqual(["0px", "0px", "0px", "0px"]);
});
