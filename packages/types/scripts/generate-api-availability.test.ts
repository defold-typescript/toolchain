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

// The committed version axis, newest-first, from the same production selector the
// artifact builder uses — so a version rotation needs no edit here.
const COMPLETE_VERSIONS = selectCompleteVersionSurfaces(loadApiTargets()).map(versionOf);
const [NEWEST_VERSION] = COMPLETE_VERSIONS as [string];
const OLDEST_VERSION = COMPLETE_VERSIONS[COMPLETE_VERSIONS.length - 1] as string;
const INTRODUCED_IN_1_13_2 = COMPLETE_VERSIONS.slice(0, COMPLETE_VERSIONS.indexOf("1.13.2") + 1);

// `availableIn` for a symbol introduced after the oldest tracked release is a
// newest-anchored, contiguous prefix of the version axis: a symbol cannot be
// present, absent, then present again across a linear release history.
function isNewestAnchoredPrefix(availableIn: readonly string[]): boolean {
  return (
    availableIn.length > 0 && availableIn.every((version, i) => version === COMPLETE_VERSIONS[i])
  );
}

describe("availability derivation over the committed target snapshots", () => {
  const artifact = buildAvailabilityArtifact();

  test("emits an N-version matrix keyed by the ordered committed version axis, no pairwise keys", () => {
    expect(artifact.versions).toEqual(COMPLETE_VERSIONS);
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

  // `b2d.world` was promoted mid-history, so it must carry every release from its
  // promotion forward and none before it — asserted as the prefix property rather
  // than as a fixed version list, which only held while exactly two were tracked.
  // Per logical name: a signature that changed after the promotion splits the
  // run across two identities, which together still cover it.
  test("a promoted symbol carries a newest-anchored run that stops short of the oldest release", () => {
    const promoted = artifact.records.filter((r) => r.identity.namespace === "b2d.world");
    expect(promoted.length).toBeGreaterThan(0);
    for (const group of groupByLogicalName(promoted, artifact.versions)) {
      const run = artifact.versions.filter((version) =>
        group.overloads.some((overload) => overload.availableIn.includes(version)),
      );
      expect(isNewestAnchoredPrefix(run)).toBe(true);
      expect(run).toContain(NEWEST_VERSION);
      expect(run).not.toContain(OLDEST_VERSION);
    }
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

  // The two arms partition the version axis: every tracked release is served by
  // exactly one signature, so no release is left without an overload and none
  // claims both. Counting one release per arm only held while two were tracked.
  test("a changed-signature symbol partitions the version axis and reads as a transition", () => {
    const mount = artifact.records.filter((r) => r.identity.name === "liveupdate.add_mount");
    expect(mount).toHaveLength(2);
    const covered = mount.flatMap((r) => r.availableIn);
    expect(covered.length).toBe(new Set(covered).size);
    expect([...covered].sort()).toEqual([...COMPLETE_VERSIONS].sort());
    expect(mount.some((r) => r.availableIn.includes(OLDEST_VERSION))).toBe(true);
    expect(mount.some((r) => r.availableIn.includes(NEWEST_VERSION))).toBe(true);
    const group = groupByLogicalName(mount, artifact.versions);
    expect(group).toHaveLength(1);
    expect(isSignatureTransition(group[0] as (typeof group)[number], artifact.versions)).toBe(true);
  });

  test("an overload withheld by skipOverloads carries no availability record", () => {
    const withheld = (name: string, handle: string) =>
      artifact.records.filter(
        (r) => r.identity.name === name && r.identity.signature.includes(`"${handle}"`),
      );
    expect(withheld("b2d.body.create_fixture", "b2Shape")).toEqual([]);
    expect(withheld("b2d.body.set_mass_data", "b2MassData")).toEqual([]);
  });

  // A record the migration overlay carries (a deprecation) is kept whatever its span.
  test("a symbol present in every tracked version carries no record (available-in-all)", () => {
    const bothVersions = artifact.records.filter(
      (r) =>
        r.availableIn.length === artifact.versions.length &&
        r.deprecatedSince === undefined &&
        r.replacement === undefined &&
        r.box2d === undefined,
    );
    expect(bothVersions).toHaveLength(0);
  });

  test("a function one doc files under another namespace takes its owning namespace", () => {
    for (const name of [
      "bullet3d.collision_object.get_shape",
      "bullet3d.collision_object.get_shape_count",
      "bullet3d.collision_object.get_shapes",
    ]) {
      const records = artifact.records.filter(
        (r) => r.identity.kind === "FUNCTION" && r.identity.name === name,
      );
      expect(records.length).toBeGreaterThan(0);
      for (const record of records) {
        expect(record.identity.namespace).toBe("bullet3d.collision_object");
        expect(record.availableIn).toEqual(INTRODUCED_IN_1_13_2);
      }
    }
    expect(
      artifact.records.filter(
        (r) =>
          r.identity.namespace === "bullet3d.shape" &&
          r.identity.name.startsWith("bullet3d.collision_object."),
      ),
    ).toEqual([]);
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
