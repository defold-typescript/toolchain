/** @jsxImportSource hono/jsx */
import { describe, expect, test } from "bun:test";
import { parseHtml } from "../../lib/__fixtures__/mini-dom";
import { TOOLTIP_TRIGGER_SLOT, TooltipTrigger } from "./tooltip";

describe("TooltipTrigger", () => {
  test("renders one focusable trigger carrying the escaped tooltip content around its children", () => {
    const html = String(
      <TooltipTrigger content={'iOS <"only">'} class="extra">
        <b class="child">x</b>
      </TooltipTrigger>,
    );
    const root = parseHtml(html);
    const triggers = root.querySelectorAll(`[data-slot="${TOOLTIP_TRIGGER_SLOT}"]`);
    expect(triggers).toHaveLength(1);
    const trigger = triggers[0];
    expect(trigger?.tagName).toBe("SPAN");
    expect(trigger?.getAttribute("tabindex")).toBe("0");
    // The mini-dom reads raw attribute text, so the escaped form is what arrives.
    expect(trigger?.getAttribute("data-tooltip-content")).toBe("iOS &lt;&quot;only&quot;&gt;");
    expect(trigger?.className.split(" ")).toContain("extra");
    expect(trigger?.querySelector("b.child")).not.toBeNull();
    expect(html).not.toContain('<"only">');
  });

  test("names the slot the island binds to", () => {
    expect(TOOLTIP_TRIGGER_SLOT).toBe("tooltip-trigger");
  });
});
