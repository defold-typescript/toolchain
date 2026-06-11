import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import {
  extensionArchiveKey,
  extensionCacheDir,
  resolveExtensionArchive,
  resolveExtensions,
} from "./extension-archive";
import type { ExtensionDependency } from "./extension-deps";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "extension-archive-"));
}

const noDownload = async (): Promise<Uint8Array> => {
  throw new Error("download should not be called");
};

function fakeZip(entries: string[]): { entries: () => string[] } {
  return { entries: () => entries };
}

function dep(url: string, index = 0): ExtensionDependency {
  return { index, url };
}

describe("extensionCacheDir", () => {
  test("honors DEFOLD_TYPESCRIPT_CACHE override", () => {
    expect(extensionCacheDir({ DEFOLD_TYPESCRIPT_CACHE: "/custom/root" }, () => "/home/u")).toBe(
      join("/custom/root", "extensions"),
    );
  });

  test("falls back to XDG_CACHE_HOME when override unset", () => {
    expect(extensionCacheDir({ XDG_CACHE_HOME: "/xdg/cache" }, () => "/home/u")).toBe(
      join("/xdg/cache", "defold-typescript", "extensions"),
    );
  });

  test("falls back to <homedir>/.cache when neither env var set", () => {
    expect(extensionCacheDir({}, () => "/home/u")).toBe(
      join("/home/u", ".cache", "defold-typescript", "extensions"),
    );
  });
});

describe("resolveExtensionArchive", () => {
  test("cache miss: downloads once, writes a stable per-URL key, provenance download", async () => {
    const cacheDir = tmp();
    const url = "https://example.com/ext.zip";
    let calls = 0;
    const download = async (target: string) => {
      calls++;
      return new TextEncoder().encode(`bytes-${target}`);
    };
    const result = await resolveExtensionArchive(dep(url), {
      cacheDir,
      download,
      readZip: () => fakeZip(["ext/api/ext.script_api", "ext/readme.md"]),
    });
    expect(calls).toBe(1);
    expect(result.provenance).toBe("download");
    expect(result.url).toBe(url);
    expect(result.scriptApis).toEqual(["ext/api/ext.script_api"]);
    expect(result.assetOnly).toBe(false);
    const expectedPath = join(cacheDir, extensionArchiveKey(url), "archive.zip");
    expect(result.archivePath).toBe(expectedPath);
    expect(existsSync(expectedPath)).toBe(true);
  });

  test("cache hit: second call for the same URL serves cache without downloading", async () => {
    const cacheDir = tmp();
    const url = "https://example.com/ext.zip";
    const first = await resolveExtensionArchive(dep(url), {
      cacheDir,
      download: async () => new TextEncoder().encode("seed"),
      readZip: () => fakeZip(["a.script_api"]),
    });
    expect(first.provenance).toBe("download");

    const second = await resolveExtensionArchive(dep(url), {
      cacheDir,
      download: noDownload,
      readZip: () => fakeZip(["a.script_api"]),
    });
    expect(second.provenance).toBe("cache");
    expect(second.scriptApis).toEqual(["a.script_api"]);
  });

  test("asset-only archive: no .script_api yields assetOnly, reported not thrown", async () => {
    const cacheDir = tmp();
    const result = await resolveExtensionArchive(dep("https://example.com/asset.zip"), {
      cacheDir,
      download: async () => new TextEncoder().encode("z"),
      readZip: () => fakeZip(["asset/foo.png", "asset/readme.md"]),
    });
    expect(result.assetOnly).toBe(true);
    expect(result.scriptApis).toEqual([]);
    expect(result.provenance).toBe("download");
  });
});

describe("resolveExtensions", () => {
  test("maps each dependency to one resolved extension, in index order", async () => {
    const cacheDir = tmp();
    const deps = [dep("https://e/0.zip", 0), dep("https://e/1.zip", 1)];
    const entriesByKey: Record<string, string[]> = {
      [extensionArchiveKey("https://e/0.zip")]: ["zero.script_api"],
      [extensionArchiveKey("https://e/1.zip")]: ["one/api.script_api"],
    };
    const results = await resolveExtensions(deps, {
      cacheDir,
      download: async () => new TextEncoder().encode("z"),
      readZip: (zipPath) => fakeZip(entriesByKey[basename(dirname(zipPath))] ?? []),
    });
    expect(results.length).toBe(2);
    expect(results[0]?.url).toBe("https://e/0.zip");
    expect(results[0]?.scriptApis).toEqual(["zero.script_api"]);
    expect(results[1]?.url).toBe("https://e/1.zip");
    expect(results[1]?.scriptApis).toEqual(["one/api.script_api"]);
  });
});
