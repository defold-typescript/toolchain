import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  CURRENT_STABLE_DEFOLD_VERSION,
  DEFOLD_VERSIONS,
  PREVIOUS_STABLE_DEFOLD_VERSION,
} from "./defold-version";

describe("DEFOLD_VERSIONS single source", () => {
  test("element 0 is the current stable and element 1 the previous stable", () => {
    expect(DEFOLD_VERSIONS[0]).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(DEFOLD_VERSIONS[1]).toBe(PREVIOUS_STABLE_DEFOLD_VERSION);
  });

  test("equals the concrete surfaces/fixtures depend on", () => {
    expect(DEFOLD_VERSIONS).toEqual([
      CURRENT_STABLE_DEFOLD_VERSION,
      PREVIOUS_STABLE_DEFOLD_VERSION,
    ]);
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
