import { describe, expect, test } from "bun:test";
import {
  examplesHtmlToMarkdown,
  htmlToCodeText,
  htmlToDocText,
  renderDocComment,
  segmentExampleRegions,
  splitExampleSources,
} from "./doc-comment";

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

  test("adjacent paragraphs gain a blank-line separator", () => {
    expect(htmlToDocText("<p>A</p><p>B</p>")).toBe("A\n\nB");
  });

  test("a <br> inside a paragraph stays a single newline; the boundary is a blank line", () => {
    expect(htmlToDocText("<p>line one<br>line two</p><p>next</p>")).toBe(
      "line one\nline two\n\nnext",
    );
  });

  test("runaway blank runs collapse to a single blank line", () => {
    expect(htmlToDocText("<p>A</p><p></p><p>B</p>")).toBe("A\n\nB");
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

describe("examplesHtmlToMarkdown", () => {
  const block = (inner: string) => `<div class="codehilite"><pre><code>${inner}</code></pre></div>`;

  test("prose plus one codehilite block yields the prose, a lua fence, and the decoded code", () => {
    const html = `Query a position:\n${block('<span class="n">go</span><span class="p">.</span><span class="n">get</span><span class="p">(</span><span class="s2">&quot;player&quot;</span><span class="p">,</span> <span class="s2">&quot;position&quot;</span><span class="p">)</span>')}`;
    const out = examplesHtmlToMarkdown(html);
    expect(out).toContain("Query a position:");
    expect(out).toContain("```lua");
    expect(out).toContain('go.get("player", "position")');
    expect(out).not.toContain("<div");
    expect(out).not.toContain("<span");
    expect(out).not.toContain("codehilite");
    expect(out).not.toContain("&quot;");
  });

  test("two codehilite blocks separated by prose keep the middle prose between two fences", () => {
    const html = `${block('<span class="n">a</span>')}between<br>${block('<span class="n">b</span>')}`;
    const out = examplesHtmlToMarkdown(html);
    expect(out.match(/```lua/g)?.length).toBe(2);
    expect(out).toContain("between");
    const firstFenceEnd = out.indexOf("```", out.indexOf("```lua") + 6);
    const secondFenceStart = out.indexOf("```lua", firstFenceEnd);
    expect(out.indexOf("between")).toBeGreaterThan(firstFenceEnd);
    expect(out.indexOf("between")).toBeLessThan(secondFenceStart);
  });

  test("codehilite only, no surrounding prose, is a single lua fence with no stray prose line", () => {
    const html = block('<span class="n">solo</span>');
    const out = examplesHtmlToMarkdown(html);
    expect(out.match(/```lua/g)?.length).toBe(1);
    expect(out).toBe("```lua\nsolo\n```");
  });

  test("plain code with no codehilite is wrapped as one lua fence (back-compat)", () => {
    const out = examplesHtmlToMarkdown('go.get(<span class="s2">&quot;x&quot;</span>)');
    expect(out).toBe('```lua\ngo.get("x")\n```');
  });

  test("a language-X code class sets the fence language; a classless block stays lua", () => {
    const json = `<div class="codehilite"><pre><code class="language-json">{ &quot;a&quot;: 1 }</code></pre></div>`;
    const html = `${json}${block('<span class="n">b</span>')}`;
    expect(examplesHtmlToMarkdown(html)).toBe('```json\n{ "a": 1 }\n```\n\n```lua\nb\n```');
  });

  test("empty / whitespace-only input returns empty string", () => {
    expect(examplesHtmlToMarkdown("")).toBe("");
    expect(examplesHtmlToMarkdown("   \n\t ")).toBe("");
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

  test("a blank line in the summary emits ` *` without a trailing space", () => {
    expect(renderDocComment({ summary: "First paragraph.\n\nSecond paragraph." })).toEqual([
      "/**",
      " * First paragraph.",
      " *",
      " * Second paragraph.",
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
      renderDocComment({
        summary: "Does a thing.",
        examples: [{ text: "local x = 1\nlocal y = 2", lang: "lua" }],
      }),
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
    expect(renderDocComment({ summary: "", examples: [{ text: "a\n\nb", lang: "lua" }] })).toEqual([
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

  test("exampleLang ts emits a ```ts fence and the body", () => {
    expect(
      renderDocComment({
        summary: "Does a thing.",
        examples: [{ text: "const x = 1;", lang: "ts" }],
      }),
    ).toEqual([
      "/**",
      " * Does a thing.",
      " *",
      " * @example",
      " * ```ts",
      " * const x = 1;",
      " * ```",
      " */",
    ]);
  });

  test("lang lua emits a ```lua fence and never a ```ts one", () => {
    const lua = renderDocComment({
      summary: "S.",
      examples: [{ text: "local x = 1", lang: "lua" }],
    });
    expect(lua).toContain(" * ```lua");
    expect(lua).not.toContain(" * ```ts");
  });

  test("an empty examples list renders no @example block", () => {
    expect(renderDocComment({ summary: "Only.", examples: [] })).toEqual([
      "/**",
      " * Only.",
      " */",
    ]);
  });

  test("two examples emit two @example blocks, each with its own fence language", () => {
    expect(
      renderDocComment({
        summary: "S.",
        returns: "r out",
        examples: [
          { text: "const a = 1;", lang: "ts" },
          { text: "local b = 2", lang: "lua" },
        ],
      }),
    ).toEqual([
      "/**",
      " * S.",
      " *",
      " * @returns r out",
      " * @example",
      " * ```ts",
      " * const a = 1;",
      " * ```",
      " * @example",
      " * ```lua",
      " * local b = 2",
      " * ```",
      " */",
    ]);
  });

  test("a blank body is dropped from the list, and dropping them all renders nothing", () => {
    expect(
      renderDocComment({
        summary: "S.",
        examples: [
          { text: "   ", lang: "ts" },
          { text: "kept()", lang: "ts" },
        ],
      }),
    ).toEqual(["/**", " * S.", " *", " * @example", " * ```ts", " * kept()", " * ```", " */"]);
    expect(renderDocComment({ summary: "", examples: [{ text: "  ", lang: "ts" }] })).toEqual([]);
  });

  test("example follows @returns", () => {
    expect(
      renderDocComment({
        summary: "S.",
        returns: "r out",
        examples: [{ text: "call()", lang: "lua" }],
      }),
    ).toEqual([
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
    expect(
      renderDocComment({ summary: "Only.", examples: [{ text: "   ", lang: "lua" }] }),
    ).toEqual(["/**", " * Only.", " */"]);
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

  test("a bare @deprecated alone is enough to document, where an empty summary alone is not", () => {
    expect(renderDocComment({ summary: "", deprecated: "" })).toEqual([
      "/**",
      " * @deprecated",
      " */",
    ]);
  });

  test("a summary plus @deprecated text emits the separator then the tag", () => {
    expect(renderDocComment({ summary: "S", deprecated: "text" })).toEqual([
      "/**",
      " * S",
      " *",
      " * @deprecated text",
      " */",
    ]);
  });

  test("multi-line @deprecated text keeps its continuation lines inside the comment", () => {
    expect(renderDocComment({ summary: "S", deprecated: "first\n\nthird" })).toEqual([
      "/**",
      " * S",
      " *",
      " * @deprecated first",
      " *",
      " * third",
      " */",
    ]);
  });

  test("@deprecated renders before @param and @returns", () => {
    expect(
      renderDocComment({
        summary: "Does a thing.",
        deprecated: "Use `other`.",
        params: [{ name: "id", doc: "the identifier" }],
        returns: "the result",
      }),
    ).toEqual([
      "/**",
      " * Does a thing.",
      " *",
      " * @deprecated Use `other`.",
      " * @param id - the identifier",
      " * @returns the result",
      " */",
    ]);
  });

  test("output for parts carrying no deprecated key is byte-identical to today's", () => {
    expect(renderDocComment({ summary: "Just a summary." })).toEqual([
      "/**",
      " * Just a summary.",
      " */",
    ]);
    expect(renderDocComment({ summary: "Sum.", params: [{ name: "a", doc: "an a" }] })).toEqual([
      "/**",
      " * Sum.",
      " *",
      " * @param a - an a",
      " */",
    ]);
    expect(
      renderDocComment({
        summary: "Sum.",
        params: [{ name: "a", doc: "an a" }],
        returns: "the result",
        examples: [{ text: "local x = 1", lang: "lua" }],
      }),
    ).toEqual([
      "/**",
      " * Sum.",
      " *",
      " * @param a - an a",
      " * @returns the result",
      " * @example",
      " * ```lua",
      " * local x = 1",
      " * ```",
      " */",
    ]);
    expect(renderDocComment({ summary: "" })).toEqual([]);
  });
});

describe("splitExampleSources", () => {
  const block = (inner: string) => `<div class="codehilite"><pre><code>${inner}</code></pre></div>`;

  test("two codehilite divs with prose between them yield two segments, prose on the second", () => {
    const html = `${block("local a = 1")}Then update it:<br>${block("local b = 2")}`;
    const segments = splitExampleSources(html);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.code).toBe("local a = 1");
    expect(segments[0]?.prose).toBe("");
    expect(segments[1]?.code).toBe("local b = 2");
    expect(segments[1]?.prose).toBe("Then update it:");
    expect(segments[0]?.code).not.toContain("Then update it:");
    expect(segments[1]?.code).not.toContain("Then update it:");
  });

  test("a closing fence welded to prose inside one div splits it, and no fence survives into code", () => {
    const html = block(
      "local a = 1\n```Update a texture from a buffer resource\n```lua\nlocal b = 2",
    );
    const segments = splitExampleSources(html);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.code).toBe("local a = 1");
    expect(segments[1]?.prose).toBe("Update a texture from a buffer resource");
    expect(segments[1]?.code).toBe("local b = 2");
    for (const segment of segments) expect(segment.code).not.toContain("```");
  });

  test("a ```lua opener reached while already in code closes the run and opens the next", () => {
    const html = block("local a = 1\n```lua\nlocal b = 2");
    const segments = splitExampleSources(html);
    expect(segments).toHaveLength(2);
    expect(segments[0]?.code).toBe("local a = 1");
    expect(segments[1]?.code).toBe("local b = 2");
    expect(segments[1]?.lang).toBe("lua");
  });

  test("a fence inside a prose region contributes a code segment of its own", () => {
    const html = `${block("local a = 1")}More:<br>\`\`\`lua<br>local trailing = 3<br>\`\`\``;
    const segments = splitExampleSources(html);
    expect(segments).toHaveLength(2);
    expect(segments[1]?.code).toBe("local trailing = 3");
    expect(segments[1]?.prose).toBe("More:");
  });

  test("a one-segment blob returns code byte-identical to htmlToCodeText, prose included", () => {
    const html = `Query a position:<br>${block("go.get(&quot;player&quot;, &quot;position&quot;)")}`;
    const segments = splitExampleSources(html);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.code).toBe(htmlToCodeText(html));
    expect(segments[0]?.prose).toBe("");
  });

  test("a blob with no code block at all still returns the whole-blob htmlToCodeText", () => {
    const html = "local only = 1<br>local more = 2";
    const segments = splitExampleSources(html);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.code).toBe(htmlToCodeText(html));
  });

  test("empty / whitespace-only input yields no segments", () => {
    expect(splitExampleSources("")).toEqual([]);
    expect(splitExampleSources("   \n\t ")).toEqual([]);
  });

  test("examplesHtmlToMarkdown is unchanged for one div plus prose, language class included", () => {
    const html = `Query a position:<br>${block("go.get(&quot;x&quot;)")}`;
    expect(examplesHtmlToMarkdown(html)).toBe('Query a position:\n\n```lua\ngo.get("x")\n```');
    const json = `<div class="codehilite"><pre><code class="language-json">{ &quot;a&quot;: 1 }</code></pre></div>`;
    expect(examplesHtmlToMarkdown(json)).toBe('```json\n{ "a": 1 }\n```');
  });
});

describe("segmentExampleRegions", () => {
  const inner = "<pre><code>go.get(&quot;x&quot;)</code></pre>";
  const div = (markup: string) => `<div class="codehilite">${markup}</div>`;
  const block = (code: string) => div(`<pre><code>${code}</code></pre>`);

  test("a one-div fragment segments to the div's own text; splitExampleSources keeps the whole blob", () => {
    const html = `Query a position:<br>${div(inner)}`;
    const { segments } = segmentExampleRegions(html);
    expect(segments).toHaveLength(1);
    expect(segments[0]?.code).toBe(htmlToCodeText(inner));
    expect(segments[0]?.code).not.toBe(htmlToCodeText(html));
    expect(segments[0]?.prose).toBe("Query a position:");

    const stored = splitExampleSources(html);
    expect(stored).toHaveLength(1);
    expect(stored[0]?.code).toBe(htmlToCodeText(html));
  });

  test("both functions agree once the walk yields more than one segment", () => {
    const html = block("local a = 1\n```lua\nlocal b = 2");
    const { segments } = segmentExampleRegions(html);
    expect(segments).toHaveLength(2);
    expect(segments).toEqual(splitExampleSources(html));
  });

  test("prose after the last code run is returned as the trailing remainder", () => {
    const { segments, trailingProse } = segmentExampleRegions(
      `${block("local a = 1")}Afterwards, reload the script.`,
    );
    expect(segments).toHaveLength(1);
    expect(trailingProse).toBe("Afterwards, reload the script.");
  });

  test("empty / whitespace-only input yields no segments and no trailing prose", () => {
    expect(segmentExampleRegions("")).toEqual({ segments: [], trailingProse: "" });
    expect(segmentExampleRegions("   \n\t ")).toEqual({ segments: [], trailingProse: "" });
  });
});

/** Every line of `markdown` that sits strictly inside a fenced block. */
function interiorLines(markdown: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (const line of markdown.split("\n")) {
    if (!inBlock) {
      if (line.startsWith("```")) inBlock = true;
      continue;
    }
    if (line.trim() === "```") {
      inBlock = false;
      continue;
    }
    out.push(line);
  }
  return out;
}

describe("examplesHtmlToMarkdown fence segmentation", () => {
  const block = (inner: string) => `<div class="codehilite"><pre><code>${inner}</code></pre></div>`;

  test("an upstream fence welded into one div renders as two blocks with the heading between", () => {
    const html = block(
      "local a = 1\n```Update a texture from a buffer resource\n```lua\nlocal b = 2",
    );
    expect(examplesHtmlToMarkdown(html)).toBe(
      "```lua\nlocal a = 1\n```\n\nUpdate a texture from a buffer resource\n\n```lua\nlocal b = 2\n```",
    );
  });

  test("no line interior to a rendered block carries a fence marker", () => {
    const html = block("local a = 1\n```lua\nlocal b = 2");
    for (const line of interiorLines(examplesHtmlToMarkdown(html))) {
      expect(line.trimStart().startsWith("```")).toBe(false);
    }
  });

  test("one-div renders are byte-identical with and without leading prose", () => {
    expect(examplesHtmlToMarkdown(`Query a position:<br>${block("go.get(&quot;x&quot;)")}`)).toBe(
      'Query a position:\n\n```lua\ngo.get("x")\n```',
    );
    expect(examplesHtmlToMarkdown(block("local solo = 1"))).toBe("```lua\nlocal solo = 1\n```");
  });

  test("prose following the last code block is still rendered", () => {
    expect(examplesHtmlToMarkdown(`${block("local a = 1")}See the manual.`)).toBe(
      "```lua\nlocal a = 1\n```\n\nSee the manual.",
    );
  });

  test("a blob that is entirely prose survives as a single lua fence", () => {
    expect(examplesHtmlToMarkdown("No code here, just words.")).toBe(
      "```lua\nNo code here, just words.\n```",
    );
  });
});
