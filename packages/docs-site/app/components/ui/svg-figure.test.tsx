/** @jsxImportSource hono/jsx */
import { describe, expect, test } from "bun:test";
import { parseHtml } from "../../lib/__fixtures__/mini-dom";
import { SvgFigure } from "./svg-figure";

const TWO_PANELS =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 504 200" fill-rule="evenodd">' +
  '<svg class="fig-panel" x="0" y="0" width="240" height="200" viewBox="0 0 240 200"><rect id="left"/></svg>' +
  '<svg class="fig-panel" x="264" y="0" width="240" height="200" viewBox="264 0 240 200"><rect id="right"/></svg>' +
  "</svg>";

function render(svg: string, maxWidth?: string) {
  const html = String(
    <SvgFigure
      svg={svg}
      caption="Figure 2 — Cap"
      src="img/a.svg"
      {...(maxWidth ? { maxWidth } : {})}
    />,
  );
  const figure = parseHtml(html).querySelector('[data-slot="svg-figure"]');
  const panels = figure?.querySelector('[data-slot="svg-figure-panels"]');
  return { html, figure, svgs: panels?.querySelectorAll("svg") ?? [] };
}

describe("SvgFigure", () => {
  test("renders each nested fig-panel as its own svg, sized by its viewBox width", () => {
    const { figure, svgs } = render(TWO_PANELS);
    expect(figure?.className).toBe("figure-svg");
    expect(svgs.map((s) => s.getAttribute("viewBox"))).toEqual(["0 0 240 200", "264 0 240 200"]);
    expect(svgs.map((s) => s.getAttribute("style"))).toEqual(["--w: 240", "--w: 240"]);
    expect(svgs.map((s) => s.querySelector("rect")?.getAttribute("id"))).toEqual(["left", "right"]);
    for (const svg of svgs) {
      expect(svg.getAttribute("fill-rule")).toBe("evenodd");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.getAttribute("class")).toBeNull();
    }
  });

  test("renders a file without panels as one panel, marked single", () => {
    const { figure, svgs } = render('<svg viewBox="0 0 504 150" width="504"><circle/></svg>');
    expect(figure?.className).toBe("figure-svg figure-svg--single");
    expect(svgs).toHaveLength(1);
    expect(svgs[0]?.getAttribute("style")).toBe("--w: 504");
    expect(svgs[0]?.getAttribute("width")).toBeNull();
  });

  test("renders each fig-layout as its own svg tagged with its layout", () => {
    const { figure, svgs } = render(
      '<svg viewBox="0 0 504 150">' +
        '<svg class="fig-layout" data-layout="wide" viewBox="0 0 504 150"><rect id="w"/></svg>' +
        '<svg class="fig-layout" data-layout="narrow" x="0" y="150" viewBox="0 0 260 438"><rect id="n"/></svg>' +
        "</svg>",
    );
    expect(figure?.className).toBe("figure-svg figure-svg--layouts");
    expect(svgs.map((s) => s.getAttribute("data-layout"))).toEqual(["wide", "narrow"]);
    expect(svgs.map((s) => s.getAttribute("style"))).toEqual(["--w: 504", "--w: 260"]);
    expect(svgs.map((s) => s.querySelector("rect")?.getAttribute("id"))).toEqual(["w", "n"]);
  });

  test("throws when a fig-layout does not say which layout it is", () => {
    expect(() => render('<svg><svg class="fig-layout" viewBox="0 0 10 10"></svg></svg>')).toThrow(
      "data-layout",
    );
  });

  test("names the figure once for assistive tech and captions it, escaping the text", () => {
    const html = String(<SvgFigure svg={TWO_PANELS} caption={'a < b & "c"'} src="img/a.svg" />);
    const figure = parseHtml(html).querySelector('[data-slot="svg-figure"]');
    expect(figure?.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(
      "a &lt; b &amp; &quot;c&quot;",
    );
    expect(figure?.querySelector("figcaption")?.textContent).toBe("a &lt; b &amp; &quot;c&quot;");
    expect(html).not.toContain("a < b");
  });

  test("caps the figure when given a max width", () => {
    expect(render(TWO_PANELS, "300px").figure?.getAttribute("style")).toBe(
      "max-width: min(100%, 300px)",
    );
  });

  test("throws naming the source when a panel has no usable viewBox", () => {
    expect(() => render('<svg><svg class="fig-panel"></svg></svg>')).toThrow("img/a.svg");
    expect(() => render("<p>not svg</p>")).toThrow("img/a.svg");
  });
});
