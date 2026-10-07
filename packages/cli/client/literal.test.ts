import { describe, expect, test } from "bun:test";
import { parseLiteral } from "./literal";

function refusal(text: string): string {
  try {
    parseLiteral(text);
  } catch (thrown) {
    expect(thrown).toBeInstanceOf(SyntaxError);
    return (thrown as SyntaxError).message;
  }
  throw new Error("the text was read");
}

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

  test("names the column of a mistake in a one-line value", () => {
    expect(refusal("{enter: }")).toBe("expected a value at column 9");
    expect(refusal("{a: 1} x")).toBe("unexpected text at column 8");
  });

  test("names the line of a mistake in a multi-line value, and the column in that line", () => {
    expect(refusal("{\n  a: \n}")).toBe("expected a value at line 3, column 1");
    expect(refusal("{\n  a: 1,\n  b: yes\n}")).toBe("expected a value at line 3, column 6");
    expect(refusal("{ a: 1 }\nx")).toBe("unexpected text at line 2, column 1");
  });
});
