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

export function readDefoldTargetPin(pkg: unknown): string | undefined {
  if (typeof pkg !== "object" || pkg === null) {
    return undefined;
  }
  const namespace = (pkg as Record<string, unknown>)["defold-typescript"];
  if (typeof namespace !== "object" || namespace === null) {
    return undefined;
  }
  const target = (namespace as Record<string, unknown>)["defold-target"];
  return typeof target === "string" ? target : undefined;
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
}

export async function resolveTargetHead(
  target: DefoldTarget,
  io: ChannelInfoIo,
): Promise<ResolvedTargetHead> {
  if (target.kind === "version") {
    return { version: target.version, channel: null, sha: null };
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
