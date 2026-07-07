import { describe, expect, test } from "bun:test";
import * as path from "node:path";
import { bobCacheDir, bobCachePath, bobDownloadUrl, resolveBobJar, resolveJava } from "./bob";

const SHA = "8fd9f9f5c6e1bd91b8c0f0a3a7d2e1c4b5a60798";
const OTHER_SHA = "0123456789abcdef0123456789abcdef01234567";

describe("bobDownloadUrl", () => {
  test("builds the stable archive bob.jar URL for a sha", () => {
    expect(bobDownloadUrl(SHA)).toBe(`https://d.defold.com/archive/stable/${SHA}/bob/bob.jar`);
  });
});

describe("bobCacheDir", () => {
  test("honors the DEFOLD_TYPESCRIPT_CACHE override", () => {
    expect(bobCacheDir({ DEFOLD_TYPESCRIPT_CACHE: "/tmp/dtc" }, () => "/home/u")).toBe(
      path.join("/tmp/dtc", "bob"),
    );
  });

  test("falls back to XDG_CACHE_HOME, then home/.cache", () => {
    expect(bobCacheDir({ XDG_CACHE_HOME: "/xdg" }, () => "/home/u")).toBe(
      path.join("/xdg", "defold-typescript", "bob"),
    );
    expect(bobCacheDir({}, () => "/home/u")).toBe(
      path.join("/home/u", ".cache", "defold-typescript", "bob"),
    );
  });
});

describe("bobCachePath", () => {
  test("is deterministic for a given sha", () => {
    const a = bobCachePath({ sha1: SHA, cacheDir: "/c" });
    const b = bobCachePath({ sha1: SHA, cacheDir: "/c" });
    expect(a).toBe(b);
    expect(a).toBe(path.join("/c", SHA, "bob.jar"));
  });

  test("does not collide across shas", () => {
    expect(bobCachePath({ sha1: SHA, cacheDir: "/c" })).not.toBe(
      bobCachePath({ sha1: OTHER_SHA, cacheDir: "/c" }),
    );
  });
});

describe("resolveBobJar", () => {
  const target = path.join("/c", SHA, "bob.jar");

  test("reports the cached jar when the probe hits (no download needed)", () => {
    const result = resolveBobJar({
      sha1: SHA,
      cacheDir: "/c",
      probe: (candidate) => candidate === target,
    });
    expect(result).toEqual({ jarPath: target, cached: true });
  });

  test("reports the download target when the probe misses", () => {
    const result = resolveBobJar({
      sha1: SHA,
      cacheDir: "/c",
      probe: () => false,
    });
    expect(result).toEqual({ jarPath: target, cached: false });
  });
});

describe("resolveJava", () => {
  test("returns the override when provided", () => {
    expect(resolveJava({ override: "/jdk/bin/java", probe: () => false })).toBe("/jdk/bin/java");
  });

  test("returns the PATH java when no override and the probe hits", () => {
    expect(resolveJava({ probe: (cmd) => cmd === "java" })).toBe("java");
  });

  test("throws a clear error when no override and no java is found", () => {
    expect(() => resolveJava({ probe: () => false })).toThrow(/java/i);
  });

  test("returns the editor-bundled java when no override and no PATH java", () => {
    expect(
      resolveJava({ probe: () => false, bundledJava: () => "/editor/packages/jdk-17/bin/java" }),
    ).toBe("/editor/packages/jdk-17/bin/java");
  });

  test("does not consult the editor bundle when java is on PATH", () => {
    let consulted = false;
    const result = resolveJava({
      probe: (cmd) => cmd === "java",
      bundledJava: () => {
        consulted = true;
        return "/editor/bin/java";
      },
    });
    expect(result).toBe("java");
    expect(consulted).toBe(false);
  });

  test("does not consult the editor bundle when an override is set", () => {
    let consulted = false;
    const result = resolveJava({
      override: "/jdk/bin/java",
      probe: () => false,
      bundledJava: () => {
        consulted = true;
        return "/editor/bin/java";
      },
    });
    expect(result).toBe("/jdk/bin/java");
    expect(consulted).toBe(false);
  });

  test("throws naming override, PATH, and the editor bundle when all are exhausted", () => {
    expect(() => resolveJava({ probe: () => false, bundledJava: () => null })).toThrow(/editor/i);
  });
});
