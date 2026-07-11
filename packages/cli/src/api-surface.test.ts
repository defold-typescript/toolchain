import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  CURRENT_STABLE_SURFACE_ID,
  selectApiSurface,
  selectApiSurfaceForTarget,
} from "./api-surface";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";

describe("selectApiSurface", () => {
  test("CURRENT_STABLE_SURFACE_ID is the absolute-versioned default id", () => {
    expect(CURRENT_STABLE_SURFACE_ID).toBe("defold-1.12.4");
  });

  test("current-stable version maps to the default surface", () => {
    expect(selectApiSurface(CURRENT_STABLE_DEFOLD_VERSION)).toEqual({
      surfaceId: CURRENT_STABLE_SURFACE_ID,
      available: true,
    });
  });

  test("an unknown version has no pre-baked surface", () => {
    expect(selectApiSurface("1.10.0")).toEqual({
      surfaceId: null,
      available: false,
    });
  });

  test("a bare-semver pin maps to its ref-doc registry target", () => {
    expect(selectApiSurface("1.9.8")).toEqual({
      surfaceId: "defold-1.9.8",
      available: true,
    });
  });

  test("a version with no matching target is unavailable", () => {
    expect(selectApiSurface("0.0.0")).toEqual({
      surfaceId: null,
      available: false,
    });
  });
});

describe("selectApiSurfaceForTarget", () => {
  const io = {
    fetchChannelInfo: async () => {
      throw new Error("fetchChannelInfo should not be called for a version target");
    },
    fetchVersionInfo: async () => ({ sha1: "cafebabe" }),
  };

  test("a fixed-version target maps to its registry surface off the resolved head", async () => {
    expect(await selectApiSurfaceForTarget({ kind: "version", version: "1.9.8" }, io)).toEqual({
      surfaceId: "defold-1.9.8",
      available: true,
      head: { version: "1.9.8", channel: null, sha: "cafebabe" },
    });
  });

  test("a channel head drives the surface id off the resolved head version, not a pin", async () => {
    const channelIo = {
      fetchChannelInfo: async () => ({ version: "1.9.8", sha1: "deadbeef" }),
      fetchVersionInfo: async () => {
        throw new Error("fetchVersionInfo should not be called for a channel target");
      },
    };
    expect(
      await selectApiSurfaceForTarget({ kind: "channel", channel: "beta" }, channelIo),
    ).toEqual({
      surfaceId: "defold-1.9.8",
      available: true,
      head: { version: "1.9.8", channel: "beta", sha: "deadbeef" },
    });
  });

  test("a resolved head with no registry target is unavailable", async () => {
    const channelIo = {
      fetchChannelInfo: async () => ({ version: "0.0.0", sha1: "deadbeef" }),
      fetchVersionInfo: async () => {
        throw new Error("fetchVersionInfo should not be called for a channel target");
      },
    };
    expect(
      await selectApiSurfaceForTarget({ kind: "channel", channel: "alpha" }, channelIo),
    ).toEqual({
      surfaceId: null,
      available: false,
      head: { version: "0.0.0", channel: "alpha", sha: "deadbeef" },
    });
  });
});

describe("drift guard", () => {
  test("CURRENT_STABLE_SURFACE_ID equals the default target id in api-targets.json", () => {
    const registryPath = path.resolve(import.meta.dir, "../../types/api-targets.json");
    const registry = JSON.parse(readFileSync(registryPath, "utf8")) as {
      targets: { id: string; default?: boolean }[];
    };
    const defaults = registry.targets.filter((t) => t.default === true);
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.id).toBe(CURRENT_STABLE_SURFACE_ID);
  });
});
