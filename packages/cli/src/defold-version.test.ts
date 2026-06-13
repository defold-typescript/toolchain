import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  CURRENT_STABLE_DEFOLD_VERSION,
  readDefoldVersionPin,
  resolveDefoldVersion,
} from "./defold-version";

describe("resolveDefoldVersion", () => {
  test("flag wins over pin and default", () => {
    expect(resolveDefoldVersion({ flag: "1.10.0", pin: "1.9.8" })).toEqual({
      version: "1.10.0",
      source: "flag",
    });
  });

  test("pin wins when no flag", () => {
    expect(resolveDefoldVersion({ pin: "1.9.8" })).toEqual({
      version: "1.9.8",
      source: "pin",
    });
  });

  test("default when neither flag nor pin", () => {
    expect(resolveDefoldVersion({})).toEqual({
      version: CURRENT_STABLE_DEFOLD_VERSION,
      source: "default",
    });
  });

  test("detected wins over default but loses to pin", () => {
    expect(resolveDefoldVersion({ detected: "1.9.8" })).toEqual({
      version: "1.9.8",
      source: "detected",
    });
    expect(resolveDefoldVersion({ pin: "1.10.0", detected: "1.9.8" })).toEqual({
      version: "1.10.0",
      source: "pin",
    });
  });

  test("flag still wins over detected", () => {
    expect(resolveDefoldVersion({ flag: "1.11.0", detected: "1.9.8" })).toEqual({
      version: "1.11.0",
      source: "flag",
    });
  });
});

describe("readDefoldVersionPin", () => {
  test("returns the pinned version for a well-formed package.json", () => {
    expect(readDefoldVersionPin({ "defold-typescript": { "defold-version": "1.9.8" } })).toBe(
      "1.9.8",
    );
  });

  test("returns undefined for a missing version key", () => {
    expect(readDefoldVersionPin({ "defold-typescript": {} })).toBeUndefined();
  });

  test("returns undefined for a missing namespace", () => {
    expect(readDefoldVersionPin({ name: "x" })).toBeUndefined();
  });

  test("returns undefined for a non-object namespace", () => {
    expect(readDefoldVersionPin({ "defold-typescript": "1.9.8" })).toBeUndefined();
  });

  test("returns undefined for a non-string version value", () => {
    expect(
      readDefoldVersionPin({ "defold-typescript": { "defold-version": 198 } }),
    ).toBeUndefined();
  });

  test("returns undefined for a non-object input", () => {
    expect(readDefoldVersionPin(null)).toBeUndefined();
    expect(readDefoldVersionPin("nope")).toBeUndefined();
    expect(readDefoldVersionPin(undefined)).toBeUndefined();
  });
});

describe("drift guard", () => {
  test("CURRENT_STABLE_DEFOLD_VERSION equals DEFOLD_VERSION in sync-api-docs.ts", () => {
    const syncPath = path.resolve(import.meta.dir, "../../types/scripts/sync-api-docs.ts");
    const source = readFileSync(syncPath, "utf8");
    const match = source.match(/export const DEFOLD_VERSION = "([^"]+)";/);
    expect(match?.[1]).toBe(CURRENT_STABLE_DEFOLD_VERSION);
  });
});
