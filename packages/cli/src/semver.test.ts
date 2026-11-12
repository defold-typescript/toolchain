import { describe, expect, test } from "bun:test";
import { compareSemver } from "./semver";

describe("compareSemver", () => {
  test("orders segments numerically, not lexicographically", () => {
    expect(compareSemver("1.9.0", "1.10.0")).toBeLessThan(0);
    expect(compareSemver("1.10.0", "1.9.0")).toBeGreaterThan(0);
    expect(compareSemver("0.0.0", "0.0.1")).toBeLessThan(0);
    expect(compareSemver("2.0.0", "1.999.999")).toBeGreaterThan(0);
  });

  test("treats equal versions as equal", () => {
    expect(compareSemver("1.3.0", "1.3.0")).toBe(0);
  });

  test("orders a prerelease below its release without throwing", () => {
    expect(compareSemver("1.3.0-beta.1", "1.3.0")).toBeLessThan(0);
    expect(compareSemver("1.3.0", "1.3.0-beta.1")).toBeGreaterThan(0);
    expect(compareSemver("1.3.0-beta.1", "1.3.0-beta.2")).toBeLessThan(0);
    expect(compareSemver("1.3.0-beta.1", "1.3.0-beta.1")).toBe(0);
  });

  test("a prerelease still sorts below a higher release", () => {
    expect(compareSemver("1.3.0-beta.1", "1.4.0")).toBeLessThan(0);
  });

  test("digit-led identifiers are alphanumeric, so distinct ones never compare equal", () => {
    expect(compareSemver("1.3.0-1alpha", "1.3.0-1beta")).toBeLessThan(0);
    expect(compareSemver("1.3.0-1beta", "1.3.0-1alpha")).toBeGreaterThan(0);
  });

  test("a numeric identifier ranks below an alphanumeric one, digit-led or not", () => {
    expect(compareSemver("1.3.0-2", "1.3.0-1alpha")).toBeLessThan(0);
    expect(compareSemver("1.3.0-1alpha", "1.3.0-2")).toBeGreaterThan(0);
    expect(compareSemver("1.3.0-1", "1.3.0-alpha")).toBeLessThan(0);
  });

  test("numeric identifiers compare as numbers, not text", () => {
    expect(compareSemver("1.3.0-beta.9", "1.3.0-beta.10")).toBeLessThan(0);
  });

  test("numeric identifiers past the safe-integer range compare by exact value", () => {
    expect(compareSemver("1.3.0-9007199254740992", "1.3.0-9007199254740993")).toBeLessThan(0);
    expect(compareSemver("1.3.0-9007199254740993", "1.3.0-9007199254740992")).toBeGreaterThan(0);
    expect(
      compareSemver("1.3.0-beta.99999999999999999", "1.3.0-beta.100000000000000000"),
    ).toBeLessThan(0);
    expect(
      compareSemver("1.3.0-beta.100000000000000000", "1.3.0-beta.99999999999999999"),
    ).toBeGreaterThan(0);
  });
});
