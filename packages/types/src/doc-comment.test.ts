import { describe, expect, test } from "bun:test";
import { htmlToCodeText, htmlToDocText, renderDocComment } from "./doc-comment";

describe("htmlToDocText", () => {
  test("returns plain text unchanged", () => {
    expect(htmlToDocText("plain text")).toBe("plain text");
  });

  test("<code> becomes Markdown inline code", () => {
    expect(htmlToDocText("call <code>x</code> now")).toBe("call `x` now");
  });

  test("<em> becomes Markdown emphasis", () => {
    expect(htmlToDocText("an <em>x</em> value")).toBe("an *x* value");
  });

  test("<a href> becomes its plain link text", () => {
    expect(htmlToDocText('see <a href="/ref/go#go.foo">go.foo</a>')).toBe("see go.foo");
  });

  test("<ul><li> becomes a Markdown bullet list", () => {
    expect(htmlToDocText("<ul><li>a</li><li>b</li></ul>")).toBe("- a\n- b");
  });

  test("<br> becomes a newline", () => {
    expect(htmlToDocText("line one<br>line two")).toBe("line one\nline two");
  });

  test("consecutive whitespace collapses and ends trim", () => {
    expect(htmlToDocText("  foo   bar  ")).toBe("foo bar");
  });

  test("HTML entities decode", () => {
    expect(htmlToDocText("&lt;a&gt; &amp; &#39;b&#39; &quot;c&quot;")).toBe("<a> & 'b' \"c\"");
  });

  test("a literal */ is escaped so it cannot close a JSDoc comment", () => {
    const out = htmlToDocText("ends with */ here");
    expect(out).not.toContain("*/");
    expect(out).toBe("ends with *\\/ here");
  });

  test("empty / whitespace-only input returns empty string", () => {
    expect(htmlToDocText("")).toBe("");
    expect(htmlToDocText("   \n\t ")).toBe("");
  });
});

describe("htmlToCodeText", () => {
  test("strips syntax-highlight spans while preserving newlines and indentation", () => {
    const html =
      '<div class="codehilite"><pre><span></span><code><span class="kd">local</span> <span class="n">p</span> <span class="o">=</span> <span class="n">go</span><span class="p">.</span><span class="n">get_position</span><span class="p">()</span>\n    <span class="n">indented</span>\n</code></pre></div>';
    const out = htmlToCodeText(html);
    expect(out).not.toContain("<span");
    expect(out).not.toContain("class=");
    expect(out).toBe("local p = go.get_position()\n    indented");
  });

  test("decodes HTML entities in code", () => {
    expect(htmlToCodeText('<code><span class="s2">&quot;id&quot;</span></code>')).toBe('"id"');
  });

  test("a literal */ inside code is escaped", () => {
    const out = htmlToCodeText("local x = a /* b */");
    expect(out).not.toContain("*/");
    expect(out).toBe("local x = a /* b *\\/");
  });

  test("empty / whitespace-only input returns empty string", () => {
    expect(htmlToCodeText("")).toBe("");
    expect(htmlToCodeText("   \n\t ")).toBe("");
  });
});

describe("renderDocComment", () => {
  test("builds the JSDoc line array with summary, params, and returns", () => {
    expect(
      renderDocComment({
        summary: "Does a thing.",
        params: [{ name: "id", doc: "the identifier" }],
        returns: "the result",
      }),
    ).toEqual([
      "/**",
      " * Does a thing.",
      " *",
      " * @param id - the identifier",
      " * @returns the result",
      " */",
    ]);
  });

  test("summary only omits the tag separator block", () => {
    expect(renderDocComment({ summary: "Just a summary." })).toEqual([
      "/**",
      " * Just a summary.",
      " */",
    ]);
  });

  test("params/returns without a summary still render", () => {
    expect(
      renderDocComment({ summary: "", params: [{ name: "x", doc: "an x" }], returns: "y out" }),
    ).toEqual(["/**", " * @param x - an x", " * @returns y out", " */"]);
  });

  test("empty params and blank docs are skipped", () => {
    expect(
      renderDocComment({
        summary: "Sum.",
        params: [
          { name: "a", doc: "" },
          { name: "b", doc: "kept" },
        ],
      }),
    ).toEqual(["/**", " * Sum.", " *", " * @param b - kept", " */"]);
  });

  test("nothing to document returns an empty array", () => {
    expect(renderDocComment({ summary: "" })).toEqual([]);
    expect(renderDocComment({ summary: "   " })).toEqual([]);
  });

  test("multi-line summary emits one ` * ` per line", () => {
    expect(renderDocComment({ summary: "first\nsecond" })).toEqual([
      "/**",
      " * first",
      " * second",
      " */",
    ]);
  });

  test("an example emits an @example line, a ```lua fence, the body, and a closing fence", () => {
    expect(
      renderDocComment({ summary: "Does a thing.", example: "local x = 1\nlocal y = 2" }),
    ).toEqual([
      "/**",
      " * Does a thing.",
      " *",
      " * @example",
      " * ```lua",
      " * local x = 1",
      " * local y = 2",
      " * ```",
      " */",
    ]);
  });

  test("example body blank lines render as a bare ` *`", () => {
    expect(renderDocComment({ summary: "", example: "a\n\nb" })).toEqual([
      "/**",
      " * @example",
      " * ```lua",
      " * a",
      " *",
      " * b",
      " * ```",
      " */",
    ]);
  });

  test("example follows @returns", () => {
    expect(renderDocComment({ summary: "S.", returns: "r out", example: "call()" })).toEqual([
      "/**",
      " * S.",
      " *",
      " * @returns r out",
      " * @example",
      " * ```lua",
      " * call()",
      " * ```",
      " */",
    ]);
  });

  test("a blank example does not render an @example block", () => {
    expect(renderDocComment({ summary: "Only.", example: "   " })).toEqual([
      "/**",
      " * Only.",
      " */",
    ]);
  });

  test("a multi-line @param doc prefixes every continuation line with ` * `", () => {
    expect(
      renderDocComment({
        summary: "Make a buffer.",
        params: [
          {
            name: "declaration",
            doc: "A table where each entry describes a stream\n- `name`: the name\n- `type`: the data type",
          },
        ],
      }),
    ).toEqual([
      "/**",
      " * Make a buffer.",
      " *",
      " * @param declaration - A table where each entry describes a stream",
      " * - `name`: the name",
      " * - `type`: the data type",
      " */",
    ]);
  });

  test("a multi-line @returns doc prefixes every continuation line with ` * `", () => {
    expect(
      renderDocComment({ summary: "S.", returns: "a result\n- first part\n- second part" }),
    ).toEqual([
      "/**",
      " * S.",
      " *",
      " * @returns a result",
      " * - first part",
      " * - second part",
      " */",
    ]);
  });

  test("a blank continuation line in a @param doc renders as a bare ` *`", () => {
    expect(
      renderDocComment({ summary: "", params: [{ name: "x", doc: "first\n\nthird" }] }),
    ).toEqual(["/**", " * @param x - first", " *", " * third", " */"]);
  });

  test("single-line @param/@returns output is unchanged", () => {
    expect(
      renderDocComment({
        summary: "Does a thing.",
        params: [{ name: "id", doc: "the identifier" }],
        returns: "the result",
      }),
    ).toEqual([
      "/**",
      " * Does a thing.",
      " *",
      " * @param id - the identifier",
      " * @returns the result",
      " */",
    ]);
  });
});
