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

// The second gate on the same interval, and the only one written *before* a
// request. One slot per channel: the window lives in the file's content, not in
// its name, so the reservation covers `[t, t + intervalMs)` measured from the
// attempt that took it rather than quantizing to a wall-clock bucket that a pair
// of sessions can sit either side of. The path is created once and afterwards
// only ever replaced whole by an atomic rename — never vacated, never truncated,
// so a concurrent reader cannot observe an empty or partial value.
export function upstreamRequestReservationPath(key: UpstreamCacheKey): string {
  return `${upstreamCachePath(key)}.req`;
}

// A sliding reservation cannot be identified by name, so the right to replace it
// is granted by an exclusive create keyed on the value being replaced: exactly
// one caller per predecessor can hold this. The file it names is not a receipt
// but the successor itself — staged complete, then renamed onto the canonical
// path — which makes it a single-use token, consumed by its author's own win and
// by nothing else. This is a reusable name, not an identity: it is a pure
// function of the predecessor, so any later caller observing the same value
// recreates it, and one freed by a win or a prune can be recreated while callers
// still observe that predecessor — which leaves a winner able to rename a peer's
// freshly staged timestamp onto the canonical path and grant an interval it did
// not author. Closing that needs the winner confirming the installed value is its
// own. Content never reaches the filename verbatim: anything that is not a usable
// timestamp collapses to a fixed key, so no path separator, newline, or unbounded
// digit run in the file can escape into a path.
export function upstreamReservationSuccessionPath(
  reservationPath: string,
  predecessor: string,
): string {
  return `${reservationPath}.${isReservationTimestamp(predecessor) ? predecessor : "invalid"}.succ`;
}

// The single predicate behind both the succession key and the window check, so
// "readable as a timestamp" and "keyed by its own value" can never disagree. The
// safe-integer bound is what keeps a long digit run from converting to
// `Infinity`, which would make `now - Infinity` read as permanently fresh and
// block every future refresh.
function isReservationTimestamp(content: string): boolean {
  return /^\d+$/.test(content) && Number.isSafeInteger(Number(content));
}

// Runs only on a win, and removes exactly two classes: reservations left behind
// by the superseded bucket naming, and every succession but the one the
// just-installed value offers — deleting *that* one would cost a successor
// already staging its rename. Both matches have to be exact — this prefix is
// also the prefix of
// `<channel>.json.lock`, of every `.own`, `.claim`, and `.released` artifact the
// lock's ownership depends on, and of the canonical reservation itself, none of
// which may ever be unlinked.
function pruneUpstreamRequestReservations(statePath: string, keptSuccession: string): void {
  const dir = path.dirname(statePath);
  const legacyPrefix = `${path.basename(statePath)}.`;
  const successionPrefix = `${path.basename(statePath)}.req.`;
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const legacyBucket =
      entry.startsWith(legacyPrefix) &&
      entry.endsWith(".req") &&
      isReservationTimestamp(entry.slice(legacyPrefix.length, -".req".length));
    const spentSuccession =
      entry.startsWith(successionPrefix) && entry.endsWith(".succ") && entry !== keptSuccession;
    if (!legacyBucket && !spentSuccession) {
      continue;
    }
    try {
      unlinkSync(path.join(dir, entry));
    } catch {
      // Pruned by a peer between the scan and the unlink.
    }
  }
}

function reservationStillHolds(reservationPath: string, held: string): boolean {
  try {
    return readFileSync(reservationPath, "utf8") === held;
  } catch {
    return false;
  }
}

function discardReservationStage(successionPath: string): void {
  try {
    unlinkSync(successionPath);
  } catch {
    // Consumed by the rename, taken by a peer, or never created.
  }
}

// Reached only when the stage for this predecessor already exists. Recovery only
// ever declines: it adopts no interval and installs no value, so the sole writer
// of the canonical reservation is a caller renaming bytes it authored itself, and
// healing can cost a request but can never duplicate one. Adopting an interrupted
// attempt's interval would save at most one request per crash and would buy it by
// renaming a path this function does not pin between reading it and moving it —
// a peer's rename or a prune frees the name, so the bytes installed need not be
// the bytes judged expired. Declining leaves the canonical at its expired
// predecessor and the name free, so the next caller stages its own timestamp and
// wins.
function recoverReservationStage(successionPath: string, now: number, intervalMs: number): void {
  let staged: string;
  try {
    staged = readFileSync(successionPath, "utf8");
  } catch {
    return;
  }
  if (isReservationTimestamp(staged) && now - Number(staged) < intervalMs) {
    // A live successor holds it, and its interval covers this caller too. A staged
    // timestamp in the future gives a negative difference, so it reads as live
    // rather than as long expired, the same way the canonical value does.
    return;
  }
  // Either a stage whose write never landed, so nothing can interpret it, or an
  // attempt that staged its value and exited before the rename. Neither is worth
  // completing, and leaving either in place would wedge the slot against every
  // caller observing this predecessor.
  discardReservationStage(successionPath);
}

// Take over a reservation whose window has run out. Expiry is by the recorded
// timestamp alone — mtime says nothing here, and a timestamp in the future gives
// a negative difference, so it blocks rather than reading as long expired, the
// same way `shouldRefreshUpstream` treats a future `checkedAt`. Unusable content
// is expired too: a hand-corrupted reservation must not wedge every future check
// forever.
//
// `held` is the predecessor the caller observed, a parameter rather than a read
// hidden in here, so the observation and the replacement it authorizes are one
// decision that can be revalidated. Stage the complete successor under an
// exclusive create, confirm the canonical file still holds exactly what was
// observed, then rename the stage onto it. Holding the stage is the only right to
// replace the value it names, so nothing else can move the reservation between
// the revalidation and the rename.
export function succeedUpstreamRequestReservation(
  statePath: string,
  reservationPath: string,
  held: string,
  now: number,
  intervalMs: number,
): boolean {
  if (isReservationTimestamp(held) && now - Number(held) < intervalMs) {
    return false;
  }
  const successionPath = upstreamReservationSuccessionPath(reservationPath, held);
  try {
    writeFileSync(successionPath, String(now), { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EEXIST") {
      recoverReservationStage(successionPath, now, intervalMs);
    }
    return false;
  }
  if (!reservationStillHolds(reservationPath, held)) {
    discardReservationStage(successionPath);
    return false;
  }
  try {
    renameSync(successionPath, reservationPath);
  } catch {
    discardReservationStage(successionPath);
    return false;
  }
  pruneUpstreamRequestReservations(statePath, successionOffered(reservationPath, now));
  return true;
}

// The succession the value just installed offers, which prune must keep.
function successionOffered(reservationPath: string, now: number): string {
  return path.basename(upstreamReservationSuccessionPath(reservationPath, String(now)));
}

// Record the attempt before making it. `checkedAt` is written only once a request
// has returned, so it can fence nothing while one is in flight; this artifact is
// what does, for a full interval from the attempt wherever it falls.
export function reserveUpstreamRequest(
  key: UpstreamCacheKey,
  now: number,
  intervalMs: number = UPSTREAM_CHECK_INTERVAL_MS,
): boolean {
  const statePath = upstreamCachePath(key);
  const reservationPath = upstreamRequestReservationPath(key);
  try {
    mkdirSync(path.dirname(statePath), { recursive: true });
    writeFileSync(reservationPath, String(now), { flag: "wx" });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EEXIST") {
      // An unwritable cache dir and a lost race are the same outcome: no request.
      return false;
    }
    let held: string;
    try {
      held = readFileSync(reservationPath, "utf8");
    } catch {
      return false;
    }
    return succeedUpstreamRequestReservation(statePath, reservationPath, held, now, intervalMs);
  }
  pruneUpstreamRequestReservations(statePath, successionOffered(reservationPath, now));
  return true;
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

// Put a held claim back the way it was found. The claim artifact *is* the
// victim's marker, so the disposition follows from what the lock proves: a lock
// still holding the victim's token means it is a live owner and must stay
// releasable, while a lock that is absent or holds another token proves the
// victim is gone and a restored marker would be litter nothing collects.
function disposeUpstreamClaim(
  lockPath: string,
  victimToken: string,
  token: string,
  victimIsGone: boolean,
): void {
  const claimPath = upstreamLockClaimPath(lockPath, token);
  try {
    if (victimIsGone) {
      unlinkSync(claimPath);
    } else {
      renameSync(claimPath, upstreamLockOwnerPath(lockPath, victimToken));
    }
  } catch {
    // Never claimed, or already gone.
  }
}

// Finish a won claim, but only against the state that was actually observed.
// Precondition: the caller holds `upstreamLockClaimPath(lockPath, token)` — the
// victim's marker, renamed away. That is what makes this recheck conclusive: the
// victim cannot release (its CAS fails), no plain acquire can take the non-empty
// canonical path, and a rival takeover is fenced off by our live claim. So a
// lock that still holds `victimToken` and is still stale cannot change under us,
// and anything else means the observation the claim was made from is obsolete.
export function captureClaimedUpstreamLock(
  lockPath: string,
  victimToken: string,
  token: string,
  now: number,
): UpstreamLockHandle | undefined {
  let stale: boolean;
  let victimStillOwns: boolean;
  try {
    stale = statSync(lockPath).mtimeMs < now - UPSTREAM_LOCK_STALE_MS;
    victimStillOwns = readFileSync(lockPath, "utf8") === victimToken;
  } catch (err) {
    // Absence proves the victim is no longer the owner; any other failure proves
    // nothing, and must not cost the victim its marker.
    disposeUpstreamClaim(
      lockPath,
      victimToken,
      token,
      (err as NodeJS.ErrnoException).code === "ENOENT",
    );
    return undefined;
  }

  if (stale && victimStillOwns) {
    const ownerPath = upstreamLockOwnerPath(lockPath, token);
    try {
      writeFileSync(ownerPath, token, { flag: "wx" });
      // In-place overwrite, not a rename: the victim provably cannot release (its
      // marker is ours now) and no plain acquire can take a non-empty path.
      writeFileSync(lockPath, token);
    } catch {
      try {
        unlinkSync(ownerPath);
      } catch {
        // Never created.
      }
      disposeUpstreamClaim(lockPath, victimToken, token, false);
      return undefined;
    }
    try {
      unlinkSync(upstreamLockClaimPath(lockPath, token));
    } catch {
      // Never claimed.
    }
    return { lockPath, token };
  }

  disposeUpstreamClaim(lockPath, victimToken, token, !victimStillOwns);
  return undefined;
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
    // two recoverers. A recoverer that passed this scan before a rival's claim
    // existed can still fabricate a marker for a token the lock no longer holds,
    // but the capture that follows either proves the lock is that token's and
    // stale, or drops the fabrication and leaves the directory as it was.
    try {
      writeFileSync(upstreamLockOwnerPath(lockPath, victimToken), victimToken, { flag: "wx" });
    } catch {
      return undefined;
    }
    if (!claimStaleUpstreamLock(lockPath, victimToken, token)) {
      return undefined;
    }
  }

  // The claim is not the end of the takeover, only the point at which a recheck
  // becomes conclusive — capture owns the claim artifact from here.
  return captureClaimedUpstreamLock(lockPath, victimToken, token, now);
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
    // The lock cannot be the fence here: it can be stolen from an owner that
    // suspended mid-fetch, and an aged claim can be re-adopted, so two sessions
    // can hold a handle over the same interval. What makes this total is that the
    // canonical reservation is never vacated and succession to it is exclusive
    // per predecessor value; and because it fences a full interval from the
    // attempt, a stale takeover of a parked owner cannot slip a second request
    // through on the far side of a boundary. It is deliberately never rolled back
    // — the invariant is one *attempt* per interval, so a failed request waits
    // out that interval rather than retrying on the next command.
    if (!reserveUpstreamRequest(opts, opts.now, opts.intervalMs)) {
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
