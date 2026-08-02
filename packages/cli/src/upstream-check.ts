import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import { DEFOLD_CHANNELS, type DefoldChannel } from "./defold-target";

export interface UpstreamCheckState {
  readonly checkedAt: number;
  readonly channel: DefoldChannel;
  readonly latestVersion: string;
}

export interface UpstreamCacheKey {
  readonly channel: DefoldChannel;
  readonly cacheDir: string;
}

// Mirrors `bobCacheDir`/`engineCacheDir`: a `DEFOLD_TYPESCRIPT_CACHE` override
// wins, else the XDG cache home, else `~/.cache`.
export function upstreamCacheDir(
  env: NodeJS.ProcessEnv = process.env,
  home: () => string = homedir,
): string {
  if (env.DEFOLD_TYPESCRIPT_CACHE) {
    return path.join(env.DEFOLD_TYPESCRIPT_CACHE, "upstream");
  }
  return path.join(
    env.XDG_CACHE_HOME ?? path.join(home(), ".cache"),
    "defold-typescript",
    "upstream",
  );
}

// One file per channel, so sessions tracking different channels never contend
// for the same state file or the same lock.
export function upstreamCachePath(key: UpstreamCacheKey): string {
  return path.join(key.cacheDir, `${key.channel}.json`);
}

export function upstreamLockPath(key: UpstreamCacheKey): string {
  return `${upstreamCachePath(key)}.lock`;
}

function isDefoldChannel(v: unknown): v is DefoldChannel {
  return (DEFOLD_CHANNELS as readonly unknown[]).includes(v);
}

// Sync and total: this read sits on the hot path of every command that may emit
// the notice, so a hand-corrupted or half-written cache file must degrade to
// "nothing cached" rather than throw or await.
export function readUpstreamState(statePath: string): UpstreamCheckState | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return undefined;
  }
  const { checkedAt, channel, latestVersion } = raw as Record<string, unknown>;
  if (typeof checkedAt !== "number" || !Number.isFinite(checkedAt)) {
    return undefined;
  }
  if (!isDefoldChannel(channel) || typeof latestVersion !== "string" || latestVersion === "") {
    return undefined;
  }
  return { checkedAt, channel, latestVersion };
}

export function writeUpstreamState(statePath: string, state: UpstreamCheckState): void {
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

export const UPSTREAM_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

// A `checkedAt` in the future (clock skew, a rolled-back clock) yields a
// negative difference, so it reads as "checked recently" instead of storming
// upstream on every invocation.
export function shouldRefreshUpstream(
  state: UpstreamCheckState | undefined,
  now: number,
  intervalMs: number = UPSTREAM_CHECK_INTERVAL_MS,
): boolean {
  if (state === undefined) {
    return true;
  }
  return now - state.checkedAt >= intervalMs;
}

export const UPSTREAM_LOCK_STALE_MS = 60_000;

// The lock's identity is its content, not its existence: a holder proves
// ownership by matching the token it wrote, so a lock stolen as stale is never
// released by the session it was taken from.
export interface UpstreamLockHandle {
  readonly lockPath: string;
  readonly token: string;
}

let lockCounter = 0;

// Unique per acquire within a process and across processes by pid, with no `:`
// or path separator, because the token also names the owner marker and the
// claim artifact.
function nextLockToken(): string {
  return `${process.pid}-${++lockCounter}`;
}

// The second, uniquely-named handle every owner holds on its own ownership.
// POSIX offers no conditional unlink of the canonical path, so ownership is
// transferred by renaming this marker instead — see `claimStaleUpstreamLock`.
export function upstreamLockOwnerPath(lockPath: string, token: string): string {
  return `${lockPath}.${token}.own`;
}

function upstreamLockClaimPath(lockPath: string, token: string): string {
  return `${lockPath}.${token}.claim`;
}

// Compare-and-swap on a lock's ownership: renaming the victim's marker away
// succeeds for exactly one caller, so of a release and a stale takeover racing
// the same owner only one proceeds and the other declines untouched.
export function claimStaleUpstreamLock(
  lockPath: string,
  victimToken: string,
  token: string,
): boolean {
  try {
    renameSync(
      upstreamLockOwnerPath(lockPath, victimToken),
      upstreamLockClaimPath(lockPath, token),
    );
    return true;
  } catch {
    return false;
  }
}

// A claim artifact inside the stale window is a takeover still in flight, which
// already holds the claim we would be racing for.
function hasLiveUpstreamClaim(lockPath: string, now: number): boolean {
  const dir = path.dirname(lockPath);
  const prefix = `${path.basename(lockPath)}.`;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (!entry.startsWith(prefix) || !entry.endsWith(".claim")) {
      continue;
    }
    try {
      if (statSync(path.join(dir, entry)).mtimeMs >= now - UPSTREAM_LOCK_STALE_MS) {
        return true;
      }
    } catch {
      // Vanished mid-scan: the takeover holding it has already finished.
    }
  }
  return false;
}

// Steal a stale lock in place. The canonical path is never vacated, so a rival
// can neither find it free nor have a fresh replacement captured out from under
// it — the only contended resource is the victim's marker.
export function takeOverStaleUpstreamLock(
  lockPath: string,
  now: number,
  token: string,
): UpstreamLockHandle | undefined {
  let victimToken: string;
  try {
    if (statSync(lockPath).mtimeMs >= now - UPSTREAM_LOCK_STALE_MS) {
      return undefined;
    }
    victimToken = readFileSync(lockPath, "utf8");
  } catch {
    return undefined;
  }

  if (!claimStaleUpstreamLock(lockPath, victimToken, token)) {
    if (hasLiveUpstreamClaim(lockPath, now)) {
      return undefined;
    }
    // No live claim and no marker means a crash orphaned the lock, so re-adopt
    // the marker on the victim's behalf; the exclusive create is what serializes
    // two recoverers. Residual exposure: a recoverer that passed this scan
    // before a rival's claim existed can re-adopt after that rival finished and
    // overwrite the lock, leaving the loser holding a token that is no longer
    // the lock's content. Its release re-reads and finds the mismatch, so the
    // worst case is one duplicate upstream fetch after a crash — never a
    // deleted or displaced lock.
    try {
      writeFileSync(upstreamLockOwnerPath(lockPath, victimToken), victimToken, { flag: "wx" });
    } catch {
      return undefined;
    }
    if (!claimStaleUpstreamLock(lockPath, victimToken, token)) {
      return undefined;
    }
  }

  const ownerPath = upstreamLockOwnerPath(lockPath, token);
  try {
    writeFileSync(ownerPath, token, { flag: "wx" });
    // In-place overwrite, not a rename: the victim provably cannot release (its
    // marker is ours now) and no plain acquire can take a non-empty path.
    writeFileSync(lockPath, token);
    return { lockPath, token };
  } catch {
    try {
      unlinkSync(ownerPath);
    } catch {
      // Never created.
    }
    return undefined;
  } finally {
    try {
      unlinkSync(upstreamLockClaimPath(lockPath, token));
    } catch {
      // Never claimed.
    }
  }
}

// Exclusive-create lock with stale detection. Returns a handle rather than
// waiting: the refresh is advisory, so a session that loses the race skips it
// entirely instead of blocking the command it is attached to. Any unexpected
// error also returns `undefined` — the lock must never break the command.
export function acquireUpstreamLock(lockPath: string, now: number): UpstreamLockHandle | undefined {
  const token = nextLockToken();
  const ownerPath = upstreamLockOwnerPath(lockPath, token);
  try {
    // The very first check on a machine runs before the cache dir exists; without
    // this the exclusive create fails ENOENT and the refresh never happens.
    mkdirSync(path.dirname(lockPath), { recursive: true });
    // Marker before lock: a lock is never observable without the ownership
    // handle that release and takeover compare-and-swap on.
    writeFileSync(ownerPath, token, { flag: "wx" });
  } catch {
    return undefined;
  }
  try {
    writeFileSync(lockPath, token, { flag: "wx" });
    return { lockPath, token };
  } catch (err) {
    try {
      unlinkSync(ownerPath);
    } catch {
      // Never created.
    }
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      return undefined;
    }
  }
  return takeOverStaleUpstreamLock(lockPath, now, token);
}

export function releaseUpstreamLock(handle: UpstreamLockHandle): void {
  const ownerPath = upstreamLockOwnerPath(handle.lockPath, handle.token);
  const releasedPath = `${ownerPath}.released`;
  try {
    // Renaming our own marker away is the compare-and-swap: it fails exactly
    // when a takeover already claimed us (or we already released), and on
    // success no takeover can target us and no plain acquire can take the
    // non-empty canonical path — so the lock is provably still ours.
    renameSync(ownerPath, releasedPath);
  } catch {
    return;
  }
  try {
    // Cheap identity re-proof; it also covers the orphan-recovery corner where
    // a second recoverer overwrote the lock under us.
    if (readFileSync(handle.lockPath, "utf8") === handle.token) {
      unlinkSync(handle.lockPath);
    }
  } catch {
    // Already gone: the lock never existed, or a recoverer removed it.
  }
  try {
    unlinkSync(releasedPath);
  } catch {
    // Already gone.
  }
}

export interface UpstreamRefreshOptions extends UpstreamCacheKey {
  readonly now: number;
  readonly intervalMs?: number;
  readonly fetchChannelInfo: (channel: DefoldChannel) => Promise<{
    version: string;
    sha1: string;
  }>;
}

// Best-effort: never throws, never rejects. A held lock, an offline machine, or
// an unreadable cache dir all resolve to `undefined`, leaving any previously
// cached state exactly as it was.
export async function refreshUpstreamState(
  opts: UpstreamRefreshOptions,
): Promise<UpstreamCheckState | undefined> {
  const handle = acquireUpstreamLock(upstreamLockPath(opts), opts.now);
  if (handle === undefined) {
    return undefined;
  }
  try {
    // Re-read the throttle under the lock. Sessions that all observed the same
    // stale `checkedAt` serialize here rather than dedupe, so without this every
    // one of them fetches in turn and the at-most-one-request-per-interval
    // invariant holds only for the first.
    const cached = readUpstreamState(upstreamCachePath(opts));
    if (!shouldRefreshUpstream(cached, opts.now, opts.intervalMs)) {
      return cached;
    }
    const info = await opts.fetchChannelInfo(opts.channel);
    const state: UpstreamCheckState = {
      checkedAt: opts.now,
      channel: opts.channel,
      latestVersion: info.version,
    };
    writeUpstreamState(upstreamCachePath(opts), state);
    return state;
  } catch {
    return undefined;
  } finally {
    releaseUpstreamLock(handle);
  }
}

// The read-side entry point the dispatch-wiring slice consumes to feed
// `describeUpstreamReleaseNotice` its `latest`.
export function readCachedUpstreamLatest(key: UpstreamCacheKey): string | undefined {
  return readUpstreamState(upstreamCachePath(key))?.latestVersion;
}
