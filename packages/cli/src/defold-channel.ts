export type DefoldChannel = "stable" | "beta" | "alpha";

export const DEFAULT_DEFOLD_CHANNEL: DefoldChannel = "stable";

export type DefoldChannelSource = "flag" | "pin" | "default";

export interface ResolvedDefoldChannel {
  readonly channel: DefoldChannel;
  readonly source: DefoldChannelSource;
}

export function isDefoldChannel(v: unknown): v is DefoldChannel {
  return v === "stable" || v === "beta" || v === "alpha";
}

export function readDefoldChannelPin(pkg: unknown): DefoldChannel | undefined {
  if (typeof pkg !== "object" || pkg === null) {
    return undefined;
  }
  const namespace = (pkg as Record<string, unknown>)["defold-typescript"];
  if (typeof namespace !== "object" || namespace === null) {
    return undefined;
  }
  const channel = (namespace as Record<string, unknown>).channel;
  return isDefoldChannel(channel) ? channel : undefined;
}

export function resolveDefoldChannel(opts: {
  flag?: string;
  pin?: DefoldChannel;
}): ResolvedDefoldChannel {
  if (opts.flag !== undefined) {
    if (!isDefoldChannel(opts.flag)) {
      throw new Error(
        `defold-typescript: unknown --channel '${opts.flag}' (expected stable|beta|alpha)`,
      );
    }
    return { channel: opts.flag, source: "flag" };
  }
  if (opts.pin !== undefined) {
    return { channel: opts.pin, source: "pin" };
  }
  return { channel: DEFAULT_DEFOLD_CHANNEL, source: "default" };
}
