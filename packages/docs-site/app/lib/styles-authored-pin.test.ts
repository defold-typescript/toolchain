import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CSS = readFileSync(join(import.meta.dir, "../styles.css"), "utf8");

// Return the `{ ... }` body of the first block whose head matches `head`,
// brace-matched so nested rules are included.
function block(css: string, head: string): string {
  const start = css.indexOf(head);
  if (start === -1) throw new Error(`no block for ${head}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unbalanced block for ${head}`);
}

describe("styles.css — authored-pin colour token", () => {
  test("the light @theme block declares --color-authored-pin", () => {
    expect(block(CSS, "@theme {")).toContain("--color-authored-pin:");
  });

  test('the dark [data-theme="dark"] block declares --color-authored-pin', () => {
    expect(block(CSS, '[data-theme="dark"] {')).toContain("--color-authored-pin:");
  });

  test(".authored-pin is tinted via the token and no longer dims via opacity", () => {
    const rule = block(CSS, ".authored-pin {");
    expect(rule).toContain("color: var(--color-authored-pin)");
    expect(rule).not.toContain("opacity: 0.7");
  });
});
