// The imperative setter for the `defold-target` pin, mirroring `runInit`'s pin
// write: read `package.json`, set `"defold-typescript"."defold-target"` to a
// validated value, preserve every other key, and write with the shared
// biome-consistent formatter. It does not materialize a surface or touch
// `tsconfig.json` — the next `build`/`watch` does that, exactly as after a
// hand-edit. `--defold-target` remains a per-run override that never writes.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { resolvableTargetVersions } from "./api-registry";
import { classifyDefoldTarget, readDefoldTargetPin, setDefoldTargetPin } from "./defold-target";
import { formatJsonLikeBiome } from "./format-json";
import { detectInstalledEditorVersion } from "./installed-editor-version";

export interface RunSetTargetResult {
  readonly ok: boolean;
  readonly from?: string;
  readonly to?: string;
  readonly written: readonly string[];
  readonly error?: string;
}

export interface RunSetTargetOptions {
  readonly cwd: string;
  readonly token?: string;
  readonly detected?: boolean;
  readonly detect?: () => string | null;
  readonly resolvableTargets?: readonly string[];
}

function fail(error: string): RunSetTargetResult {
  return { ok: false, written: [], error };
}

function registryUnavailableError(origin: string): string {
  return `defold-typescript set-target: the API registry is unavailable, so ${origin} cannot be checked against the targets this toolchain can provide; nothing was written. Reinstall @defold-typescript/types (its api-targets.json is missing or unreadable), or pin a channel (stable|beta|alpha).`;
}

// Shape validation alone accepts a version that never existed, and the pin it
// writes only surfaces much later as a silently-wrong surface at build time. A
// concrete version must therefore be a registry member here, where the typo was
// made. An empty list means membership cannot be established at all, and an
// unknown pin is refused rather than written — matching `selectApiSurface`'s
// build-time behavior, so a broken install cannot re-open the silent-bad-pin
// hole through the writer.
function membershipError(
  version: string,
  origin: string,
  resolvableTargets: readonly string[],
): string | null {
  if (resolvableTargets.length === 0) {
    return registryUnavailableError(origin);
  }
  if (resolvableTargets.includes(version)) {
    return null;
  }
  return `defold-typescript set-target: ${origin} names a version the API registry cannot provide; nothing was written. Resolvable targets: ${resolvableTargets.join(", ")}. Pin one of them, or a channel (stable|beta|alpha).`;
}

// Resolve the value to write: `--detected` reads the installed editor (never
// falling back to current-stable), otherwise the positional token is validated
// verbatim — channels and versions are kept as the user expressed them. Channels
// resolve their head at build time and are not registry members, so only a
// concrete version reaches the membership check.
function resolveValue(opts: RunSetTargetOptions): { value: string } | { error: string } {
  const resolvableTargets = opts.resolvableTargets ?? resolvableTargetVersions();
  if (opts.detected) {
    const version = (opts.detect ?? detectInstalledEditorVersion)();
    if (version === null) {
      return {
        error:
          "defold-typescript set-target: no installed Defold editor was detected; install Defold or pass a version|stable|beta|alpha token.",
      };
    }
    const error = membershipError(
      version,
      `the installed Defold editor (${version})`,
      resolvableTargets,
    );
    return error === null ? { value: version } : { error };
  }
  if (opts.token === undefined) {
    return {
      error:
        "defold-typescript set-target: a version|stable|beta|alpha token or --detected is required.",
    };
  }
  let classified: ReturnType<typeof classifyDefoldTarget>;
  try {
    classified = classifyDefoldTarget(opts.token);
  } catch {
    return {
      error: `defold-typescript set-target: unknown target '${opts.token}' (expected a version like 1.12.4, or stable|beta|alpha).`,
    };
  }
  if (classified.kind === "version") {
    const error = membershipError(classified.version, `'${classified.version}'`, resolvableTargets);
    if (error !== null) {
      return { error };
    }
  }
  return { value: opts.token };
}

export function runSetTarget(opts: RunSetTargetOptions): RunSetTargetResult {
  const resolved = resolveValue(opts);
  if ("error" in resolved) {
    return fail(resolved.error);
  }
  const { value } = resolved;

  const pkgPath = join(opts.cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return fail(`defold-typescript set-target: no package.json found in ${opts.cwd}.`);
  }
  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
  } catch {
    return fail(`defold-typescript set-target: could not parse ${pkgPath}.`);
  }

  const from = readDefoldTargetPin(existing);
  if (from === value) {
    return { ok: true, from, to: value, written: [] };
  }

  existing["defold-typescript"] = setDefoldTargetPin(existing["defold-typescript"], value);
  writeFileSync(pkgPath, `${formatJsonLikeBiome(existing)}\n`);
  return {
    ok: true,
    ...(from !== undefined ? { from } : {}),
    to: value,
    written: ["package.json"],
  };
}
