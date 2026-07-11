import { readFileSync } from "node:fs";
import * as path from "node:path";
import {
  type EngineTarget,
  nativeExtensionRuntimeWarnings,
  targetPlatform,
} from "./debug-launcher";

export const ENGINE_MARKER_REL = "build/.defold-typescript-engine";

export interface Runnable {
  readonly enginePath: string;
  readonly projectcPath: string;
  readonly target: EngineTarget;
  readonly warnings: string[];
}

export interface ResolveRunnableOptions {
  readonly cwd: string;
  readonly platform: NodeJS.Platform;
  readonly arch: string;
  readonly probe: (candidate: string) => boolean;
  readonly readEngineMarker?: (cwd: string) => string | null;
}

// Reads the absolute path a prior `bob run` cached its stock engine to; absent
// or blank means "no marker".
export function readEngineMarker(cwd: string): string | null {
  try {
    const marker = readFileSync(path.join(cwd, ENGINE_MARKER_REL), "utf8").trim();
    return marker.length > 0 ? marker : null;
  } catch {
    return null;
  }
}

// Pure resolver shared by `run` and `bob run`: answer which engine + compiled
// project to launch, or throw an actionable error. No spawn, download, or write.
export function resolveRunnable(opts: ResolveRunnableOptions): Runnable {
  const { cwd, platform, arch, probe } = opts;
  const readMarker = opts.readEngineMarker ?? readEngineMarker;

  const projectcPath = path.join(cwd, "build", "default", "game.projectc");
  if (!probe(projectcPath)) {
    throw new Error(
      `defold-typescript run: no compiled project at build/default; run "bob build" (or "bob run") first.`,
    );
  }

  const target = targetPlatform(platform, arch);
  const buildFolder = path.join(cwd, "build", target.buildFolder);
  const buildEnginePath = path.join(buildFolder, target.executable);

  if (probe(buildEnginePath)) {
    const warnings = nativeExtensionRuntimeWarnings({ target, buildFolder, exists: probe });
    return { enginePath: buildEnginePath, projectcPath, target, warnings };
  }

  const marker = readMarker(cwd);
  if (marker && probe(marker)) {
    return { enginePath: marker, projectcPath, target, warnings: [] };
  }

  throw new Error(
    `defold-typescript run: no engine for ${target.enginePlatform}; run "bob run" to download and cache one.`,
  );
}
