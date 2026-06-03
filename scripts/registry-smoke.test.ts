import { describe, expect, test } from "bun:test";
import { checkScaffoldedTypesPin } from "./registry-smoke.ts";

describe("checkScaffoldedTypesPin", () => {
  test("accepts a pin matching the installed version", () => {
    const result = checkScaffoldedTypesPin(
      { devDependencies: { "@defold-typescript/types": "^0.3.0" } },
      "0.3.0",
    );
    expect(result.ok).toBe(true);
  });

  test("rejects a stale pin and names both the found and expected spec", () => {
    const result = checkScaffoldedTypesPin(
      { devDependencies: { "@defold-typescript/types": "^0.2.0" } },
      "0.3.0",
    );
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("^0.2.0");
    expect(result.detail).toContain("^0.3.0");
  });

  test("rejects a manifest missing the types devDep", () => {
    const result = checkScaffoldedTypesPin({ devDependencies: {} }, "0.3.0");
    expect(result.ok).toBe(false);
    expect(result.detail.toLowerCase()).toContain("absent");
  });

  test("rejects the (unknown) installed-version fallback", () => {
    const result = checkScaffoldedTypesPin(
      { devDependencies: { "@defold-typescript/types": "^(unknown)" } },
      "(unknown)",
    );
    expect(result.ok).toBe(false);
  });
});
