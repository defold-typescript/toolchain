import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
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

// Exclusive-create lock with stale detection. Returns a boolean rather than
// waiting: the refresh is advisory, so a session that loses the race skips it
// entirely instead of blocking the command it is attached to. Any unexpected
// error also returns `false` — the lock must never break the command.
export function acquireUpstreamLock(lockPath: string, now: number): boolean {
  try {
    // The very first check on a machine runs before the cache dir exists; without
    // this the exclusive create fails ENOENT and the refresh never happens.
    mkdirSync(path.dirname(lockPath), { recursive: true });
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      return false;
    }
  }
  try {
    if (statSync(lockPath).mtimeMs >= now - UPSTREAM_LOCK_STALE_MS) {
      return false;
    }
    unlinkSync(lockPath);
    writeFileSync(lockPath, String(process.pid), { flag: "wx" });
    return true;
  } catch {
    return false;
  }
}

export function releaseUpstreamLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    // Already gone: released twice, or stolen as stale by another session.
  }
}

export interface UpstreamRefreshOptions extends UpstreamCacheKey {
  readonly now: number;
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
  const lockPath = upstreamLockPath(opts);
  if (!acquireUpstreamLock(lockPath, opts.now)) {
    return undefined;
  }
  try {
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
    releaseUpstreamLock(lockPath);
  }
}

// The read-side entry point the dispatch-wiring slice consumes to feed
// `describeUpstreamReleaseNotice` its `latest`.
export function readCachedUpstreamLatest(key: UpstreamCacheKey): string | undefined {
  return readUpstreamState(upstreamCachePath(key))?.latestVersion;
}
