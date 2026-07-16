// The imperative setter for the `defold-target` pin, mirroring `runInit`'s pin
// write: read `package.json`, set `"defold-typescript"."defold-target"` to a
// validated value, preserve every other key, and write with the shared
// biome-consistent formatter. It does not materialize a surface or touch
// `tsconfig.json` — the next `build`/`watch` does that, exactly as after a
// hand-edit. `--defold-target` remains a per-run override that never writes.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
}

function fail(error: string): RunSetTargetResult {
  return { ok: false, written: [], error };
}

// Resolve the value to write: `--detected` reads the installed editor (never
// falling back to current-stable), otherwise the positional token is validated
// verbatim — channels and versions are kept as the user expressed them.
function resolveValue(opts: RunSetTargetOptions): { value: string } | { error: string } {
  if (opts.detected) {
    const version = (opts.detect ?? detectInstalledEditorVersion)();
    if (version === null) {
      return {
        error:
          "defold-typescript set-target: no installed Defold editor was detected; install Defold or pass a version|stable|beta|alpha token.",
      };
    }
    return { value: version };
  }
  if (opts.token === undefined) {
    return {
      error:
        "defold-typescript set-target: a version|stable|beta|alpha token or --detected is required.",
    };
  }
  try {
    classifyDefoldTarget(opts.token);
  } catch {
    return {
      error: `defold-typescript set-target: unknown target '${opts.token}' (expected a version like 1.12.4, or stable|beta|alpha).`,
    };
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
