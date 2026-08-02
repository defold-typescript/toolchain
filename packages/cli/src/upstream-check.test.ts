import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  acquireUpstreamLock,
  readCachedUpstreamLatest,
  readUpstreamState,
  refreshUpstreamState,
  releaseUpstreamLock,
  shouldRefreshUpstream,
  takeOverStaleUpstreamLock,
  UPSTREAM_CHECK_INTERVAL_MS,
  UPSTREAM_LOCK_STALE_MS,
  type UpstreamCheckState,
  type UpstreamLockHandle,
  upstreamCacheDir,
  upstreamCachePath,
  upstreamLockPath,
  writeUpstreamState,
} from "./upstream-check";

function tmp(): string {
  return mkdtempSync(join(tmpdir(), "upstream-check-"));
}

const noFetch = async (): Promise<{ version: string; sha1: string }> => {
  throw new Error("fetchChannelInfo should not be called");
};

describe("upstreamCacheDir", () => {
  test("honors DEFOLD_TYPESCRIPT_CACHE override", () => {
    expect(upstreamCacheDir({ DEFOLD_TYPESCRIPT_CACHE: "/custom/root" }, () => "/home/u")).toBe(
      join("/custom/root", "upstream"),
    );
  });

  test("falls back to XDG_CACHE_HOME when override unset", () => {
    expect(upstreamCacheDir({ XDG_CACHE_HOME: "/xdg/cache" }, () => "/home/u")).toBe(
      join("/xdg/cache", "defold-typescript", "upstream"),
    );
  });

  test("falls back to <homedir>/.cache when neither env var set", () => {
    expect(upstreamCacheDir({}, () => "/home/u")).toBe(
      join("/home/u", ".cache", "defold-typescript", "upstream"),
    );
  });
});

describe("upstreamCachePath", () => {
  test("one file per channel", () => {
    const cacheDir = "/c";
    expect(upstreamCachePath({ channel: "stable", cacheDir })).toBe(join("/c", "stable.json"));
    expect(upstreamCachePath({ channel: "beta", cacheDir })).toBe(join("/c", "beta.json"));
    expect(upstreamCachePath({ channel: "alpha", cacheDir })).toBe(join("/c", "alpha.json"));
  });

  test("lock path is the state path plus a .lock suffix", () => {
    expect(upstreamLockPath({ channel: "stable", cacheDir: "/c" })).toBe(
      join("/c", "stable.json.lock"),
    );
  });
});

describe("readUpstreamState / writeUpstreamState", () => {
  test("round-trips state, creating the cache directory if absent", () => {
    const path = join(tmp(), "nested", "stable.json");
    const state: UpstreamCheckState = {
      checkedAt: 1_700_000_000_000,
      channel: "stable",
      latestVersion: "1.13.0",
    };
    writeUpstreamState(path, state);
    expect(readUpstreamState(path)).toEqual(state);
  });

  test("missing path returns undefined", () => {
    expect(readUpstreamState(join(tmp(), "absent.json"))).toBeUndefined();
  });

  test("malformed JSON returns undefined without throwing", () => {
    const path = join(tmp(), "stable.json");
    writeFileSync(path, "{not json");
    expect(readUpstreamState(path)).toBeUndefined();
  });

  test("well-formed JSON of the wrong shape returns undefined", () => {
    const dir = tmp();
    const wrongType = join(dir, "a.json");
    writeFileSync(wrongType, JSON.stringify({ checkedAt: "soon" }));
    expect(readUpstreamState(wrongType)).toBeUndefined();

    const missingField = join(dir, "b.json");
    writeFileSync(missingField, JSON.stringify({ checkedAt: 1, channel: "stable" }));
    expect(readUpstreamState(missingField)).toBeUndefined();

    const notAChannel = join(dir, "c.json");
    writeFileSync(
      notAChannel,
      JSON.stringify({ checkedAt: 1, channel: "nightly", latestVersion: "1.13.0" }),
    );
    expect(readUpstreamState(notAChannel)).toBeUndefined();

    const notAnObject = join(dir, "d.json");
    writeFileSync(notAnObject, JSON.stringify(["stable"]));
    expect(readUpstreamState(notAnObject)).toBeUndefined();
  });
});

describe("shouldRefreshUpstream", () => {
  const now = 1_700_000_000_000;
  const at = (checkedAt: number): UpstreamCheckState => ({
    checkedAt,
    channel: "stable",
    latestVersion: "1.13.0",
  });

  test("nothing cached yet refreshes", () => {
    expect(shouldRefreshUpstream(undefined, now)).toBe(true);
  });

  test("one millisecond inside the interval does not refresh", () => {
    expect(shouldRefreshUpstream(at(now - (UPSTREAM_CHECK_INTERVAL_MS - 1)), now)).toBe(false);
  });

  test("exactly the interval refreshes", () => {
    expect(shouldRefreshUpstream(at(now - UPSTREAM_CHECK_INTERVAL_MS), now)).toBe(true);
  });

  test("a future checkedAt does not storm the refresh", () => {
    expect(shouldRefreshUpstream(at(now + UPSTREAM_CHECK_INTERVAL_MS), now)).toBe(false);
  });
});

describe("acquireUpstreamLock", () => {
  function ageStale(lockPath: string, now: number): void {
    const seconds = (now - UPSTREAM_LOCK_STALE_MS - 1000) / 1000;
    utimesSync(lockPath, seconds, seconds);
  }

  function mustAcquire(lockPath: string, now: number): UpstreamLockHandle {
    const handle = acquireUpstreamLock(lockPath, now);
    if (handle === undefined) {
      throw new Error(`expected to acquire ${lockPath}`);
    }
    return handle;
  }

  test("free path acquires; a held lock refuses", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const now = Date.now();
    const handle = acquireUpstreamLock(lockPath, now);
    expect(handle).toBeDefined();
    expect(existsSync(lockPath)).toBe(true);
    expect(acquireUpstreamLock(lockPath, now)).toBeUndefined();
  });

  test("the handle's token is the lock file's exact content", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const handle = mustAcquire(lockPath, Date.now());
    expect(handle.lockPath).toBe(lockPath);
    expect(readFileSync(lockPath, "utf8")).toBe(handle.token);
  });

  test("a lock older than the stale window is stolen under a fresh token", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const now = Date.now();
    const first = mustAcquire(lockPath, now);
    ageStale(lockPath, now);

    const second = mustAcquire(lockPath, now);
    expect(second.token).not.toBe(first.token);
    expect(readFileSync(lockPath, "utf8")).toBe(second.token);
  });

  test("a successful steal leaves no takeover residue", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    expect(acquireUpstreamLock(lockPath, now)).toBeDefined();
    ageStale(lockPath, now);
    expect(acquireUpstreamLock(lockPath, now)).toBeDefined();
    expect(readdirSync(dir)).toEqual([basename(lockPath)]);
  });

  test("a lock inside the stale window is not stolen", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const now = Date.now();
    expect(acquireUpstreamLock(lockPath, now)).toBeDefined();
    const freshSeconds = (now - (UPSTREAM_LOCK_STALE_MS - 1000)) / 1000;
    utimesSync(lockPath, freshSeconds, freshSeconds);
    expect(acquireUpstreamLock(lockPath, now)).toBeUndefined();
  });

  test("creates the cache directory when acquiring for the first time", () => {
    const lockPath = join(tmp(), "nested", "stable.json.lock");
    expect(acquireUpstreamLock(lockPath, Date.now())).toBeDefined();
    expect(existsSync(lockPath)).toBe(true);
  });

  test("a losing stealer neither owns nor destroys a fresh lock", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    mustAcquire(lockPath, now);
    const before = readFileSync(lockPath);

    expect(takeOverStaleUpstreamLock(lockPath, now, "rival")).toBeUndefined();
    expect(readFileSync(lockPath)).toEqual(before);
    expect(readdirSync(dir)).toEqual([basename(lockPath)]);
  });

  test("releaseUpstreamLock is ownership-checked", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    const b = mustAcquire(lockPath, now);

    releaseUpstreamLock(a);
    expect(existsSync(lockPath)).toBe(true);
    expect(readFileSync(lockPath, "utf8")).toBe(b.token);

    releaseUpstreamLock(b);
    expect(existsSync(lockPath)).toBe(false);
  });

  test("releaseUpstreamLock is idempotent, and a never-created lock is a no-op", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const handle = mustAcquire(lockPath, 1);
    releaseUpstreamLock(handle);
    expect(existsSync(lockPath)).toBe(false);
    releaseUpstreamLock(handle);
    expect(existsSync(lockPath)).toBe(false);

    const absent = join(tmp(), "never-existed.lock");
    expect(() => releaseUpstreamLock({ lockPath: absent, token: "t" })).not.toThrow();
    expect(existsSync(absent)).toBe(false);
  });
});

describe("refreshUpstreamState", () => {
  const now = 1_700_000_000_000;

  test("writes and returns the fetched channel head", async () => {
    const cacheDir = tmp();
    const state = await refreshUpstreamState({
      channel: "stable",
      cacheDir,
      now,
      fetchChannelInfo: async () => ({ version: "1.13.0", sha1: "abc" }),
    });
    const expected: UpstreamCheckState = {
      checkedAt: now,
      channel: "stable",
      latestVersion: "1.13.0",
    };
    expect(state).toEqual(expected);
    expect(readUpstreamState(upstreamCachePath({ channel: "stable", cacheDir }))).toEqual(expected);
    expect(existsSync(upstreamLockPath({ channel: "stable", cacheDir }))).toBe(false);
  });

  test("a rejecting fetch is silent and leaves a pre-existing state byte-identical", async () => {
    const cacheDir = tmp();
    const statePath = upstreamCachePath({ channel: "stable", cacheDir });
    writeUpstreamState(statePath, {
      checkedAt: 1,
      channel: "stable",
      latestVersion: "1.12.0",
    });
    const before = readFileSync(statePath);

    const state = await refreshUpstreamState({
      channel: "stable",
      cacheDir,
      now,
      fetchChannelInfo: async () => {
        throw new Error("offline");
      },
    });
    expect(state).toBeUndefined();
    expect(readFileSync(statePath)).toEqual(before);
    expect(existsSync(upstreamLockPath({ channel: "stable", cacheDir }))).toBe(false);
  });

  test("writes no state file at all when the first fetch rejects", async () => {
    const cacheDir = tmp();
    const state = await refreshUpstreamState({
      channel: "beta",
      cacheDir,
      now,
      fetchChannelInfo: async () => {
        throw new Error("offline");
      },
    });
    expect(state).toBeUndefined();
    expect(existsSync(upstreamCachePath({ channel: "beta", cacheDir }))).toBe(false);
  });

  test("a lock held by another session skips without fetching", async () => {
    const cacheDir = tmp();
    const held = Date.now();
    const lockPath = upstreamLockPath({ channel: "stable", cacheDir });
    expect(acquireUpstreamLock(lockPath, held)).toBeDefined();

    const state = await refreshUpstreamState({
      channel: "stable",
      cacheDir,
      now: held,
      fetchChannelInfo: noFetch,
    });
    expect(state).toBeUndefined();
    expect(existsSync(lockPath)).toBe(true);
  });

  test("a state refreshed inside the interval is returned without fetching", async () => {
    const cacheDir = tmp();
    const statePath = upstreamCachePath({ channel: "stable", cacheDir });
    const cached: UpstreamCheckState = {
      checkedAt: now,
      channel: "stable",
      latestVersion: "1.13.0",
    };
    writeUpstreamState(statePath, cached);
    const before = readFileSync(statePath);

    const state = await refreshUpstreamState({
      channel: "stable",
      cacheDir,
      now,
      fetchChannelInfo: noFetch,
    });
    expect(state).toEqual(cached);
    expect(readFileSync(statePath)).toEqual(before);
    expect(existsSync(upstreamLockPath({ channel: "stable", cacheDir }))).toBe(false);
  });

  test("two sequential refreshes at the same instant fetch exactly once", async () => {
    const cacheDir = tmp();
    let calls = 0;
    const opts = {
      channel: "stable",
      cacheDir,
      now,
      fetchChannelInfo: async () => {
        calls += 1;
        return { version: "1.13.0", sha1: "abc" };
      },
    } as const;

    const first = await refreshUpstreamState(opts);
    const second = await refreshUpstreamState(opts);
    const expected: UpstreamCheckState = {
      checkedAt: now,
      channel: "stable",
      latestVersion: "1.13.0",
    };
    expect(calls).toBe(1);
    expect(first).toEqual(expected);
    expect(second).toEqual(expected);
  });

  test("intervalMs is honored under the lock", async () => {
    const cacheDir = tmp();
    const cached: UpstreamCheckState = {
      checkedAt: now - 5,
      channel: "stable",
      latestVersion: "1.12.0",
    };
    writeUpstreamState(upstreamCachePath({ channel: "stable", cacheDir }), cached);

    const skipped = await refreshUpstreamState({
      channel: "stable",
      cacheDir,
      now,
      intervalMs: 10,
      fetchChannelInfo: noFetch,
    });
    expect(skipped).toEqual(cached);

    const refreshed = await refreshUpstreamState({
      channel: "stable",
      cacheDir,
      now,
      intervalMs: 5,
      fetchChannelInfo: async () => ({ version: "1.13.0", sha1: "abc" }),
    });
    expect(refreshed).toEqual({ checkedAt: now, channel: "stable", latestVersion: "1.13.0" });
  });

  test("a cached state older than the interval still reaches the fetcher", async () => {
    const cacheDir = tmp();
    writeUpstreamState(upstreamCachePath({ channel: "stable", cacheDir }), {
      checkedAt: 1,
      channel: "stable",
      latestVersion: "1.12.0",
    });

    const state = await refreshUpstreamState({
      channel: "stable",
      cacheDir,
      now,
      fetchChannelInfo: async () => ({ version: "1.13.0", sha1: "abc" }),
    });
    expect(state).toEqual({ checkedAt: now, channel: "stable", latestVersion: "1.13.0" });
  });

  test("resolves the requested channel, not a hardcoded one", async () => {
    const cacheDir = tmp();
    const seen: string[] = [];
    const state = await refreshUpstreamState({
      channel: "alpha",
      cacheDir,
      now,
      fetchChannelInfo: async (channel) => {
        seen.push(channel);
        return { version: "1.14.0", sha1: "def" };
      },
    });
    expect(seen).toEqual(["alpha"]);
    expect(state).toEqual({ checkedAt: now, channel: "alpha", latestVersion: "1.14.0" });
  });
});

describe("readCachedUpstreamLatest", () => {
  test("maps a cached state to its version, and a missing one to undefined", () => {
    const cacheDir = tmp();
    expect(readCachedUpstreamLatest({ channel: "stable", cacheDir })).toBeUndefined();
    writeUpstreamState(upstreamCachePath({ channel: "stable", cacheDir }), {
      checkedAt: 1,
      channel: "stable",
      latestVersion: "1.13.0",
    });
    expect(readCachedUpstreamLatest({ channel: "stable", cacheDir })).toBe("1.13.0");
    expect(readCachedUpstreamLatest({ channel: "beta", cacheDir })).toBeUndefined();
  });
});
