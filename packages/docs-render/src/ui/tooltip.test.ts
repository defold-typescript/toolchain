import { describe, expect, test } from "bun:test";
import { parseHtml } from "../__fixtures__/mini-dom";
import { TOOLTIP_TRIGGER_SLOT, TooltipTrigger } from "./tooltip";

function triggerElement(html: string) {
  const triggers = parseHtml(html).querySelectorAll(`[data-slot="${TOOLTIP_TRIGGER_SLOT}"]`);
  expect(triggers).toHaveLength(1);
  return triggers[0];
}

describe("TooltipTrigger", () => {
  test("renders one focusable trigger carrying the escaped tooltip content around its children", () => {
    const html = TooltipTrigger({
      content: 'iOS <"only">',
      class: "extra",
      children: '<b class="child">x</b>',
    });
    const trigger = triggerElement(html);
    expect(trigger?.tagName).toBe("SPAN");
    expect(trigger?.getAttribute("tabindex")).toBe("0");
    // The mini-dom reads raw attribute text, so the escaped form is what arrives.
    expect(trigger?.getAttribute("data-tooltip-content")).toBe("iOS &lt;&quot;only&quot;&gt;");
    expect(trigger?.className.split(" ")).toContain("extra");
    expect(trigger?.querySelector("b.child")).not.toBeNull();
    expect(html).not.toContain('<"only">');
  });

  test("escapes a tooltip content holding a quote, an angle bracket and an ampersand", () => {
    const html = TooltipTrigger({ content: 'a "b" <c> & d' });
    expect(triggerElement(html)?.getAttribute("data-tooltip-content")).toBe(
      "a &quot;b&quot; &lt;c&gt; &amp; d",
    );
  });

  test("names the slot the tooltip mounts bind to", () => {
    expect(TOOLTIP_TRIGGER_SLOT).toBe("tooltip-trigger");
  });
});
