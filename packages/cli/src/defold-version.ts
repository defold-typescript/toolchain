export const CURRENT_STABLE_DEFOLD_VERSION = "1.12.4";

export type DefoldVersionSource = "flag" | "pin" | "detected" | "default";

export interface ResolvedDefoldVersion {
  readonly version: string;
  readonly source: DefoldVersionSource;
}

export function readDefoldVersionPin(pkg: unknown): string | undefined {
  if (typeof pkg !== "object" || pkg === null) {
    return undefined;
  }
  const namespace = (pkg as Record<string, unknown>)["defold-typescript"];
  if (typeof namespace !== "object" || namespace === null) {
    return undefined;
  }
  const version = (namespace as Record<string, unknown>)["defold-version"];
  return typeof version === "string" ? version : undefined;
}

export function resolveDefoldVersion(opts: {
  flag?: string;
  pin?: string;
  detected?: string;
}): ResolvedDefoldVersion {
  if (opts.flag !== undefined) {
    return { version: opts.flag, source: "flag" };
  }
  if (opts.pin !== undefined) {
    return { version: opts.pin, source: "pin" };
  }
  if (opts.detected !== undefined) {
    return { version: opts.detected, source: "detected" };
  }
  return { version: CURRENT_STABLE_DEFOLD_VERSION, source: "default" };
}
