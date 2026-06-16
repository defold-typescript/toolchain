import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDefoldApiDoc } from "../src/api-doc";
import { EXTENSION_MANIFEST, SYNC_MANIFEST } from "./sync-api-docs";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");

// Namespaces whose upstream doc genuinely exposes no function/constant/property/
// variable/typedef surface (message-driven components typed via builtin-messages).
// Each entry carries a one-line sourced reason so a stub can never be allowlisted
// silently. Adding a namespace here is a deliberate, reviewed act.
const EMPTY_BY_UPSTREAM: ReadonlyMap<string, string> = new Map();

function elementCount(fixture: string): number {
  const path = resolve(PACKAGE_ROOT, fixture);
  const module = parseDefoldApiDoc(JSON.parse(readFileSync(path, "utf8")));
  return (
    module.functions.length +
    module.variables.length +
    module.constants.length +
    module.properties.length +
    module.typedefs.length
  );
}

describe("fixture completeness", () => {
  test("EMPTY_BY_UPSTREAM is a ReadonlyMap of namespace -> sourced reason", () => {
    expect(EMPTY_BY_UPSTREAM).toBeInstanceOf(Map);
    for (const [namespace, reason] of EMPTY_BY_UPSTREAM) {
      expect(namespace.length).toBeGreaterThan(0);
      expect(reason.length).toBeGreaterThan(0);
    }
  });

  for (const entry of [...SYNC_MANIFEST, ...EXTENSION_MANIFEST]) {
    const allowlisted = EMPTY_BY_UPSTREAM.has(entry.namespace);
    test(`${entry.namespace} fixture parses to at least one element`, () => {
      const count = elementCount(entry.fixture);
      if (allowlisted) {
        expect(count).toBe(0);
      } else {
        expect(count).toBeGreaterThan(0);
      }
    });
  }
});
