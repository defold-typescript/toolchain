import { describe, expect, test } from "bun:test";
import { parseApiTargetsRegistry } from "./api-registry";

describe("parseApiTargetsRegistry", () => {
  test("returns the entries of a well-formed document", () => {
    const text = JSON.stringify({
      targets: [{ id: "defold-1.13.1", default: true }, { id: "defold-1.12.4" }],
    });

    expect(parseApiTargetsRegistry(text).map((entry) => entry.id)).toEqual([
      "defold-1.13.1",
      "defold-1.12.4",
    ]);
  });

  test("returns [] for a document with no targets key", () => {
    expect(parseApiTargetsRegistry("{}")).toEqual([]);
  });

  test("returns [] when targets is not an array", () => {
    expect(parseApiTargetsRegistry(JSON.stringify({ targets: { "defold-1.13.1": {} } }))).toEqual(
      [],
    );
    expect(parseApiTargetsRegistry(JSON.stringify({ targets: null }))).toEqual([]);
  });

  test("returns [] for unparseable text", () => {
    expect(parseApiTargetsRegistry("not json")).toEqual([]);
    expect(parseApiTargetsRegistry("")).toEqual([]);
  });
});
