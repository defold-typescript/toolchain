import { describe, expect, test } from "bun:test";
import { linkifySymbolMentions } from "./symbol-linkify";

describe("linkifySymbolMentions", () => {
  test("longest match wins: links go.set_position, leaves the bare 'go' substring inside the longer key alone", () => {
    const links = new Map([
      ["go", "/api/go"],
      ["go.set_position", "/api/go"],
    ]);
    const out = linkifySymbolMentions("use go.set_position to move it", links);
    expect(out).toContain('<a href="/api/go">go.set_position</a>');
    expect(out).not.toContain('<a href="/api/go">go</a>');
    expect(out.match(/<a /g)?.length).toBe(1);
    expect(out).toBe('use <a href="/api/go">go.set_position</a> to move it');
  });

  test("word boundary rejects the suffix: go.set_position_something is not linkified", () => {
    const links = new Map([
      ["go", "/api/go"],
      ["go.set_position", "/api/go"],
    ]);
    expect(linkifySymbolMentions("go.set_position_something", links)).toBe(
      "go.set_position_something",
    );
  });

  test("links a bare global mention followed by a non-word character", () => {
    const links = new Map([["hash", "/api/globals"]]);
    const out = linkifySymbolMentions('use hash("foo")', links);
    expect(out).toContain('<a href="/api/globals">hash</a>');
    expect(out).toBe('use <a href="/api/globals">hash</a>("foo")');
  });

  test("links a bare namespace mention", () => {
    const links = new Map([["go", "/api/go"]]);
    const out = linkifySymbolMentions("see the go module", links);
    expect(out).toContain('<a href="/api/go">go</a>');
    expect(out).toBe('see the <a href="/api/go">go</a> module');
  });

  test("leaves a backtick-fenced mention alone (heuristic code-span skip)", () => {
    const links = new Map([
      ["go", "/api/go"],
      ["go.set_position", "/api/go"],
    ]);
    const out = linkifySymbolMentions("call `go.set_position` first", links);
    expect(out).not.toContain("<a");
    expect(out).toBe("call `go.set_position` first");
  });

  test("links multiple mentions with distinct hrefs when the routes differ", () => {
    const links = new Map([
      ["go", "/api/go"],
      ["go.set_position", "/api/go"],
      ["go.get_position", "/api/world"],
    ]);
    const out = linkifySymbolMentions("go.set_position and go.get_position", links);
    expect(out).toContain('<a href="/api/go">go.set_position</a>');
    expect(out).toContain('<a href="/api/world">go.get_position</a>');
    expect(out).toBe(
      '<a href="/api/go">go.set_position</a> and <a href="/api/world">go.get_position</a>',
    );
  });

  test("returns the input byte-identical when the registry is empty", () => {
    const out = linkifySymbolMentions("use go.set_position first", new Map());
    expect(out).toBe("use go.set_position first");
  });

  test("returns the input unchanged when no registered key appears in the text", () => {
    const links = new Map([
      ["go", "/api/go"],
      ["go.set_position", "/api/go"],
    ]);
    const out = linkifySymbolMentions("plain prose with no symbol mentions", links);
    expect(out).toBe("plain prose with no symbol mentions");
  });

  test("preserves surrounding markdown syntax and rewrites only the bare mention", () => {
    const links = new Map([
      ["go", "/api/go"],
      ["go.set_position", "/api/go"],
    ]);
    expect(linkifySymbolMentions("*emphasized* go.set_position", links)).toBe(
      '*emphasized* <a href="/api/go">go.set_position</a>',
    );
    expect(linkifySymbolMentions("see `go.set_position` in code", links)).toBe(
      "see `go.set_position` in code",
    );
  });
});
