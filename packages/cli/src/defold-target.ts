import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";

export const DEFOLD_CHANNELS = ["stable", "beta", "alpha"] as const;
export type DefoldChannel = (typeof DEFOLD_CHANNELS)[number];

export type DefoldTarget =
  | { kind: "version"; version: string }
  | { kind: "channel"; channel: DefoldChannel };

export type DefoldTargetSource = "flag" | "pin" | "detected" | "default";

function isDefoldChannel(v: unknown): v is DefoldChannel {
  return (DEFOLD_CHANNELS as readonly unknown[]).includes(v);
}

export function classifyDefoldTarget(token: string): DefoldTarget {
  if (isDefoldChannel(token)) {
    return { kind: "channel", channel: token };
  }
  if (/^\d+\.\d+(\.\d+)?/.test(token)) {
    return { kind: "version", version: token };
  }
  throw new Error(
    `defold-typescript: unknown --defold-target '${token}' (expected a version like 1.12.4, or stable|beta|alpha)`,
  );
}

function readDefoldNamespace(pkg: unknown): Record<string, unknown> | undefined {
  if (typeof pkg !== "object" || pkg === null) {
    return undefined;
  }
  const namespace = (pkg as Record<string, unknown>)["defold-typescript"];
  if (typeof namespace !== "object" || namespace === null) {
    return undefined;
  }
  return namespace as Record<string, unknown>;
}

export function readDefoldTargetPin(pkg: unknown): string | undefined {
  const target = readDefoldNamespace(pkg)?.["defold-target"];
  return typeof target === "string" ? target : undefined;
}

// The only keys the readers consume: `defold-target` here, `extensions` in
// extension-version.ts. Anything else in the namespace is inert, so it is
// diagnosed rather than silently dropped.
export const RECOGNIZED_NAMESPACE_KEYS = ["defold-target", "extensions"] as const;

// The spellings that predate `defold-target`. The flag surface already hard-
// rejects them (dispatch.ts) — the pin surface points at the same replacement.
export const LEGACY_TARGET_KEYS = ["defold-version", "channel"] as const;

function isKeyOf(keys: readonly string[], key: string): boolean {
  return keys.includes(key);
}

export function diagnoseDefoldNamespace(pkg: unknown): readonly string[] {
  const namespace = readDefoldNamespace(pkg);
  if (namespace === undefined) {
    return [];
  }
  const recognized = RECOGNIZED_NAMESPACE_KEYS.map((key) => `"${key}"`).join(" and ");
  return Object.keys(namespace)
    .filter((key) => !isKeyOf(RECOGNIZED_NAMESPACE_KEYS, key))
    .sort()
    .map((key) =>
      isKeyOf(LEGACY_TARGET_KEYS, key)
        ? `package.json "defold-typescript"."${key}" was removed; use "defold-target" (a version like 1.12.4, or stable|beta|alpha). Nothing is pinned until then; \`defold-typescript init\` migrates it.`
        : `package.json "defold-typescript"."${key}" is not a recognized key (recognized: ${recognized}); it is ignored.`,
    );
}

// `--defold-target` is a per-run override that never rewrites the pin by design.
// When it silently shadows a live pin, name both values and how to persist the
// target. Raw trimmed comparison, not classified equality, so the notice mirrors
// exactly what the user typed and cannot drift from readDefoldTargetPin's guard.
export function describeTargetOverride(
  flag: string | undefined,
  pin: string | undefined,
): readonly string[] {
  if (flag === undefined || pin === undefined || flag.trim() === pin.trim()) {
    return [];
  }
  return [
    `--defold-target ${flag} overrides the package.json pin (${pin}) for this run only; it does not update the pin. Edit "defold-typescript"."defold-target" or run \`init\` to persist ${flag}.`,
  ];
}

export interface DefoldNamespaceRepair {
  readonly namespace: unknown;
  readonly warnings: readonly string[];
}

export function repairDefoldNamespace(
  namespace: unknown,
  fallbackTarget: string,
): DefoldNamespaceRepair {
  if (namespace === undefined || namespace === null) {
    return { namespace: { "defold-target": fallbackTarget }, warnings: [] };
  }
  if (typeof namespace !== "object") {
    return { namespace, warnings: [] };
  }
  const source = namespace as Record<string, unknown>;
  const pinned = typeof source["defold-target"] === "string" ? source["defold-target"] : undefined;
  const legacyKey = LEGACY_TARGET_KEYS.find((key) => typeof source[key] === "string");
  const legacyValue = legacyKey === undefined ? undefined : (source[legacyKey] as string);
  const target = pinned ?? legacyValue ?? fallbackTarget;

  const warnings: string[] = [];
  if (legacyKey !== undefined) {
    warnings.push(
      pinned === undefined
        ? `migrated package.json "defold-typescript"."${legacyKey}" to "defold-target", keeping "${target}".`
        : `dropped package.json "defold-typescript"."${legacyKey}"; the "defold-target" pin ("${pinned}") wins.`,
    );
  } else if (pinned === undefined) {
    warnings.push(`seeded package.json "defold-typescript"."defold-target" with "${target}".`);
  }

  // Rewrite the pin in the slot the old key occupied, so a namespace that
  // already carries a valid pin round-trips byte-identical.
  const repaired: Record<string, unknown> = {};
  let placed = false;
  for (const [key, value] of Object.entries(source)) {
    if (key === "defold-target" || isKeyOf(LEGACY_TARGET_KEYS, key)) {
      if (!placed) {
        repaired["defold-target"] = target;
        placed = true;
      }
      continue;
    }
    repaired[key] = value;
  }
  if (!placed) {
    repaired["defold-target"] = target;
  }
  return { namespace: repaired, warnings };
}

// The imperative counterpart to `repairDefoldNamespace`: force the pin to
// `value` rather than keeping an existing one. Shares the slot-placement and
// legacy-key handling so the written namespace stays byte-stable and never
// leaves a legacy key beside the pin.
export function setDefoldTargetPin(namespace: unknown, value: string): unknown {
  if (typeof namespace !== "object" || namespace === null) {
    return { "defold-target": value };
  }
  const source = namespace as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  let placed = false;
  for (const [key, existing] of Object.entries(source)) {
    if (key === "defold-target" || isKeyOf(LEGACY_TARGET_KEYS, key)) {
      if (!placed) {
        result["defold-target"] = value;
        placed = true;
      }
      continue;
    }
    result[key] = existing;
  }
  if (!placed) {
    result["defold-target"] = value;
  }
  return result;
}

export function resolveDefoldTarget(opts: {
  flag?: string;
  pin?: string;
  detected?: string;
}): DefoldTarget & { source: DefoldTargetSource } {
  if (opts.flag !== undefined) {
    return { ...classifyDefoldTarget(opts.flag), source: "flag" };
  }
  if (opts.pin !== undefined) {
    return { ...classifyDefoldTarget(opts.pin), source: "pin" };
  }
  if (opts.detected !== undefined) {
    return { kind: "version", version: opts.detected, source: "detected" };
  }
  return { kind: "version", version: CURRENT_STABLE_DEFOLD_VERSION, source: "default" };
}

export interface ResolvedTargetHead {
  version: string;
  channel: DefoldChannel | null;
  sha: string | null;
}

export interface ChannelInfoIo {
  fetchChannelInfo: (channel: DefoldChannel) => Promise<{ version: string; sha1: string }>;
  fetchVersionInfo: (version: string) => Promise<{ sha1: string }>;
}

export async function resolveTargetHead(
  target: DefoldTarget,
  io: ChannelInfoIo,
): Promise<ResolvedTargetHead> {
  if (target.kind === "version") {
    const info = await io.fetchVersionInfo(target.version);
    return { version: target.version, channel: null, sha: info.sha1 };
  }
  const info = await io.fetchChannelInfo(target.channel);
  return { version: info.version, channel: target.channel, sha: info.sha1 };
}

export async function fetchChannelInfo(
  channel: DefoldChannel,
): Promise<{ version: string; sha1: string }> {
  const url = `https://d.defold.com/${channel}/info.json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `defold-typescript: could not resolve the ${channel} Defold head (${url} -> ${res.status} ${res.statusText}).`,
    );
  }
  const info = (await res.json()) as { version?: string; sha1?: string };
  if (!info.version || !info.sha1) {
    throw new Error(`defold-typescript: ${url} returned no version/sha1.`);
  }
  return { version: info.version, sha1: info.sha1 };
}

const DEFOLD_TAG_REF_BASE = "https://api.github.com/repos/defold/defold/git";

// d.defold.com exposes only channel-head info.json files, so a pinned version's
// archive sha comes from its git tag: `refs/tags/<version>` dereferenced to the
// tagged commit. Defold's release archive (bobDownloadUrl) is keyed by that
// commit sha, so it is exactly the artifact key.
async function fetchGitObject(url: string): Promise<{ type: string; sha: string }> {
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) {
    throw new Error(
      `defold-typescript: could not resolve the Defold version tag (${url} -> ${res.status} ${res.statusText}).`,
    );
  }
  const body = (await res.json()) as { object?: { type?: string; sha?: string } };
  if (!body.object?.type || !body.object.sha) {
    throw new Error(`defold-typescript: ${url} returned no tag object.`);
  }
  return { type: body.object.type, sha: body.object.sha };
}

export async function fetchVersionInfo(version: string): Promise<{ sha1: string }> {
  const ref = await fetchGitObject(`${DEFOLD_TAG_REF_BASE}/refs/tags/${version}`);
  // Annotated tags point at a tag object; dereference it to the commit sha.
  const sha1 =
    ref.type === "tag"
      ? (await fetchGitObject(`${DEFOLD_TAG_REF_BASE}/tags/${ref.sha}`)).sha
      : ref.sha;
  return { sha1 };
}
