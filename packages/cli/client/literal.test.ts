import { describe, expect, test } from "bun:test";
import { parseLiteral } from "./literal";

describe("parseLiteral", () => {
  test("reads JSON as JSON.parse does", () => {
    const text = '{ "a": [1, -2.5e3, null, true], "b": { "c": "d\\n\\u0041" } }';
    expect(parseLiteral(text)).toEqual(JSON.parse(text));
  });

  test("reads bare keys", () => {
    expect(parseLiteral("{enter: true}")).toEqual({ enter: true });
    expect(parseLiteral("{ other_id: 1, $n: { _deep9: [ { k: null } ] } }")).toEqual({
      other_id: 1,
      $n: { _deep9: [{ k: null }] },
    });
  });

  test("reads single-quoted strings and keys", () => {
    expect(parseLiteral(`{ 'a b': 'it\\'s "x"', c: 'line\\nbreak' }`)).toEqual({
      "a b": 'it\'s "x"',
      c: "line\nbreak",
    });
  });

  test("drops a trailing comma", () => {
    expect(parseLiteral("{ a: [1, 2,], b: 3, }")).toEqual({ a: [1, 2], b: 3 });
  });

  test("leaves the text of a string alone", () => {
    expect(parseLiteral(`{ "a": "{k: 'v',}", b: 'x: ,]' }`)).toEqual({
      a: "{k: 'v',}",
      b: "x: ,]",
    });
  });

  test("throws on what is neither", () => {
    expect(() => parseLiteral("{enter: }")).toThrow();
    expect(() => parseLiteral("{enter: yes}")).toThrow();
    expect(() => parseLiteral("{enter true}")).toThrow();
    expect(() => parseLiteral("{a: 'open}")).toThrow();
  });
});
