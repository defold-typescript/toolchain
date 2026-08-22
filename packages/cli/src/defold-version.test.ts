import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { parseApiTargetsRegistry, type RegistryTarget } from "./api-registry";
import {
  CURRENT_STABLE_DEFOLD_VERSION,
  DEFOLD_VERSIONS,
  PREVIOUS_STABLE_DEFOLD_VERSION,
} from "./defold-version";

// The ref-doc-sourced entries are imported surfaces, not releases the pre-baked
// tuple promotes, so every assertion about the tuple's relationship to the
// registry reads the `source === null` side of it.
function committedTargets(): RegistryTarget[] {
  const registryPath = path.resolve(import.meta.dir, "../../types/api-targets.json");
  return parseApiTargetsRegistry(readFileSync(registryPath, "utf8")).filter(
    (target) => (target.source ?? null) === null,
  );
}

describe("DEFOLD_VERSIONS single source", () => {
  test("element 0 is the current stable and element 1 the previous stable", () => {
    expect(DEFOLD_VERSIONS[0]).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(DEFOLD_VERSIONS[1]).toBe(PREVIOUS_STABLE_DEFOLD_VERSION);
  });

  // The tuple is the pre-baked promotion set, not the whole registry: retention
  // drops intermediate patches from it while their targets stay committed. What
  // must hold is coverage — a version the pin reader offers with no surface
  // behind it is the failure this catches.
  test("every pre-baked entry has a committed target in api-targets.json", () => {
    const ids = new Set(committedTargets().map((target) => target.id));
    const uncovered = DEFOLD_VERSIONS.filter((version) => !ids.has(`defold-${version}`));
    expect(uncovered).toEqual([]);
  });

  test("only the tuple head is the registry default", () => {
    const defaults = committedTargets()
      .filter((target) => target.default === true)
      .map((target) => target.id);
    expect(defaults).toEqual([`defold-${CURRENT_STABLE_DEFOLD_VERSION}`]);
  });

  // Everything the tuple head was promoted over — whether still pre-baked or
  // already outside the pre-baked tuple — is a demoted historical surface, so it
  // is non-default and lives under its own `generated/versions/` directory.
  test("every committed target below the head, including any outside the pre-baked tuple, is a demoted historical surface", () => {
    const demoted = committedTargets().filter(
      (target) => target.id !== `defold-${CURRENT_STABLE_DEFOLD_VERSION}`,
    );
    expect(demoted.length).toBeGreaterThan(0);
    for (const target of demoted) {
      expect(target.default === true).toBe(false);
      expect(target.generatedDir).toBe(`generated/versions/${target.id}`);
    }
  });

  test("the tuple is duplicate-free and follows the committed registry order", () => {
    expect(new Set(DEFOLD_VERSIONS).size).toBe(DEFOLD_VERSIONS.length);
    const registryOrder = committedTargets().map((target) => target.id);
    const positions = DEFOLD_VERSIONS.map((version) => registryOrder.indexOf(`defold-${version}`));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
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
