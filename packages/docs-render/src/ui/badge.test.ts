import { describe, expect, test } from "bun:test";
import { parseHtml } from "../__fixtures__/mini-dom";
import { Badge } from "./badge";

const ICON = '<svg class="glyph" aria-hidden="true"><path d="M0 0"/></svg>';

function badgeElement(html: string) {
  const root = parseHtml(html);
  const badges = root.querySelectorAll('[data-slot="badge"]');
  expect(badges).toHaveLength(1);
  return badges[0];
}

describe("Badge", () => {
  test("renders one badge element with the outline recipe, icon before the escaped label", () => {
    const html = Badge({ variant: "outline", icon: ICON, children: "Lua <5.1>" });
    const badge = badgeElement(html);
    expect(badge?.tagName).toBe("SPAN");
    expect(badge?.getAttribute("data-variant")).toBe("outline");
    expect(badge?.className).toContain("inline-flex");
    expect(badge?.className).toContain("border-border");
    expect(badge?.className).toContain("text-text-muted");
    const icon = badge?.querySelector('[data-slot="badge-icon"]');
    expect(icon?.querySelector("svg.glyph")).not.toBeNull();
    expect(html).toContain("Lua &lt;5.1&gt;");
    expect(html).not.toContain("<5.1>");
    expect(html.indexOf('data-slot="badge-icon"')).toBeLessThan(html.indexOf("Lua &lt;"));
  });

  test("omits the icon slot when no icon is given", () => {
    const html = Badge({ children: "TypeScript" });
    expect(badgeElement(html)?.querySelector('[data-slot="badge-icon"]')).toBeNull();
  });

  test("gives each variant distinct classes and appends an extra class to the recipe", () => {
    const classes = (["default", "secondary", "outline", "warning"] as const).map(
      (variant) => badgeElement(Badge({ variant, children: "x" }))?.className,
    );
    expect(new Set(classes).size).toBe(4);
    const extra = badgeElement(Badge({ class: "code-badge", children: "x" }))?.className ?? "";
    expect(extra.split(" ")).toContain("code-badge");
    expect(extra.startsWith(classes[0] ?? "\0")).toBe(true);
  });

  test("escapes an extra attribute's value onto the badge", () => {
    const html = Badge({ role: "img", "aria-label": 'a "b" <c> & d', children: "x" });
    const badge = badgeElement(html);
    expect(badge?.getAttribute("role")).toBe("img");
    // The mini-dom reads raw attribute text, so the escaped form is what arrives.
    expect(badge?.getAttribute("aria-label")).toBe("a &quot;b&quot; &lt;c&gt; &amp; d");
  });
});
