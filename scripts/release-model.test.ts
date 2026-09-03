import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CURRENT_STABLE_DEFOLD_VERSION,
  DEFOLD_VERSIONS,
  PREVIOUS_STABLE_DEFOLD_VERSION,
} from "../packages/cli/src/defold-version.ts";
import { DEFOLD_1_13_PROMOTED_NAMESPACES } from "../packages/types/scripts/import-defold-release.ts";
import {
  DEFOLD_VERSION,
  EXTENSION_MANIFEST,
  SYNC_MANIFEST,
} from "../packages/types/scripts/sync-api-docs.ts";
import {
  classifyTransition,
  EXTENSION_PINS,
  fixtureDir,
  promotedNamespacesFor,
  RELEASE_MODEL,
  retainedVersions,
  SURFACE_RETENTION,
  targetMetaFor,
} from "./release-model.ts";

interface RegistryTarget {
  readonly id: string;
  readonly default: boolean;
  readonly fixturesDir: string;
  readonly generatedDir: string;
  readonly coreTypesImport: string;
  readonly source?: unknown;
}

describe("release model", () => {
  test("current/previous are seeded from the CLI tuple, not a second literal", () => {
    expect(RELEASE_MODEL.current).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(RELEASE_MODEL.previous).toBe(PREVIOUS_STABLE_DEFOLD_VERSION);
    expect(RELEASE_MODEL.all).toEqual([...DEFOLD_VERSIONS]);
  });

  test("classifyTransition is derived from the target, not stored", () => {
    expect(classifyTransition("1.13.0", "1.13.1")).toBe("patch");
    expect(classifyTransition("1.13.0", "1.14.0")).toBe("minor");
    expect(classifyTransition("1.12.4", "1.13.0")).toBe("minor");
  });

  // A fixed sample version, not `RELEASE_MODEL.current`: the path *shape* is the
  // contract, and pinning it to the moving current version either needs an edit
  // every bump or degrades into restating the template it is meant to check.
  test("fixtureDir yields the release-scoped fixtures path", () => {
    expect(fixtureDir("1.13.0")).toBe("fixtures/defold-1.13.0");
  });

  // Promotion is a property of the release that introduced a namespace, not of
  // whichever release is current — 1.13.1 promoted nothing, and keying this on
  // `current` would silently empty the expectation on the next patch.
  test("promotedNamespacesFor(1.13.0) matches the former 1.13 constant", () => {
    expect(promotedNamespacesFor("1.13.0")).toEqual([
      "b2d.chain",
      "b2d.fixture",
      "b2d.joint",
      "b2d.shape",
      "b2d.world",
      "compute",
      "material",
    ]);
  });

  test("targetMetaFor returns the default surface shape for the current release", () => {
    expect(targetMetaFor("1.13.0", { isDefault: true })).toEqual({
      fixturesDir: "fixtures/defold-1.13.0",
      generatedDir: "generated",
      coreTypesImport: "../src/core-types",
      default: true,
    });
  });

  // A fixed sample version for the same reason the default-shape case above uses
  // one: the demoted path *shape* is the contract, and keying it to whichever
  // release is currently previous makes the expectation restate the template.
  test("targetMetaFor returns the demoted subpath shape for a previous release", () => {
    expect(targetMetaFor("1.12.4", { isDefault: false })).toEqual({
      fixturesDir: "fixtures/defold-1.12.4",
      generatedDir: "generated/versions/defold-1.12.4",
      coreTypesImport: "../../../src/core-types",
      default: false,
    });
  });

  // The registry is written by `applyTargetOps` from `targetMetaFor`; a target
  // restored or edited by hand can silently carry the default surface's flat
  // `generated/` layout and a core-types import one level too shallow, which
  // only shows up as a broken pinned surface.
  test("every committed api-targets entry carries exactly the metadata targetMetaFor generates", () => {
    const registry = JSON.parse(
      readFileSync(resolve(import.meta.dir, "../packages/types/api-targets.json"), "utf8"),
    ) as { targets: RegistryTarget[] };
    const committed = registry.targets.filter((target) => (target.source ?? null) === null);
    expect(committed.length).toBeGreaterThan(0);
    for (const target of committed) {
      const version = target.id.replace(/^defold-/, "");
      expect({
        fixturesDir: target.fixturesDir,
        generatedDir: target.generatedDir,
        coreTypesImport: target.coreTypesImport,
        default: target.default,
      }).toEqual(targetMetaFor(version, { isDefault: version === RELEASE_MODEL.current }));
    }
  });

  describe("correspondence guard — actual runtime values, not regex-scraped source", () => {
    test("DEFOLD_VERSION read by sync-api-docs equals the model current", () => {
      expect(DEFOLD_VERSION).toBe(RELEASE_MODEL.current);
    });

    test("every synced fixture path is rooted at the model fixtureDir", () => {
      const prefix = `${fixtureDir(RELEASE_MODEL.current)}/`;
      for (const entry of [...SYNC_MANIFEST, ...EXTENSION_MANIFEST]) {
        expect(entry.fixture.startsWith(prefix)).toBe(true);
      }
    });

    test("promoted namespaces read by import-defold-release match the model", () => {
      expect(promotedNamespacesFor("1.13.0")).toEqual([...DEFOLD_1_13_PROMOTED_NAMESPACES]);
    });

    test("extension pins read by sync-api-docs match the model", () => {
      expect(
        EXTENSION_MANIFEST.map(({ namespace, repo, tag, path }) => ({
          namespace,
          repo,
          tag,
          path,
        })),
      ).toEqual([...EXTENSION_PINS]);
    });
  });
});

describe("surface retention", () => {
  // The bump planner's default, not a cap on what the repo may ship: a target
  // restored by hand stays registered and pre-baked until the next bump applies
  // the rule again, and the bump reports every version the rule drops.
  test("a patch keeps the current release and the previous minor, not the predecessor patch", () => {
    expect(retainedVersions(["1.13.1", "1.13.0", "1.12.4"], "1.13.2")).toEqual([
      "1.13.2",
      "1.12.4",
    ]);
  });

  test("a minor keeps the newest release of the outgoing minor line", () => {
    expect(retainedVersions(["1.13.1", "1.13.0", "1.12.4"], "1.14.0")).toEqual([
      "1.14.0",
      "1.13.1",
    ]);
  });

  // A repo whose whole history sits in one minor line still needs a previous
  // stable: `PREVIOUS_STABLE_DEFOLD_VERSION` reads the tuple's second entry.
  test("with no earlier minor line the newest predecessor fills the second slot", () => {
    expect(retainedVersions(["1.13.1", "1.13.0"], "1.13.2")).toEqual(["1.13.2", "1.13.1"]);
  });

  test("the retained tuple is newest-first and free of duplicates", () => {
    expect(retainedVersions(["1.13.2", "1.13.1", "1.12.4"], "1.13.2")).toEqual([
      "1.13.2",
      "1.12.4",
    ]);
  });

  test("the live tuple carries the rule's keep set plus one deliberate restoration", () => {
    const keep = retainedVersions([...DEFOLD_VERSIONS], CURRENT_STABLE_DEFOLD_VERSION);

    // Both derived from the live pin rather than written as literals, so the
    // assertions survive a bump instead of silently pinning a stale release.
    const [major, minor, patch] = CURRENT_STABLE_DEFOLD_VERSION.split(".").map(Number) as [
      number,
      number,
      number,
    ];
    const nextPatch = `${major}.${minor}.${patch + 1}`;
    // Computed by string prefix rather than read back out of `retainedVersions`,
    // so the rule assertions do not restate the function they check.
    const previousMinorOfCurrent = DEFOLD_VERSIONS.find(
      (version) => version.split(".").slice(0, 2).join(".") !== `${major}.${minor}`,
    ) as string;

    expect(keep.length).toBe(SURFACE_RETENTION.keep.length);
    expect(keep[0]).toBe(CURRENT_STABLE_DEFOLD_VERSION);
    expect(keep[1]).toBe(previousMinorOfCurrent);

    expect(DEFOLD_VERSIONS.filter((version) => !keep.includes(version))).toEqual([
      PREVIOUS_STABLE_DEFOLD_VERSION,
    ]);

    expect(retainedVersions([...DEFOLD_VERSIONS], nextPatch)).toEqual([
      nextPatch,
      previousMinorOfCurrent,
    ]);
  });
});
