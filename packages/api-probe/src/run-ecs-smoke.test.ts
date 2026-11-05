import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AVAILABILITY_JSON, readSupportedVersions } from "../../../scripts/sync-readme";
import { smokeVersions } from "./run-ecs-smoke";
import { engineHead } from "./run-probe";
import { probeTarget } from "./witness";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");
const SUPPORTED = readSupportedVersions(
  readFileSync(resolve(REPO_ROOT, AVAILABILITY_JSON), "utf8"),
);

describe("smokeVersions", () => {
  test("runs every supported version when PROBE_TARGET is unset", () => {
    expect(SUPPORTED.length).toBeGreaterThan(0);
    expect(smokeVersions({})).toEqual(SUPPORTED);
  });

  test("pins each version to the engine of that version's target", () => {
    for (const version of smokeVersions({})) {
      expect(engineHead(probeTarget(`defold-${version}`)).version).toBe(version);
    }
  });

  test("keeps only the version PROBE_TARGET names", () => {
    const version = SUPPORTED[SUPPORTED.length - 1] as string;
    expect(smokeVersions({ PROBE_TARGET: `defold-${version}` })).toEqual([version]);
  });

  test("throws when PROBE_TARGET names no supported version", () => {
    expect(() => smokeVersions({ PROBE_TARGET: "defold-0.0.0" })).toThrow("defold-0.0.0");
  });
});
