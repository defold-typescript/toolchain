import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import committed from "../api-availability.json" with { type: "json" };
import { groupByLogicalName, isSignatureTransition } from "../src/api-availability";
import {
  type AvailabilityArtifact,
  buildAvailabilityArtifact,
  selectCompleteVersionSurfaces,
  serializeAvailabilityArtifact,
  versionOf,
} from "./generate-api-availability";
import { loadApiTargets } from "./regen";

const AVAILABILITY_PATH = resolve(import.meta.dir, "..", "api-availability.json");

describe("availability derivation over the committed target snapshots", () => {
  const artifact = buildAvailabilityArtifact();

  test("emits an N-version matrix keyed by the ordered committed version axis, no pairwise keys", () => {
    expect(artifact.versions).toEqual(["1.13.0", "1.12.4"]);
    expect((artifact as unknown as { current?: string }).current).toBeUndefined();
    expect((artifact as unknown as { baseline?: string }).baseline).toBeUndefined();
    expect(
      artifact.records.every(
        (r) =>
          Array.isArray(r.availableIn) &&
          (r as unknown as { since?: string }).since === undefined &&
          (r as unknown as { removedIn?: string }).removedIn === undefined,
      ),
    ).toBe(true);
  });

  test("the version axis equals the committed (source == null) targets, newest first", () => {
    const committedVersions = selectCompleteVersionSurfaces(loadApiTargets()).map(versionOf);
    expect(artifact.versions).toEqual(committedVersions);
  });

  test("a promoted 1.13.0-only symbol becomes availableIn:[1.13.0] (since:X migration)", () => {
    const promoted = artifact.records.filter((r) => r.identity.namespace === "b2d.world");
    expect(promoted.length).toBeGreaterThan(0);
    expect(promoted.every((r) => r.availableIn.length === 1 && r.availableIn[0] === "1.13.0")).toBe(
      true,
    );
  });

  test("a genuinely removed symbol becomes availableIn:[1.12.4] (removedIn:X migration)", () => {
    const material = artifact.records.find(
      (r) => r.identity.namespace === "model" && r.identity.name === "material",
    );
    expect(material?.identity.kind).toBe("PROPERTY");
    expect(material?.availableIn).toEqual(["1.12.4"]);
    const group = groupByLogicalName(
      [material as (typeof artifact.records)[number]],
      artifact.versions,
    );
    expect(isSignatureTransition(group[0] as (typeof group)[number], artifact.versions)).toBe(
      false,
    );
  });

  test("a changed-signature symbol keeps one overload per version and reads as a transition", () => {
    const mount = artifact.records.filter((r) => r.identity.name === "liveupdate.add_mount");
    expect(mount.some((r) => r.availableIn.length === 1 && r.availableIn[0] === "1.12.4")).toBe(
      true,
    );
    expect(mount.some((r) => r.availableIn.length === 1 && r.availableIn[0] === "1.13.0")).toBe(
      true,
    );
    const group = groupByLogicalName(mount, artifact.versions);
    expect(group).toHaveLength(1);
    expect(isSignatureTransition(group[0] as (typeof group)[number], artifact.versions)).toBe(true);
  });

  test("a symbol present in every tracked version carries no record (available-in-all)", () => {
    const bothVersions = artifact.records.filter(
      (r) => r.availableIn.length === artifact.versions.length,
    );
    expect(bothVersions).toHaveLength(0);
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
