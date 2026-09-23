import { describe, expect, test } from "bun:test";
import { API_TYPE_CODE_CLOSE, API_TYPE_CODE_OPEN, linkApiTypeTokens } from "./api-type-links";

function typeCode(inner: string): string {
  return `${API_TYPE_CODE_OPEN}${inner}${API_TYPE_CODE_CLOSE}`;
}

const LINKS = new Map([
  ["gui.Easing", "/api/gui#type-easing"],
  ["graphics.State", "/api/graphics#type-state"],
]);

describe("linkApiTypeTokens", () => {
  test("wraps a matched token in an anchor inside the type code span", () => {
    const html = linkApiTypeTokens(typeCode("gui.Easing | Vector"), LINKS);
    expect(html).toBe(
      `${API_TYPE_CODE_OPEN}<a class="api-type-link" href="/api/gui#type-easing">gui.Easing</a> | Vector${API_TYPE_CODE_CLOSE}`,
    );
  });

  test("an unmatched run is returned byte-identical", () => {
    const source = typeCode("string | number");
    expect(linkApiTypeTokens(source, LINKS)).toBe(source);
  });

  test("an empty link map is an identity", () => {
    const source = typeCode("gui.Easing");
    expect(linkApiTypeTokens(source, new Map())).toBe(source);
  });

  test("every occurrence in one run is linked", () => {
    const html = linkApiTypeTokens(typeCode("gui.Easing | graphics.State | gui.Easing"), LINKS);
    expect(html.match(/<a class="api-type-link"/g)).toHaveLength(3);
    expect(html).toContain('href="/api/graphics#type-state">graphics.State</a>');
  });

  test("word boundaries follow the signature rule, so a longer identifier is left alone", () => {
    const source = typeCode("mygui.Easings | gui.Easing_ | $gui.Easing");
    expect(linkApiTypeTokens(source, LINKS)).toBe(source);
  });

  test("a token bounded by escaped entities still matches", () => {
    const html = linkApiTypeTokens(typeCode("Array&lt;gui.Easing&gt;"), LINKS);
    expect(html).toContain('href="/api/gui#type-easing">gui.Easing</a>');
    expect(html).toContain("Array&lt;");
    expect(html).toContain("&gt;");
  });

  test("a bare token inside an escaped string literal is not matched by a dotted key", () => {
    const source = typeCode("Opaque&lt;&quot;node&quot;&gt;");
    expect(linkApiTypeTokens(source, LINKS)).toBe(source);
  });

  test("code spans that are not api-type runs are untouched", () => {
    const signature = '<code class="api-signature shiki"><span style="">gui.Easing</span></code>';
    const plain = "<code>gui.Easing</code>";
    expect(linkApiTypeTokens(`${signature}${plain}`, LINKS)).toBe(`${signature}${plain}`);
  });

  test("the href is attribute-escaped and base-applied", () => {
    const html = linkApiTypeTokens(
      typeCode("gui.Easing"),
      new Map([["gui.Easing", '/api/g"i']]),
      (route) => `/docs${route}`,
    );
    expect(html).toContain('href="/docs/api/g&quot;i"');
  });
});
