import { describe, expect, test } from "bun:test";
import type { Nodes, PhrasingContent } from "mdast";
import { parseMarkdownFragment } from "./docs-markdown";
import { linkSymbolMentions, symbolLinkifier } from "./symbol-linkify";

const textOf = (node: Nodes): string =>
  "value" in node ? node.value : "children" in node ? node.children.map(textOf).join("") : "";

// Each node as `[text]`, or `[text, href]` for a symbol link.
const shape = (nodes: PhrasingContent[]): [string, string?][] =>
  nodes.map((node) => (node.type === "link" ? [textOf(node), node.url] : [textOf(node)]));

// Every symbol link in a parsed fragment, as `[text, href]`.
function linksIn(markdown: string, links: Map<string, string>): [string, string][] {
  const found: [string, string][] = [];
  const walk = (node: Nodes): void => {
    if (node.type === "link") found.push([textOf(node), node.url]);
    if ("children" in node) for (const child of node.children) walk(child);
  };
  for (const node of linkSymbolMentions(parseMarkdownFragment(markdown), symbolLinkifier(links))) {
    walk(node);
  }
  return found;
}

const SET = new Map([["go.set_position", "/api/go#gogetposition"]]);

describe("symbolLinkifier", () => {
  test("longest match wins: links go.set_position, leaves the bare 'go' substring inside the longer key alone", () => {
    expect(shape(symbolLinkifier(SET)("use go.set_position to move it"))).toEqual([
      ["use "],
      ["go.set_position", "/api/go#gogetposition"],
      [" to move it"],
    ]);
  });

  test("word boundary rejects the suffix: go.set_position_something is not linkified", () => {
    expect(shape(symbolLinkifier(SET)("go.set_position_something"))).toEqual([
      ["go.set_position_something"],
    ]);
  });

  test("links multiple mentions with distinct hrefs when the routes differ", () => {
    const links = new Map([
      ["go.set_position", "/api/go#gogetposition"],
      ["go.get_position", "/api/world#gogetworldposition"],
    ]);
    expect(shape(symbolLinkifier(links)("go.set_position and go.get_position"))).toEqual([
      ["go.set_position", "/api/go#gogetposition"],
      [" and "],
      ["go.get_position", "/api/world#gogetworldposition"],
    ]);
  });

  test("returns the text as one text node when the registry is empty", () => {
    expect(shape(symbolLinkifier(new Map())("use go.set_position first"))).toEqual([
      ["use go.set_position first"],
    ]);
  });

  test("returns the text as one text node when no registered key appears in it", () => {
    expect(shape(symbolLinkifier(SET)("plain prose with no symbol mentions"))).toEqual([
      ["plain prose with no symbol mentions"],
    ]);
  });

  test("ignores bare-namespace keys (no `.`): a `go` mention is not linkified even with a route", () => {
    const links = new Map([["go", "/api/go"], ...SET]);
    expect(shape(symbolLinkifier(links)("see the go module for go.set_position"))).toEqual([
      ["see the go module for "],
      ["go.set_position", "/api/go#gogetposition"],
    ]);
  });

  test("ignores bare-global keys (no `.`): a `hash` mention is not linkified", () => {
    const links = new Map([["hash", "/api/globals#hash"]]);
    expect(shape(symbolLinkifier(links)('use hash("foo")'))).toEqual([['use hash("foo")']]);
  });

  test("the link carries class=symbol-xref so the symbol tooltips can bind to it, and a root-absolute href", () => {
    const [, link] = symbolLinkifier(new Map([["go.set_position", "/api/go"]]))(
      "use go.set_position",
    );
    expect(link?.type).toBe("link");
    expect(link?.type === "link" && link.url).toBe("/api/go");
    expect(link?.data?.hProperties?.className).toEqual(["symbol-xref"]);
  });
});

describe("linkSymbolMentions", () => {
  test("leaves a code span alone and links the prose around it", () => {
    expect(linksIn("call `go.set_position` first", SET)).toEqual([]);
    expect(linksIn("see `go.set_position` or go.set_position", SET)).toEqual([
      ["go.set_position", "/api/go#gogetposition"],
    ]);
  });

  test("leaves a fenced code block verbatim and links the prose after it", () => {
    const markdown =
      "Sample:\n\n```lua\ngo.set_position(p) -- `go.set_position`\n```\n\nsee go.set_position";
    expect(linksIn(markdown, SET)).toEqual([["go.set_position", "/api/go#gogetposition"]]);
  });

  test("keeps the surrounding Markdown and links a mention inside emphasis", () => {
    expect(linksIn("*emphasized go.set_position* and go.set_position", SET)).toEqual([
      ["go.set_position", "/api/go#gogetposition"],
      ["go.set_position", "/api/go#gogetposition"],
    ]);
  });

  test("leaves a mention inside a link label or a heading as text", () => {
    expect(linksIn("[go.set_position](https://defold.com)", SET)).toEqual([
      ["go.set_position", "https://defold.com"],
    ]);
    expect(linksIn("## go.set_position", SET)).toEqual([]);
  });
});
