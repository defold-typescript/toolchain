import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  CURRENT_STABLE_DEFOLD_VERSION,
  DEFOLD_VERSIONS,
  PREVIOUS_STABLE_DEFOLD_VERSION,
} from "./defold-version";

interface RegistryTarget {
  readonly id: string;
  readonly default?: boolean;
  readonly source?: unknown;
}

function committedTargets(): RegistryTarget[] {
  const registryPath = path.resolve(import.meta.dir, "../../types/api-targets.json");
  const raw = JSON.parse(readFileSync(registryPath, "utf8")) as { targets?: RegistryTarget[] };
  return (raw.targets ?? []).filter((target) => (target.source ?? null) === null);
}

describe("DEFOLD_VERSIONS single source", () => {
  test("element 0 is the current stable and element 1 the previous stable", () => {
    expect(DEFOLD_VERSIONS[0]).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(DEFOLD_VERSIONS[1]).toBe(PREVIOUS_STABLE_DEFOLD_VERSION);
  });

  // The tuple and the committed side of the types registry are one fact stored
  // twice; a bump or a restore that moves only one of them leaves a version the
  // pin reader offers but no surface backs (or a surface nothing can select).
  test("corresponds one-to-one with the committed targets in api-targets.json", () => {
    const committed = committedTargets();
    expect(committed.map((target) => target.id)).toEqual(
      DEFOLD_VERSIONS.map((version) => `defold-${version}`),
    );
  });

  test("only the tuple head is the registry default", () => {
    const defaults = committedTargets()
      .filter((target) => target.default === true)
      .map((target) => target.id);
    expect(defaults).toEqual([`defold-${CURRENT_STABLE_DEFOLD_VERSION}`]);
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
