import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diffColorTokens, parseThemeColorTokens } from "./design-tokens";

const STYLES_CSS = readFileSync(join(import.meta.dir, "../styles.css"), "utf8");
const RENDERER_TSX = readFileSync(join(import.meta.dir, "../routes/_renderer.tsx"), "utf8");

// styles.css: light values live in `@theme {`, dark in the top-level
// `[data-theme="dark"] {` — never the `html[data-theme] .shiki` or
// `[data-theme] .prose .admonition-*` rule blocks (no `--color-*` there).
const STYLES_ANCHORS = {
  lightAnchor: /^@theme \{/m,
  darkAnchor: /^\[data-theme="dark"\] \{/m,
};
// _renderer.tsx: the inlined THEME_TOKENS block — light `:root`, dark override.
const INLINE_ANCHORS = {
  lightAnchor: /^:root \{/m,
  darkAnchor: /^\[data-theme="dark"\] \{/m,
};

// The pre-paint subset the inline block carries. A drop/add on either side must
// be a deliberate edit here, never a vacuous pass on an empty intersection.
const EXPECTED_INLINE_TOKENS = [
  "--color-bg",
  "--color-surface",
  "--color-surface-2",
  "--color-border",
  "--color-border-strong",
  "--color-text",
  "--color-text-muted",
  "--color-text-faint",
  "--color-accent",
  "--color-accent-soft",
  "--color-accent-strong",
  "--color-code-bg",
].sort();

test("parseThemeColorTokens reads styles.css @theme (light) and top-level dark block", () => {
  const { light, dark } = parseThemeColorTokens(STYLES_CSS, STYLES_ANCHORS);
  expect(light.get("--color-bg")).toBe("#ffffff");
  expect(dark.get("--color-bg")).toBe("#0e0e10");
  // Proof the dark map came from the top-level block, not a `.shiki`/`.admonition`
  // rule: those carry no `--color-*`, so a mismatched anchor would miss this.
  expect(dark.get("--color-text")).toBe("#ececef");
});

test("parseThemeColorTokens reads the _renderer.tsx inline THEME_TOKENS block", () => {
  const { light, dark } = parseThemeColorTokens(RENDERER_TSX, INLINE_ANCHORS);
  expect(light.get("--color-accent")).toBe("#1f6feb");
  expect(dark.get("--color-accent")).toBe("#79a8ff");
});

test("the inline block's --color-* name set is exactly the pinned 12", () => {
  const { light, dark } = parseThemeColorTokens(RENDERER_TSX, INLINE_ANCHORS);
  expect([...light.keys()].sort()).toEqual(EXPECTED_INLINE_TOKENS);
  expect([...dark.keys()].sort()).toEqual(EXPECTED_INLINE_TOKENS);
});

test("every inline --color-* token matches styles.css in both light and dark", () => {
  const styles = parseThemeColorTokens(STYLES_CSS, STYLES_ANCHORS);
  const inline = parseThemeColorTokens(RENDERER_TSX, INLINE_ANCHORS);
  expect(diffColorTokens(inline.light, styles.light)).toEqual([]);
  expect(diffColorTokens(inline.dark, styles.dark)).toEqual([]);
});

test("diffColorTokens names the differing token and is empty for identical maps", () => {
  const a = new Map([
    ["--color-bg", "#000000"],
    ["--color-text", "#ffffff"],
  ]);
  const same = new Map(a);
  expect(diffColorTokens(a, same)).toEqual([]);

  const drifted = new Map([
    ["--color-bg", "#000000"],
    ["--color-text", "#eeeeee"],
  ]);
  expect(diffColorTokens(a, drifted)).toEqual(["--color-text"]);
});
