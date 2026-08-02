import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import {
  acquireUpstreamLock,
  captureClaimedUpstreamLock,
  claimStaleUpstreamLock,
  readCachedUpstreamLatest,
  readUpstreamState,
  refreshUpstreamState,
  releaseUpstreamLock,
  reserveUpstreamRequest,
  shouldRefreshUpstream,
  takeOverStaleUpstreamLock,
  UPSTREAM_CHECK_INTERVAL_MS,
  UPSTREAM_LOCK_STALE_MS,
  type UpstreamCheckState,
  type UpstreamLockHandle,
  upstreamCacheDir,
  upstreamCachePath,
  upstreamLockOwnerPath,
  upstreamLockPath,
  upstreamRequestReservationPath,
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

// Finish what a won `claimStaleUpstreamLock` started, through the same call
// `takeOverStaleUpstreamLock` ends at. Lets a proof hold a takeover mid-flight
// and resume it after mutating the directory the way a race would.
function mustCapture(
  lockPath: string,
  victimToken: string,
  token: string,
  now: number,
): UpstreamLockHandle {
  const handle = captureClaimedUpstreamLock(lockPath, victimToken, token, now);
  if (handle === undefined) {
    throw new Error(`expected to capture ${lockPath} claimed from ${victimToken}`);
  }
  return handle;
}

function dirEntries(dir: string): string[] {
  return readdirSync(dir).sort();
}

function expectedEntries(lockPath: string, ...tokens: string[]): string[] {
  return [
    basename(lockPath),
    ...tokens.map((token) => basename(upstreamLockOwnerPath(lockPath, token))),
  ].sort();
}

describe("acquireUpstreamLock", () => {
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

  test("an acquired lock carries a marker named by, and holding, its owner token", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const handle = mustAcquire(lockPath, Date.now());
    const ownerPath = upstreamLockOwnerPath(lockPath, handle.token);

    expect(ownerPath).toBe(`${lockPath}.${handle.token}.own`);
    expect(readFileSync(ownerPath, "utf8")).toBe(handle.token);
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, handle.token));
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

  test("a successful steal leaves the lock and only the winner's marker", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    expect(acquireUpstreamLock(lockPath, now)).toBeDefined();
    ageStale(lockPath, now);
    const winner = mustAcquire(lockPath, now);
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, winner.token));

    releaseUpstreamLock(winner);
    expect(dirEntries(dir)).toEqual([]);
  });

  test("a lock inside the stale window is not stolen", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    const held = mustAcquire(lockPath, now);
    const freshSeconds = (now - (UPSTREAM_LOCK_STALE_MS - 1000)) / 1000;
    utimesSync(lockPath, freshSeconds, freshSeconds);
    const before = readFileSync(lockPath);

    expect(acquireUpstreamLock(lockPath, now)).toBeUndefined();
    expect(readFileSync(lockPath)).toEqual(before);
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, held.token));
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
    const held = mustAcquire(lockPath, now);
    const before = readFileSync(lockPath);

    expect(takeOverStaleUpstreamLock(lockPath, now, "rival")).toBeUndefined();
    expect(readFileSync(lockPath)).toEqual(before);
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, held.token));
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
    expect(existsSync(upstreamLockOwnerPath(lockPath, b.token))).toBe(false);
  });

  test("releaseUpstreamLock is idempotent, and a never-created lock is a no-op", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const handle = mustAcquire(lockPath, 1);
    releaseUpstreamLock(handle);
    expect(dirEntries(dir)).toEqual([]);
    releaseUpstreamLock(handle);
    expect(dirEntries(dir)).toEqual([]);

    const absentDir = tmp();
    const absent = join(absentDir, "never-existed.lock");
    expect(() => releaseUpstreamLock({ lockPath: absent, token: "t" })).not.toThrow();
    expect(dirEntries(absentDir)).toEqual([]);
  });

  test("release on an already-claimed marker touches nothing", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);

    expect(claimStaleUpstreamLock(lockPath, a.token, "rival")).toBe(true);
    const before = readFileSync(lockPath);

    releaseUpstreamLock(a);
    expect(readFileSync(lockPath)).toEqual(before);
    expect(existsSync(upstreamLockOwnerPath(lockPath, a.token))).toBe(false);
  });

  test("a displaced owner's release cannot delete its successor's lock", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    expect(claimStaleUpstreamLock(lockPath, a.token, "rival")).toBe(true);
    const rival = mustCapture(lockPath, a.token, "rival", now);

    releaseUpstreamLock(a);
    expect(readFileSync(lockPath, "utf8")).toBe(rival.token);
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, rival.token));
  });

  test("a stale check that raced a replacement cannot claim the fresh owner", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    const c = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    releaseUpstreamLock(c);
    const d = mustAcquire(lockPath, now);
    const lockBefore = readFileSync(lockPath);
    const markerBefore = readFileSync(upstreamLockOwnerPath(lockPath, d.token));

    expect(claimStaleUpstreamLock(lockPath, c.token, "rival")).toBe(false);
    expect(readFileSync(lockPath)).toEqual(lockBefore);
    expect(readFileSync(upstreamLockOwnerPath(lockPath, d.token))).toEqual(markerBefore);
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, d.token));
  });

  test("the canonical path is never free mid-takeover", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    expect(claimStaleUpstreamLock(lockPath, a.token, "rival")).toBe(true);
    const before = readFileSync(lockPath);

    expect(acquireUpstreamLock(lockPath, now)).toBeUndefined();
    expect(readFileSync(lockPath)).toEqual(before);
  });

  test("two stealers of one stale lock cannot both win the claim", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);

    expect(claimStaleUpstreamLock(lockPath, a.token, "s1")).toBe(true);
    expect(claimStaleUpstreamLock(lockPath, a.token, "s2")).toBe(false);
  });

  test("a second takeover at the same instant sees the stolen lock as fresh", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const now = Date.now();
    mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    expect(acquireUpstreamLock(lockPath, now)).toBeDefined();

    expect(takeOverStaleUpstreamLock(lockPath, now, "late")).toBeUndefined();
  });

  test("a crash-orphaned lock is recovered by re-adopting its marker", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    unlinkSync(upstreamLockOwnerPath(lockPath, a.token));

    const recovered = takeOverStaleUpstreamLock(lockPath, now, "recoverer");
    expect(recovered?.token).toBe("recoverer");
    expect(readFileSync(lockPath, "utf8")).toBe("recoverer");
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, "recoverer"));
  });

  test("two sequential orphan recoveries do not both win", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    unlinkSync(upstreamLockOwnerPath(lockPath, a.token));

    expect(takeOverStaleUpstreamLock(lockPath, now, "r1")).toBeDefined();
    expect(takeOverStaleUpstreamLock(lockPath, now, "r2")).toBeUndefined();
  });

  test("an orphaned lock held by a live claim is not recovered", () => {
    const lockPath = join(tmp(), "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    expect(claimStaleUpstreamLock(lockPath, a.token, "rival")).toBe(true);
    const before = readFileSync(lockPath);

    expect(takeOverStaleUpstreamLock(lockPath, now, "late")).toBeUndefined();
    expect(readFileSync(lockPath)).toEqual(before);
  });

  test("a replacement captured after the stale observation survives, and stays releasable", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    // The state a stat-then-read race leaves behind: the staleness verdict is
    // C's, the token read is D's.
    const c = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    releaseUpstreamLock(c);
    const d = mustAcquire(lockPath, now);
    const before = readFileSync(lockPath);

    expect(claimStaleUpstreamLock(lockPath, d.token, "rival")).toBe(true);
    expect(captureClaimedUpstreamLock(lockPath, d.token, "rival", now)).toBeUndefined();
    expect(readFileSync(lockPath)).toEqual(before);
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, d.token));

    releaseUpstreamLock(d);
    expect(dirEntries(dir)).toEqual([]);
  });

  test("a losing contender's re-adopted marker cannot overwrite the winner", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    const winner = takeOverStaleUpstreamLock(lockPath, now, "w");
    expect(winner?.token).toBe("w");
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, "w"));

    // The loser resumes at the orphan-recovery branch with the token it observed
    // before the winner finished: both the re-adopt and the claim succeed.
    writeFileSync(upstreamLockOwnerPath(lockPath, a.token), a.token, { flag: "wx" });
    expect(claimStaleUpstreamLock(lockPath, a.token, "loser")).toBe(true);
    expect(captureClaimedUpstreamLock(lockPath, a.token, "loser", now)).toBeUndefined();
    expect(readFileSync(lockPath, "utf8")).toBe("w");
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, "w"));

    if (winner !== undefined) {
      releaseUpstreamLock(winner);
    }
    expect(dirEntries(dir)).toEqual([]);
  });

  test("a whole-function replay by the loser is silent", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    expect(takeOverStaleUpstreamLock(lockPath, now, "w")).toBeDefined();
    const before = readFileSync(lockPath);

    expect(takeOverStaleUpstreamLock(lockPath, now, "loser")).toBeUndefined();
    expect(readFileSync(lockPath)).toEqual(before);
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, "w"));
  });

  test("a displaced owner's release before the capture leaves the takeover completable", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    expect(claimStaleUpstreamLock(lockPath, a.token, "rival")).toBe(true);
    const before = readFileSync(lockPath);

    releaseUpstreamLock(a);
    expect(readFileSync(lockPath)).toEqual(before);
    expect(existsSync(upstreamLockOwnerPath(lockPath, a.token))).toBe(false);

    const rival = mustCapture(lockPath, a.token, "rival", now);
    expect(readFileSync(lockPath, "utf8")).toBe(rival.token);
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, rival.token));
  });

  test("a displaced owner's release after the capture deletes nothing", () => {
    const dir = tmp();
    const lockPath = join(dir, "stable.json.lock");
    const now = Date.now();
    const a = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    expect(claimStaleUpstreamLock(lockPath, a.token, "rival")).toBe(true);
    const rival = mustCapture(lockPath, a.token, "rival", now);

    releaseUpstreamLock(a);
    expect(readFileSync(lockPath, "utf8")).toBe(rival.token);
    expect(dirEntries(dir)).toEqual(expectedEntries(lockPath, rival.token));

    releaseUpstreamLock(rival);
    expect(dirEntries(dir)).toEqual([]);
  });
});

describe("upstreamRequestReservationPath / reserveUpstreamRequest", () => {
  const now = 1_700_000_000_000;
  const intervalMs = 1000;
  const bucket = Math.floor(now / intervalMs);

  test("the reservation path is the channel state path plus its interval bucket", () => {
    const cacheDir = "/c";
    expect(upstreamRequestReservationPath({ channel: "stable", cacheDir }, now, intervalMs)).toBe(
      join("/c", `stable.json.${bucket}.req`),
    );
    expect(upstreamRequestReservationPath({ channel: "beta", cacheDir }, now, intervalMs)).toBe(
      join("/c", `beta.json.${bucket}.req`),
    );
  });

  test("the default interval is the one shouldRefreshUpstream quantizes", () => {
    const key = { channel: "stable", cacheDir: "/c" } as const;
    expect(upstreamRequestReservationPath(key, now)).toBe(
      upstreamRequestReservationPath(key, now, UPSTREAM_CHECK_INTERVAL_MS),
    );
  });

  test("the first reservation in a bucket wins and a second at the same instant loses", () => {
    const key = { channel: "stable", cacheDir: tmp() } as const;
    const reservationPath = upstreamRequestReservationPath(key, now, intervalMs);

    expect(reserveUpstreamRequest(key, now, intervalMs)).toBe(true);
    expect(existsSync(reservationPath)).toBe(true);
    const before = readFileSync(reservationPath);

    expect(reserveUpstreamRequest(key, now, intervalMs)).toBe(false);
    expect(readFileSync(reservationPath)).toEqual(before);
  });

  test("a later bucket is winnable, and aging a reservation never makes its own bucket re-winnable", () => {
    const key = { channel: "stable", cacheDir: tmp() } as const;
    expect(reserveUpstreamRequest(key, now, intervalMs)).toBe(true);
    expect(reserveUpstreamRequest(key, now + intervalMs, intervalMs)).toBe(true);

    // Expiry is by name, not by mtime: the artifact a stale-window check would
    // hand back stays lost.
    ageStale(upstreamRequestReservationPath(key, now, intervalMs), now);
    expect(reserveUpstreamRequest(key, now, intervalMs)).toBe(false);
  });

  test("winning a bucket prunes reservations two or more buckets old and nothing else", () => {
    const cacheDir = tmp();
    const key = { channel: "stable", cacheDir } as const;
    const statePath = upstreamCachePath(key);
    const lockPath = upstreamLockPath(key);
    const ownerPath = upstreamLockOwnerPath(lockPath, "tok");
    const claimPath = `${lockPath}.other.claim`;

    writeUpstreamState(statePath, { checkedAt: 1, channel: "stable", latestVersion: "1.12.0" });
    writeFileSync(lockPath, "tok");
    writeFileSync(ownerPath, "tok");
    writeFileSync(claimPath, "other");
    writeFileSync(`${statePath}.${bucket - 2}.req`, "two buckets old");
    writeFileSync(`${statePath}.${bucket - 1}.req`, "one bucket old");

    expect(reserveUpstreamRequest(key, now, intervalMs)).toBe(true);

    expect(dirEntries(cacheDir)).toEqual(
      [
        basename(statePath),
        basename(lockPath),
        basename(ownerPath),
        basename(claimPath),
        `${basename(statePath)}.${bucket - 1}.req`,
        `${basename(statePath)}.${bucket}.req`,
      ].sort(),
    );
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

  test("a completed refresh leaves the state file and the interval's reservation behind", async () => {
    const cacheDir = tmp();
    const key = { channel: "stable", cacheDir } as const;
    await refreshUpstreamState({
      ...key,
      now,
      fetchChannelInfo: async () => ({ version: "1.13.0", sha1: "abc" }),
    });
    expect(dirEntries(cacheDir)).toEqual(
      [basename(upstreamCachePath(key)), basename(upstreamRequestReservationPath(key, now))].sort(),
    );
    expect(
      dirEntries(cacheDir).filter((entry) => /\.(lock|own|claim|released)$/.test(entry)),
    ).toEqual([]);
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

  const parkedCache: UpstreamCheckState = {
    checkedAt: 1,
    channel: "stable",
    latestVersion: "1.12.0",
  };

  // Session A owns the lock legitimately and parks inside `fetchChannelInfo`;
  // the lock ages past the stale window while its request is still open, so B
  // steals it correctly. Runs B to completion, then lets A finish.
  async function stealFromParkedOwner(cacheDir: string) {
    const key = { channel: "stable", cacheDir } as const;
    const lockPath = upstreamLockPath(key);
    writeUpstreamState(upstreamCachePath(key), parkedCache);

    let calls = 0;
    let openGate!: () => void;
    const gate = new Promise<void>((resolve) => {
      openGate = resolve;
    });

    // An async function runs synchronously to its first await, so A already
    // holds the lock and sits inside the fetch once this expression returns.
    const a = refreshUpstreamState({
      ...key,
      now,
      fetchChannelInfo: async () => {
        calls += 1;
        await gate;
        return { version: "1.13.0", sha1: "abc" };
      },
    });
    const parked = { calls, locked: existsSync(lockPath) };

    ageStale(lockPath, now);
    const fromB = await refreshUpstreamState({ ...key, now, fetchChannelInfo: noFetch });
    const afterB = { calls, locked: existsSync(lockPath) };

    openGate();
    const fromA = await a;
    return { key, parked, fromB, afterB, fromA, calls };
  }

  test("a stale lock stolen from a parked owner cannot double-fetch", async () => {
    const r = await stealFromParkedOwner(tmp());
    expect(r.parked).toEqual({ calls: 1, locked: true });

    // B genuinely ran the recovery path: it took the aged lock over and released
    // it, which a session that merely failed to acquire could not have done. And
    // resolving to the cached state is the reservation-lost return, not the
    // silent-failure one.
    expect(r.afterB.locked).toBe(false);
    expect(r.fromB).toEqual(parkedCache);
    expect(r.calls).toBe(1);
    expect(r.fromA).toEqual({ checkedAt: now, channel: "stable", latestVersion: "1.13.0" });
  });

  test("both settle leaving only the state file and the interval's reservation", async () => {
    const cacheDir = tmp();
    const { key } = await stealFromParkedOwner(cacheDir);
    expect(dirEntries(cacheDir)).toEqual(
      [basename(upstreamCachePath(key)), basename(upstreamRequestReservationPath(key, now))].sort(),
    );
  });

  test("an aged claim that reads as abandoned still yields exactly one fetch", async () => {
    const cacheDir = tmp();
    const key = { channel: "stable", cacheDir } as const;
    const lockPath = upstreamLockPath(key);
    const victim = mustAcquire(lockPath, now);
    ageStale(lockPath, now);
    expect(claimStaleUpstreamLock(lockPath, victim.token, "a")).toBe(true);

    // Age the claim itself: the exact artifact `hasLiveUpstreamClaim` misreads as
    // abandoned, which is what lets a recoverer fabricate the victim's marker and
    // end up holding a lock the claimant also believes it can capture.
    const claimPath = `${lockPath}.a.claim`;
    ageStale(claimPath, now);

    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return { version: "1.13.0", sha1: "abc" };
    };
    const fresh: UpstreamCheckState = {
      checkedAt: now,
      channel: "stable",
      latestVersion: "1.13.0",
    };

    expect(await refreshUpstreamState({ ...key, now, fetchChannelInfo: fetcher })).toEqual(fresh);
    expect(calls).toBe(1);

    // The claimant resumes against a lock that is gone: it declines and drops its
    // claim, and a replay at the same instant adds no second request.
    expect(captureClaimedUpstreamLock(lockPath, victim.token, "a", now)).toBeUndefined();
    expect(existsSync(claimPath)).toBe(false);
    expect(await refreshUpstreamState({ ...key, now, fetchChannelInfo: fetcher })).toEqual(fresh);
    expect(calls).toBe(1);
    expect(dirEntries(cacheDir)).toEqual(
      [basename(upstreamCachePath(key)), basename(upstreamRequestReservationPath(key, now))].sort(),
    );
  });

  test("a rejecting fetch consumes the interval it attempted", async () => {
    const key = { channel: "stable", cacheDir: tmp() } as const;
    const rejected = await refreshUpstreamState({
      ...key,
      now,
      fetchChannelInfo: async () => {
        throw new Error("offline");
      },
    });
    expect(rejected).toBeUndefined();

    let retries = 0;
    const second = await refreshUpstreamState({
      ...key,
      now,
      fetchChannelInfo: async () => {
        retries += 1;
        return noFetch();
      },
    });
    expect(retries).toBe(0);
    expect(second).toBeUndefined();
  });

  test("the interval after a rejecting fetch is not burned", async () => {
    const key = { channel: "stable", cacheDir: tmp() } as const;
    const intervalMs = 1000;
    await refreshUpstreamState({
      ...key,
      now,
      intervalMs,
      fetchChannelInfo: async () => {
        throw new Error("offline");
      },
    });

    const state = await refreshUpstreamState({
      ...key,
      now: now + intervalMs,
      intervalMs,
      fetchChannelInfo: async () => ({ version: "1.13.0", sha1: "abc" }),
    });
    expect(state).toEqual({
      checkedAt: now + intervalMs,
      channel: "stable",
      latestVersion: "1.13.0",
    });
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
