import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import committed from "../api-availability.json" with { type: "json" };
import { collectSymbolIdentities, symbolIdentityKey } from "../src/api-availability";
import { parseDefoldApiDoc } from "../src/api-doc";
import {
  type AvailabilityArtifact,
  buildAvailabilityArtifact,
  selectCompleteTargets,
  serializeAvailabilityArtifact,
} from "./generate-api-availability";
import { loadApiTargets, loadTargetModules } from "./regen";

const AVAILABILITY_PATH = resolve(import.meta.dir, "..", "api-availability.json");

describe("availability derivation over the committed target snapshots", () => {
  const artifact = buildAvailabilityArtifact();

  test("diffs the default target against the highest committed baseline", () => {
    expect(artifact.current).toBe("1.13.0");
    expect(artifact.baseline).toBe("1.12.4");
    const { current, baseline } = selectCompleteTargets(loadApiTargets());
    expect(current.default).toBe(true);
    expect(baseline.id).toBe("defold-1.12.4");
  });

  test("marks a promoted 1.13.0 symbol with since and never removedIn", () => {
    const promoted = artifact.records.filter(
      (r) => r.identity.namespace === "b2d.world" && r.since,
    );
    expect(promoted.length).toBeGreaterThan(0);
    expect(promoted.every((r) => r.removedIn === undefined)).toBe(true);
  });

  test("marks a dropped symbol removedIn 1.13.0 and keeps it out of the current callable surface", () => {
    const removed = artifact.records.filter((r) => r.removedIn === "1.13.0");
    expect(removed.length).toBeGreaterThan(0);
    const dropped = removed.find(
      (r) => r.identity.namespace === "model" && r.identity.name === "material",
    );
    expect(dropped?.identity.kind).toBe("PROPERTY");
    const { current } = selectCompleteTargets(loadApiTargets());
    const currentSurface = new Set(
      collectSymbolIdentities(
        loadTargetModules(current).map((entry) => parseDefoldApiDoc(entry.doc)),
      ).map(symbolIdentityKey),
    );
    for (const record of removed) {
      expect(currentSurface.has(symbolIdentityKey(record.identity))).toBe(false);
    }
  });

  test("tracks a changed-signature symbol as both a removedIn and a since overload of one name", () => {
    const mount = artifact.records.filter((r) => r.identity.name === "liveupdate.add_mount");
    expect(mount.some((r) => r.removedIn === "1.13.0")).toBe(true);
    expect(mount.some((r) => r.since === "1.13.0")).toBe(true);
  });
});

describe("committed artifact drift gate", () => {
  test("fresh derivation equals the committed api-availability.json", () => {
    const fresh = buildAvailabilityArtifact();
    expect(fresh).toEqual(committed as unknown as AvailabilityArtifact);
  });

  test("committed api-availability.json is byte-equal to a fresh serialization", () => {
    const fresh = serializeAvailabilityArtifact(buildAvailabilityArtifact());
    expect(fresh).toBe(readFileSync(AVAILABILITY_PATH, "utf8"));
  });
});
