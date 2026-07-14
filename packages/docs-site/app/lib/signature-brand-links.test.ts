import { describe, expect, test } from "bun:test";
import { splitSignatureBrandLinks } from "./signature-brand-links";

// Shiki span-color styles from a real recolored signature (see markdown.ts
// `signatureCodeHtml`). The transform is style-agnostic; these keep the fixtures
// byte-shaped like production output.
const IDENT = "--shiki-light:#24292E;--shiki-dark:#E1E4E8";
const FN = "--shiki-light:#6F42C1;--shiki-dark:#B392F0";
const OP = "--shiki-light:#D73A49;--shiki-dark:#F97583";
const STR = "--shiki-light:#032F62;--shiki-dark:#9ECBFF";

const span = (style: string, text: string) => `<span style="${style}">${text}</span>`;
const code = (inner: string) => `<code class="api-signature shiki">${inner}</code>`;
const ICON = '<span class="heading-anchor-icon"><svg aria-hidden="true"></svg></span>';

// `factory.create(url: string): Opaque<"node">` recolored: `Opaque` is the
// trailing word of a plain-text span, followed by the generic `<` operator span.
const SIG_SPANS =
  span(IDENT, "factory.") +
  span(FN, "create") +
  span(IDENT, "(url: string): Opaque") +
  span(OP, "&#x3C;") +
  span(STR, '"node"') +
  span(OP, ">");

const HEADING_OPEN = '<a class="heading-anchor" href="#slug" aria-label="Permalink to sig">';
const headingInput = `${HEADING_OPEN}${code(SIG_SPANS)}${ICON}</a>`;
const overviewInput = `<a href="#anchor">${code(SIG_SPANS)}</a>`;

const OPAQUE_LINKS = new Map([["Opaque", "/api/Opaque"]]);

// In-test DOM-validity oracle: scan `<a`/`</a>` depth over the string; a depth
// that ever exceeds 1 means an anchor is nested inside another anchor.
function hasNestedAnchor(html: string): boolean {
  const re = /<a\b|<\/a>/g;
  let depth = 0;
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex-exec loop
  while ((m = re.exec(html)) !== null) {
    if (m[0] === "</a>") depth--;
    else if (++depth > 1) return true;
  }
  return false;
}

const BRAND_ANCHOR = `<a class="signature-symbol-link" href="/api/Opaque">${code(span(IDENT, "Opaque"))}</a>`;

describe("splitSignatureBrandLinks", () => {
  test("heading wrapper: brand becomes a sibling of the heading-anchor, PRE and POST re-wrapped", () => {
    const out = splitSignatureBrandLinks(headingInput, OPAQUE_LINKS);
    const expected =
      '<span class="signature-split">' +
      `${HEADING_OPEN}${code(span(IDENT, "factory.") + span(FN, "create") + span(IDENT, "(url: string): "))}</a>` +
      BRAND_ANCHOR +
      `${HEADING_OPEN}${code(span(OP, "&#x3C;") + span(STR, '"node"') + span(OP, ">"))}${ICON}</a>` +
      "</span>";
    expect(out).toBe(expected);
    expect(hasNestedAnchor(out)).toBe(false);
  });

  test("overview wrapper: brand links as a sibling, fragments stay wrapped in the #anchor link", () => {
    const out = splitSignatureBrandLinks(overviewInput, OPAQUE_LINKS);
    const expected =
      '<span class="signature-split">' +
      `<a href="#anchor">${code(span(IDENT, "factory.") + span(FN, "create") + span(IDENT, "(url: string): "))}</a>` +
      BRAND_ANCHOR +
      `<a href="#anchor">${code(span(OP, "&#x3C;") + span(STR, '"node"') + span(OP, ">"))}</a>` +
      "</span>";
    expect(out).toBe(expected);
    expect(hasNestedAnchor(out)).toBe(false);
  });

  test("DOM validity: transformed outputs are unnested; the pre-transform nested form is detected", () => {
    expect(hasNestedAnchor(splitSignatureBrandLinks(headingInput, OPAQUE_LINKS))).toBe(false);
    expect(hasNestedAnchor(splitSignatureBrandLinks(overviewInput, OPAQUE_LINKS))).toBe(false);
    // The naive "wrap inside the code" bug nests an anchor within the outer one.
    const nested = `<a href="#anchor">${code(`${span(IDENT, "x: ")}<a href="/api/Opaque">${span(IDENT, "Opaque")}</a>`)}</a>`;
    expect(hasNestedAnchor(nested)).toBe(true);
  });

  test("two brand mentions each yield one link, still no nesting", () => {
    const twoSpans =
      span(IDENT, "fn(a: Opaque") +
      span(OP, "&#x3C;") +
      span(STR, '"x"') +
      span(OP, ">, b: Opaque") +
      span(OP, "&#x3C;") +
      span(STR, '"y"') +
      span(OP, ">") +
      span(OP, ">");
    const input = `<a href="#anchor">${code(twoSpans)}</a>`;
    const out = splitSignatureBrandLinks(input, OPAQUE_LINKS);
    const opaqueWords = (twoSpans.match(/(?<![A-Za-z0-9_$])Opaque(?![A-Za-z0-9_$])/g) ?? []).length;
    expect(opaqueWords).toBe(2);
    expect((out.match(/class="signature-symbol-link"/g) ?? []).length).toBe(2);
    expect((out.match(/href="\/api\/Opaque"/g) ?? []).length).toBe(2);
    expect(hasNestedAnchor(out)).toBe(false);
  });

  test("word boundary: opaqueThing and MyOpaqueX are left unchanged", () => {
    const input = `<a href="#anchor">${code(span(IDENT, "opaqueThing, MyOpaqueX"))}</a>`;
    expect(splitSignatureBrandLinks(input, OPAQUE_LINKS)).toBe(input);
  });

  test("empty links map returns the input byte-identical", () => {
    expect(splitSignatureBrandLinks(headingInput, new Map())).toBe(headingInput);
  });

  test("a name whose route is absent from the map is not linked", () => {
    expect(splitSignatureBrandLinks(headingInput, new Map([["Vector3", "/api/Vector3"]]))).toBe(
      headingInput,
    );
  });

  test("deploy base is applied to the brand-anchor href", () => {
    const out = splitSignatureBrandLinks(headingInput, OPAQUE_LINKS, (r) => `/repo${r}`);
    expect(out).toContain('href="/repo/api/Opaque"');
    expect(out).not.toContain('href="/api/Opaque"');
  });

  test("based href stays a single escaped anchor, split undisturbed", () => {
    const out = splitSignatureBrandLinks(headingInput, OPAQUE_LINKS, (r) => `/repo${r}`);
    expect((out.match(/class="signature-symbol-link"/g) ?? []).length).toBe(1);
    expect(hasNestedAnchor(out)).toBe(false);
  });

  test("default applyBase is withBase (identity under test)", () => {
    const out = splitSignatureBrandLinks(headingInput, OPAQUE_LINKS);
    expect(out).toContain('href="/api/Opaque"');
  });
});
