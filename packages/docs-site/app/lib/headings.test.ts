import { describe, expect, test } from "bun:test";
import { pageHeadings, slugify } from "./headings";

describe("slugify", () => {
  test("keeps underscores so on_message-style ids match GitHub", () => {
    expect(slugify("`on_message` ids are hashes, not strings")).toBe(
      "on_message-ids-are-hashes-not-strings",
    );
  });

  test("emits one hyphen per space with no collapse, so a stripped `/` leaves a double hyphen", () => {
    expect(slugify("Unary minus on Vector3 / Vector4 silently produces `number`")).toBe(
      "unary-minus-on-vector3--vector4-silently-produces-number",
    );
  });

  test("leaves a slug without `_` or `/` stable (regression guard)", () => {
    expect(slugify("`as` is a compile-time assertion, not a runtime check")).toBe(
      "as-is-a-compile-time-assertion-not-a-runtime-check",
    );
  });
});

describe("pageHeadings", () => {
  test("decodes hex entities Shiki emits for inline-highlighted signature text", () => {
    const headings = pageHeadings('<h3 id="x">Opaque&#x3C;"node"&#x3E;</h3>');
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe('Opaque<"node">');
  });

  test("decodes decimal entities", () => {
    const headings = pageHeadings("<h3>a &#60; b &#62; c</h3>");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe("a < b > c");
  });

  test("decodes named entities (and decodes &amp; last so it never double-decodes)", () => {
    const headings = pageHeadings("<h3>a &lt; b &gt; c &amp; d &quot;e&quot; &#39;f&#39;</h3>");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe(`a < b > c & d "e" 'f'`);
  });

  test("strips tags, decodes entities, and preserves the explicit heading id", () => {
    const html =
      '<h3 id="gui-get_node"><a href="#gui-get_node"><span>gui.get_node(id: string | Hash): Opaque&#x3C;"node"&#x3E;</span></a></h3>';
    const headings = pageHeadings(html);
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe('gui.get_node(id: string | Hash): Opaque<"node">');
    expect(headings[0]?.id).toBe("gui-get_node");
  });

  test("decodes &amp; exactly once across a heading full of encoded entities", () => {
    const headings = pageHeadings("<h3>Record&#x3C;string, any&#x3E; &amp; Foo</h3>");
    expect(headings).toHaveLength(1);
    expect(headings[0]?.text).toBe("Record<string, any> & Foo");
  });
});
