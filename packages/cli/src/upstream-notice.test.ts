import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import {
  readUpstreamCache,
  refreshUpstreamCache,
  upstreamNoticeCacheDir,
  upstreamNoticeCachePath,
  upstreamRefreshDue,
} from "./upstream-notice";

const DAY = 24 * 60 * 60 * 1000;
const roots: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "dts-upstream-"));
  roots.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of roots.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("upstreamNoticeCacheDir", () => {
  test("honors the DEFOLD_TYPESCRIPT_CACHE override", () => {
    expect(upstreamNoticeCacheDir({ DEFOLD_TYPESCRIPT_CACHE: "/tmp/dtc" }, () => "/home/u")).toBe(
      path.join("/tmp/dtc", "upstream"),
    );
  });

  test("falls back to XDG_CACHE_HOME, then home/.cache", () => {
    expect(upstreamNoticeCacheDir({ XDG_CACHE_HOME: "/xdg" }, () => "/home/u")).toBe(
      path.join("/xdg", "defold-typescript", "upstream"),
    );
    expect(upstreamNoticeCacheDir({}, () => "/home/u")).toBe(
      path.join("/home/u", ".cache", "defold-typescript", "upstream"),
    );
  });
});

describe("upstreamNoticeCachePath", () => {
  test("keys the file by channel", () => {
    expect(upstreamNoticeCachePath("stable", "/c")).toBe(path.join("/c", "stable.json"));
    expect(upstreamNoticeCachePath("beta", "/c")).not.toBe(upstreamNoticeCachePath("stable", "/c"));
  });
});

describe("readUpstreamCache", () => {
  test("reads a well-formed state back", () => {
    const dir = tempRoot();
    const file = path.join(dir, "stable.json");
    writeFileSync(
      file,
      JSON.stringify({ checkedAt: 1000, channel: "stable", latestVersion: "1.13.1" }),
    );
    expect(readUpstreamCache(file)).toEqual({
      checkedAt: 1000,
      channel: "stable",
      latestVersion: "1.13.1",
    });
  });

  test.each([
    ["a missing file", undefined],
    ["a truncated file", '{"checkedAt":100,"channel":"stab'],
    ["a non-JSON file", "not json at all"],
    ["a JSON array", "[1,2,3]"],
    ["a JSON null", "null"],
    ["a wrong-shaped object", '{"checkedAt":"soon","latestVersion":5}'],
    ["a non-finite checkedAt", '{"checkedAt":null,"channel":"stable","latestVersion":"1.13.1"}'],
    ["a NaN-ish checkedAt", '{"checkedAt":"NaN","channel":"stable","latestVersion":"1.13.1"}'],
  ])("returns undefined for %s without throwing", (_label, contents) => {
    const dir = tempRoot();
    const file = path.join(dir, "stable.json");
    if (contents !== undefined) {
      writeFileSync(file, contents);
    }
    expect(() => readUpstreamCache(file)).not.toThrow();
    expect(readUpstreamCache(file)).toBeUndefined();
  });

  test("returns undefined when the path is a directory", () => {
    const dir = tempRoot();
    const file = path.join(dir, "stable.json");
    mkdirSync(file);
    expect(readUpstreamCache(file)).toBeUndefined();
  });
});

describe("upstreamRefreshDue", () => {
  test("is due when there is no cached state at all", () => {
    expect(upstreamRefreshDue(undefined, 0, DAY)).toBe(true);
  });

  test("is not due inside the interval and due once past it", () => {
    const state = { checkedAt: 1_000_000, channel: "stable", latestVersion: "1.13.1" } as const;
    expect(upstreamRefreshDue(state, 1_000_000, DAY)).toBe(false);
    expect(upstreamRefreshDue(state, 1_000_000 + DAY - 1, DAY)).toBe(false);
    expect(upstreamRefreshDue(state, 1_000_000 + DAY, DAY)).toBe(true);
    expect(upstreamRefreshDue(state, 1_000_000 + DAY * 3, DAY)).toBe(true);
  });

  test("is due when the clock moved backwards past a full interval", () => {
    const state = { checkedAt: 1_000_000, channel: "stable", latestVersion: "1.13.1" } as const;
    expect(upstreamRefreshDue(state, 1_000_000 - DAY * 2, DAY)).toBe(true);
  });
});

describe("refreshUpstreamCache", () => {
  test("calls the fetcher once and writes the new version stamped with the injected clock", async () => {
    const dir = tempRoot();
    const file = path.join(dir, "nested", "stable.json");
    let calls = 0;
    await refreshUpstreamCache({
      channel: "stable",
      path: file,
      now: 4242,
      fetchChannelInfo: async (channel) => {
        calls++;
        expect(channel).toBe("stable");
        return { version: "1.13.1", sha1: "abc" };
      },
    });
    expect(calls).toBe(1);
    expect(readUpstreamCache(file)).toEqual({
      checkedAt: 4242,
      channel: "stable",
      latestVersion: "1.13.1",
    });
  });

  test("a rejecting fetcher resolves quietly, keeps the old version, and does not stamp checkedAt", async () => {
    const dir = tempRoot();
    const file = path.join(dir, "stable.json");
    const before = { checkedAt: 10, channel: "stable", latestVersion: "1.12.4" };
    writeFileSync(file, JSON.stringify(before));
    await refreshUpstreamCache({
      channel: "stable",
      path: file,
      now: 999_999,
      fetchChannelInfo: async () => {
        throw new Error("offline");
      },
    });
    expect(readUpstreamCache(file)).toEqual(before);
  });

  test("a fetcher hanging past the bound resolves quietly and writes nothing", async () => {
    const dir = tempRoot();
    const file = path.join(dir, "stable.json");
    await refreshUpstreamCache({
      channel: "stable",
      path: file,
      now: 5,
      timeoutMs: 10,
      fetchChannelInfo: () => new Promise(() => {}),
    });
    expect(readUpstreamCache(file)).toBeUndefined();
  });

  test("an unwritable destination resolves quietly rather than throwing", async () => {
    const dir = tempRoot();
    const file = path.join(dir, "stable.json");
    mkdirSync(file);
    await refreshUpstreamCache({
      channel: "stable",
      path: file,
      now: 7,
      fetchChannelInfo: async () => ({ version: "1.13.1", sha1: "abc" }),
    });
    expect(readUpstreamCache(file)).toBeUndefined();
  });

  test("two refreshes racing on one path both complete and leave a parseable file", async () => {
    const dir = tempRoot();
    const file = path.join(dir, "stable.json");
    await Promise.all([
      refreshUpstreamCache({
        channel: "stable",
        path: file,
        now: 1,
        fetchChannelInfo: async () => ({ version: "1.13.0", sha1: "a" }),
      }),
      refreshUpstreamCache({
        channel: "stable",
        path: file,
        now: 2,
        fetchChannelInfo: async () => ({ version: "1.13.1", sha1: "b" }),
      }),
    ]);
    const state = readUpstreamCache(file);
    expect(state).toBeDefined();
    expect(["1.13.0", "1.13.1"]).toContain(state?.latestVersion ?? "");
    expect(() => JSON.parse(readFileSync(file, "utf8"))).not.toThrow();
  });

  test("leaves no temp files behind on success", async () => {
    const dir = tempRoot();
    const file = path.join(dir, "stable.json");
    await refreshUpstreamCache({
      channel: "stable",
      path: file,
      now: 1,
      fetchChannelInfo: async () => ({ version: "1.13.1", sha1: "a" }),
    });
    const { readdirSync } = await import("node:fs");
    expect(readdirSync(dir)).toEqual(["stable.json"]);
  });
});
