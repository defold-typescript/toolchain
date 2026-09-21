import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { BuildConfig } from "@defold-typescript/transpiler";
import {
  DEBUG_LAUNCHER_REL,
  DEBUG_LAUNCHER_SOURCE,
  debugLaunchConfig,
  vscodeLaunchContent,
} from "./debug-launcher";
import type { FileAction } from "./setup-debug";
import { isJsonObject, readVscodeJson, reconcileManagedList, writeJson } from "./vscode-json";

export const DEBUG_RECOMMENDATION = "tomblind.local-lua-debugger-vscode";
export const VSCODE_LAUNCH_REL = ".vscode/launch.json";
export const VSCODE_EXTENSIONS_REL = ".vscode/extensions.json";

/**
 * `create` settles a whole debug path: an absent `launch.json` is written and an
 * existing one gains our configuration. `refresh` only reasserts the derived
 * fields of a configuration already present, so a project that opted out of the
 * debug path never has it resurrected underneath it.
 */
export type LaunchWriteMode = "create" | "refresh";

// A `launch.json` that does not parse cannot be merged, and the `null`
// `writeVscodeLaunch` returns for it is indistinguishable from the `null`
// `refresh` mode returns for a project with nothing to refresh. The probe gives
// the caller the merge-failure half on its own, before any write.
export function launchJsonUnreadable(cwd: string): boolean {
  const filePath = path.join(cwd, VSCODE_LAUNCH_REL);
  return existsSync(filePath) && readVscodeJson(filePath) === null;
}

// `scriptFiles` and `scriptRoots` are derived from `include` and `outDir`, so
// they are the two fields that go stale when a project's inputs move and the
// only two reasserted on an existing configuration. Every other key —
// `stopOnEntry`, `verbose`, `internalConsoleOptions` — is a toggle ours at
// creation and the user's afterwards.
export function writeVscodeLaunch(
  cwd: string,
  config: BuildConfig,
  mode: LaunchWriteMode,
): FileAction | null {
  const dir = path.join(cwd, ".vscode");
  const filePath = path.join(dir, "launch.json");
  const ours = debugLaunchConfig(config);
  if (existsSync(filePath)) {
    const existing = readVscodeJson(filePath);
    if (existing === null) {
      return null;
    }
    const configs = Array.isArray(existing.configurations) ? [...existing.configurations] : [];
    const mine = configs.find((c) => isJsonObject(c) && c.name === ours.name);
    if (!isJsonObject(mine) && mode === "refresh") {
      return null;
    }
    let changed = false;
    if (isJsonObject(mine)) {
      for (const field of ["scriptFiles", "scriptRoots"] as const) {
        if (JSON.stringify(mine[field]) !== JSON.stringify(ours[field])) {
          mine[field] = ours[field];
          changed = true;
        }
      }
    } else {
      configs.push(ours);
      changed = true;
    }
    if (existing.version === undefined) {
      existing.version = vscodeLaunchContent(config).version;
      changed = true;
    }
    // `configs` holds the live configuration objects, so the field mutations
    // above already landed on `existing`; the reassignment matters only where
    // the key was absent or not an array, which set `changed` itself. Writing
    // only when something changed is what keeps a user's JSONC comments and
    // formatting — neither of which survives the parse `writeJson` serializes.
    if (changed) {
      existing.configurations = configs;
      writeJson(filePath, existing);
    }
    return changed ? "refreshed" : "unchanged";
  }
  if (mode === "refresh") {
    return null;
  }
  mkdirSync(dir, { recursive: true });
  writeJson(filePath, vscodeLaunchContent(config));
  return "injected";
}

export function writeVscodeDebugLauncher(cwd: string): FileAction {
  const filePath = path.join(cwd, DEBUG_LAUNCHER_REL);
  if (existsSync(filePath)) {
    return "unchanged";
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, DEBUG_LAUNCHER_SOURCE);
  return "injected";
}

// The debugger id is not in `init`'s canonical recommendation set, so it is a
// user entry as far as `reconcileManagedList` is concerned and survives every
// later `upgrade`. Reconciling through the same helper keeps the ordering and
// de-duplication identical to the list `init` maintains.
export function writeDebugRecommendation(cwd: string): FileAction {
  const dir = path.join(cwd, ".vscode");
  const filePath = path.join(dir, "extensions.json");
  if (existsSync(filePath)) {
    const existing = readVscodeJson(filePath);
    if (existing === null) {
      return "unchanged";
    }
    const before = JSON.stringify(existing);
    existing.recommendations = reconcileManagedList(
      existing.recommendations,
      [],
      [DEBUG_RECOMMENDATION],
    );
    if (JSON.stringify(existing) === before) {
      return "unchanged";
    }
    writeJson(filePath, existing);
    return "injected";
  }
  mkdirSync(dir, { recursive: true });
  writeJson(filePath, { recommendations: [DEBUG_RECOMMENDATION] });
  return "injected";
}
