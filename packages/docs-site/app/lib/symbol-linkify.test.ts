import { describe, expect, test } from "bun:test";
import { linkifySymbolMentions } from "./symbol-linkify";

describe("linkifySymbolMentions", () => {
  test("longest match wins: links go.set_position, leaves the bare 'go' substring inside the longer key alone", () => {
    const links = new Map([["go.set_position", "/api/go#gogetposition"]]);
    const out = linkifySymbolMentions("use go.set_position to move it", links);
    expect(out).toBe(
      'use <a href="/api/go#gogetposition" class="symbol-xref">go.set_position</a> to move it',
    );
  });

  test("word boundary rejects the suffix: go.set_position_something is not linkified", () => {
    const links = new Map([["go.set_position", "/api/go#gogetposition"]]);
    expect(linkifySymbolMentions("go.set_position_something", links)).toBe(
      "go.set_position_something",
    );
  });

  test("leaves a backtick-fenced mention alone (heuristic code-span skip)", () => {
    const links = new Map([["go.set_position", "/api/go#gogetposition"]]);
    const out = linkifySymbolMentions("call `go.set_position` first", links);
    expect(out).toBe("call `go.set_position` first");
  });

  test("links multiple mentions with distinct hrefs when the routes differ", () => {
    const links = new Map([
      ["go.set_position", "/api/go#gogetposition"],
      ["go.get_position", "/api/world#gogetworldposition"],
    ]);
    const out = linkifySymbolMentions("go.set_position and go.get_position", links);
    expect(out).toBe(
      '<a href="/api/go#gogetposition" class="symbol-xref">go.set_position</a> and ' +
        '<a href="/api/world#gogetworldposition" class="symbol-xref">go.get_position</a>',
    );
  });

  test("returns the input byte-identical when the registry is empty", () => {
    const out = linkifySymbolMentions("use go.set_position first", new Map());
    expect(out).toBe("use go.set_position first");
  });

  test("returns the input unchanged when no registered key appears in the text", () => {
    const links = new Map([["go.set_position", "/api/go#gogetposition"]]);
    const out = linkifySymbolMentions("plain prose with no symbol mentions", links);
    expect(out).toBe("plain prose with no symbol mentions");
  });

  test("preserves surrounding markdown syntax and rewrites only the bare mention", () => {
    const links = new Map([["go.set_position", "/api/go#gogetposition"]]);
    expect(linkifySymbolMentions("*emphasized* go.set_position", links)).toBe(
      '*emphasized* <a href="/api/go#gogetposition" class="symbol-xref">go.set_position</a>',
    );
    expect(linkifySymbolMentions("see `go.set_position` in code", links)).toBe(
      "see `go.set_position` in code",
    );
  });

  test("ignores bare-namespace keys (no `.`): a `go` mention is not linkified even with a route", () => {
    const links = new Map([
      ["go", "/api/go"],
      ["go.set_position", "/api/go#gogetposition"],
    ]);
    const out = linkifySymbolMentions("see the go module for go.set_position", links);
    expect(out).toBe(
      'see the go module for <a href="/api/go#gogetposition" class="symbol-xref">go.set_position</a>',
    );
  });

  test("ignores bare-global keys (no `.`): a `hash` mention is not linkified", () => {
    const links = new Map([["hash", "/api/globals#hash"]]);
    const out = linkifySymbolMentions('use hash("foo")', links);
    expect(out).toBe('use hash("foo")');
  });

  test("the rewritten link carries class=symbol-xref so the island can bind to it", () => {
    const links = new Map([["go.set_position", "/api/go"]]);
    const out = linkifySymbolMentions("use go.set_position", links);
    expect(out).toBe('use <a href="/api/go" class="symbol-xref">go.set_position</a>');
  });
});
