import { describe, expect, it } from "bun:test";
import { isSelfReference, normalizeSymbolKey } from "./symbol-self";

describe("normalizeSymbolKey", () => {
  it("drops the argument list", () => {
    expect(normalizeSymbolKey("math.random(m, n)")).toBe("math.random");
  });

  it("drops a return-type suffix after the args", () => {
    expect(normalizeSymbolKey("math.random(m: number): number")).toBe("math.random");
  });

  it("leaves a call-free key untouched", () => {
    expect(normalizeSymbolKey("package.cpath")).toBe("package.cpath");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeSymbolKey("  go.get_position  ")).toBe("go.get_position");
  });
});

describe("isSelfReference", () => {
  it("flags a mention of the symbol whose own signature it sits under", () => {
    expect(isSelfReference("math.random", "math.random(m, n)")).toBe(true);
  });

  it("flags a self-mention written with its own call syntax", () => {
    expect(isSelfReference("math.random(m)", "math.random(m, n)")).toBe(true);
  });

  it("does not flag a different symbol that shares a prefix", () => {
    expect(isSelfReference("math.random", "math.randomseed(seed)")).toBe(false);
  });

  it("does not flag a same-page sibling (package.path inside package.cpath)", () => {
    expect(isSelfReference("package.path", "package.cpath")).toBe(false);
  });

  it("is false when there is no owning signature", () => {
    expect(isSelfReference("math.random", "")).toBe(false);
  });
});
