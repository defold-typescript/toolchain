import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import * as path from "node:path";
import type { DefoldChannel } from "./defold-target";

export const UPSTREAM_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const UPSTREAM_REFRESH_TIMEOUT_MS = 1500;

export interface UpstreamCacheState {
  readonly checkedAt: number;
  readonly channel: string;
  readonly latestVersion: string;
}

// Mirrors `bobCacheDir`: a `DEFOLD_TYPESCRIPT_CACHE` override wins, else the XDG
// cache home, else `~/.cache`. The notice is a per-user convenience, so its state
// lives beside the other caches rather than in any project.
export function upstreamNoticeCacheDir(
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

export function upstreamNoticeCachePath(channel: DefoldChannel, cacheDir: string): string {
  return path.join(cacheDir, `${channel}.json`);
}

// Every failure mode — absent, truncated, half-written, hand-edited — collapses
// to `undefined`, which the caller reads as "no cached latest, refresh due". A
// convenience notice must never be the thing that fails a build.
export function readUpstreamCache(file: string): UpstreamCacheState | undefined {
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }
  const { checkedAt, channel, latestVersion } = parsed as Record<string, unknown>;
  if (typeof checkedAt !== "number" || !Number.isFinite(checkedAt)) {
    return undefined;
  }
  if (typeof channel !== "string" || typeof latestVersion !== "string") {
    return undefined;
  }
  return { checkedAt, channel, latestVersion };
}

// Absolute distance, so a clock that moved backwards past a full interval is due
// rather than parked until it catches up.
export function upstreamRefreshDue(
  state: UpstreamCacheState | undefined,
  now: number,
  intervalMs: number = UPSTREAM_REFRESH_INTERVAL_MS,
): boolean {
  if (state === undefined) {
    return true;
  }
  return Math.abs(now - state.checkedAt) >= intervalMs;
}

export interface RefreshUpstreamCacheOptions {
  readonly channel: DefoldChannel;
  readonly path: string;
  readonly now: number;
  readonly fetchChannelInfo: (channel: DefoldChannel) => Promise<{ version: string; sha1: string }>;
  readonly timeoutMs?: number;
}

// `checkedAt` is stamped only on a fetch that actually answered: stamping a
// failed one would silence the notice for a whole interval after a single
// offline run.
export async function refreshUpstreamCache(opts: RefreshUpstreamCacheOptions): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? UPSTREAM_REFRESH_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const info = await Promise.race([
      opts.fetchChannelInfo(opts.channel),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("upstream check timed out")), timeoutMs);
      }),
    ]);
    if (typeof info?.version !== "string" || info.version === "") {
      return;
    }
    writeUpstreamCache(opts.path, {
      checkedAt: opts.now,
      channel: opts.channel,
      latestVersion: info.version,
    });
  } catch {
    // Offline, rate-limited, timed out, or unwritable: the previous state stays
    // readable and the next run retries.
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

// A unique temp name plus `renameSync` means a concurrent reader sees either the
// old file or the new one, never a half-written one — the reason this needs no
// lockfile or reservation protocol.
function writeUpstreamCache(file: string, state: UpstreamCacheState): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    writeFileSync(tmp, `${JSON.stringify(state)}\n`);
    renameSync(tmp, file);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}
