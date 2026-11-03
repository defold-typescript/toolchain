import { FONT_TOKENS } from "./generated/fonts";

/**
 * The design tokens, inlined by each site's renderer so they are available
 * before the Tailwind stylesheet (and `public/critical.css`) load. Without this,
 * `var(--color-text)` in critical.css would be undefined at first paint and the
 * body would briefly render with the wrong color. Tailwind v4's `@theme` block
 * in `styles.css` redefines the same tokens; that later definition supersedes
 * these because the cascade is per-property and the @theme block is a
 * higher-specificity origin.
 *
 * Keep this list in sync with the `@theme` block in `styles.css` and the dark
 * override below it. The --font-* tokens come from the shared generator output
 * (generated/fonts.ts) so they cannot drift from the fallback @font-face rules.
 */
export const THEME_TOKENS = `
:root {${FONT_TOKENS}
  /* Prose type scale — single source of truth for both critical.css and
   * styles.css. Defined here (not @theme) because it must be present before
   * either stylesheet paints, and it backs no Tailwind utility. */
  --prose-text-size: 17px;
  --prose-table-size: 17px;
  --prose-h1-size: 1.9rem;
  --prose-h2-size: 1.4rem;
  --prose-h3-size: 1.1rem;
  --prose-h4-size: 0.95rem;
  --prose-code-size: 0.875em;
  --prose-pre-size: 14px;
  --prose-code-title-size: 12px;
  /* Navigation type scale. Top menu is its own knob; the left sidebar and
   * right "on this page" rail share one. */
  --nav-top-size: 0.9rem;
  --nav-side-size: 0.9rem;
  --color-bg: #ffffff;
  --color-surface: #f7f7f8;
  --color-surface-2: #f0f0f2;
  --color-border: #e6e6e9;
  --color-border-strong: #d0d0d5;
  --color-text: #1c1c1f;
  --color-text-muted: #5b5b62;
  --color-text-faint: #8a8a92;
  --color-accent: #1f6feb;
  --color-accent-soft: rgba(31, 111, 235, 0.08);
  --color-accent-strong: #1858c4;
  --color-code-bg: #f6f6f7;
}
[data-theme="dark"] {
  --color-bg: #0e0e10;
  --color-surface: #161618;
  --color-surface-2: #1d1d20;
  --color-border: #2a2a2e;
  --color-border-strong: #3a3a40;
  --color-text: #ececef;
  --color-text-muted: #a4a4ad;
  --color-text-faint: #6f6f78;
  --color-accent: #79a8ff;
  --color-accent-soft: rgba(121, 168, 255, 0.12);
  --color-accent-strong: #a9c4ff;
  --color-code-bg: #161618;
}
`;
