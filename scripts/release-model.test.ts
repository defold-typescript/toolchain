import { describe, expect, test } from "bun:test";
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
  fixtureDir,
  promotedNamespacesFor,
  RELEASE_MODEL,
  targetMetaFor,
} from "./release-model.ts";

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

  test("fixtureDir yields the release-scoped fixtures path", () => {
    expect(fixtureDir(RELEASE_MODEL.current)).toBe("fixtures/defold-1.13.0");
  });

  test("promotedNamespacesFor(current) matches the former 1.13 constant", () => {
    expect(promotedNamespacesFor(RELEASE_MODEL.current)).toEqual([
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
    expect(targetMetaFor(RELEASE_MODEL.current, { isDefault: true })).toEqual({
      fixturesDir: "fixtures/defold-1.13.0",
      generatedDir: "generated",
      coreTypesImport: "../src/core-types",
      default: true,
    });
  });

  test("targetMetaFor returns the demoted subpath shape for a previous release", () => {
    expect(targetMetaFor(RELEASE_MODEL.previous, { isDefault: false })).toEqual({
      fixturesDir: "fixtures/defold-1.12.4",
      generatedDir: "generated/versions/defold-1.12.4",
      coreTypesImport: "../../../src/core-types",
      default: false,
    });
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
      expect(promotedNamespacesFor(RELEASE_MODEL.current)).toEqual([
        ...DEFOLD_1_13_PROMOTED_NAMESPACES,
      ]);
    });
  });
});
