import { describe, expect, test } from "bun:test";
import { isSymbolOnCurrentPage } from "./symbol-target";

describe("isSymbolOnCurrentPage", () => {
  test("strips the anchor and matches the same page", () => {
    expect(isSymbolOnCurrentPage("/api/go#go-get-position", "/api/go")).toBe(true);
  });

  test("normalizes a trailing slash on the current path", () => {
    expect(isSymbolOnCurrentPage("/api/go", "/api/go/")).toBe(true);
  });

  test("different namespace is not the current page", () => {
    expect(isSymbolOnCurrentPage("/api/msg#msg-post", "/api/go")).toBe(false);
  });

  test("a guide page keeps the popup for an api symbol", () => {
    expect(isSymbolOnCurrentPage("/api/go", "/guide/vector-math")).toBe(false);
  });
});
