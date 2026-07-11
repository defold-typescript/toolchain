import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";

describe("drift guard", () => {
  test("CURRENT_STABLE_DEFOLD_VERSION equals DEFOLD_VERSION in sync-api-docs.ts", () => {
    const syncPath = path.resolve(import.meta.dir, "../../types/scripts/sync-api-docs.ts");
    const source = readFileSync(syncPath, "utf8");
    const match = source.match(/export const DEFOLD_VERSION = "([^"]+)";/);
    expect(match?.[1]).toBe(CURRENT_STABLE_DEFOLD_VERSION);
  });
});
