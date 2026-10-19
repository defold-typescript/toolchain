import { describe, expect, test } from "bun:test";
import {
  API_NAME_CLOSE,
  API_NAME_OPEN,
  API_TYPE_CODE_CLOSE,
  API_TYPE_CODE_OPEN,
  linkApiTypeTokens,
} from "./api-type-links";

function typeCode(inner: string): string {
  return `${API_TYPE_CODE_OPEN}${inner}${API_TYPE_CODE_CLOSE}`;
}

const LINKS = new Map([
  ["gui.EASING", "/api/gui#type-easing"],
  ["graphics.State", "/api/graphics#type-state"],
]);

describe("linkApiTypeTokens", () => {
  test("wraps a matched token in an anchor inside the type code span", () => {
    const html = linkApiTypeTokens(typeCode("gui.EASING | Vector"), LINKS);
    expect(html).toBe(
      `${API_TYPE_CODE_OPEN}<a class="api-type-link" href="/api/gui#type-easing">gui.EASING</a> | Vector${API_TYPE_CODE_CLOSE}`,
    );
  });

  test("a run holding bold parameter names still links its tokens and keeps the names", () => {
    const name = (text: string) => `${API_NAME_OPEN}${text}${API_NAME_CLOSE}`;
    const html = linkApiTypeTokens(
      typeCode(`(${name("easing")}: gui.EASING, ${name("...rest")}: graphics.State[]) =&gt; void`),
      LINKS,
    );
    expect(html).toBe(
      typeCode(
        `(${name("easing")}: <a class="api-type-link" href="/api/gui#type-easing">gui.EASING</a>, ${name("...rest")}: <a class="api-type-link" href="/api/graphics#type-state">graphics.State</a>[]) =&gt; void`,
      ),
    );
  });

  test("an unmatched run is returned byte-identical", () => {
    const source = typeCode("string | number");
    expect(linkApiTypeTokens(source, LINKS)).toBe(source);
  });

  test("an empty link map is an identity", () => {
    const source = typeCode("gui.EASING");
    expect(linkApiTypeTokens(source, new Map())).toBe(source);
  });

  test("every occurrence in one run is linked", () => {
    const html = linkApiTypeTokens(typeCode("gui.EASING | graphics.State | gui.EASING"), LINKS);
    expect(html.match(/<a class="api-type-link"/g)).toHaveLength(3);
    expect(html).toContain('href="/api/graphics#type-state">graphics.State</a>');
  });

  test("word boundaries follow the signature rule, so a longer identifier is left alone", () => {
    const source = typeCode("mygui.EASINGs | gui.EASING_ | $gui.EASING");
    expect(linkApiTypeTokens(source, LINKS)).toBe(source);
  });

  test("a token bounded by escaped entities still matches", () => {
    const html = linkApiTypeTokens(typeCode("Array&lt;gui.EASING&gt;"), LINKS);
    expect(html).toContain('href="/api/gui#type-easing">gui.EASING</a>');
    expect(html).toContain("Array&lt;");
    expect(html).toContain("&gt;");
  });

  test("a bare token inside an escaped string literal is not matched by a dotted key", () => {
    const source = typeCode("Opaque&lt;&quot;node&quot;&gt;");
    expect(linkApiTypeTokens(source, LINKS)).toBe(source);
  });

  test("code spans that are not api-type runs are untouched", () => {
    const signature = '<code class="api-signature shiki"><span style="">gui.EASING</span></code>';
    const plain = "<code>gui.EASING</code>";
    expect(linkApiTypeTokens(`${signature}${plain}`, LINKS)).toBe(`${signature}${plain}`);
  });

  test("the href is attribute-escaped and base-applied", () => {
    const html = linkApiTypeTokens(
      typeCode("gui.EASING"),
      new Map([["gui.EASING", '/api/g"i']]),
      (route) => `/docs${route}`,
    );
    expect(html).toContain('href="/docs/api/g&quot;i"');
  });
});
