import { homedir } from "node:os";
import * as path from "node:path";
import { ENGINE_ARCHIVE_BASE } from "./debug-launcher";

// bob is Defold's headless build tool. It downloads version-matched from the
// same archive the engine launcher uses, keyed by the stable-channel sha that
// `debug-launcher.ts` already resolves from `ENGINE_INFO_URL`.
export function bobDownloadUrl(sha1: string): string {
  return `${ENGINE_ARCHIVE_BASE}/${sha1}/bob/bob.jar`;
}

// Mirrors `refDocCacheDir`: a `DEFOLD_TYPESCRIPT_CACHE` override wins, else the
// XDG cache home, else `~/.cache`. The jar lives outside the repo, so it is
// never committed.
export function bobCacheDir(
  env: NodeJS.ProcessEnv = process.env,
  home: () => string = homedir,
): string {
  if (env.DEFOLD_TYPESCRIPT_CACHE) {
    return path.join(env.DEFOLD_TYPESCRIPT_CACHE, "bob");
  }
  return path.join(env.XDG_CACHE_HOME ?? path.join(home(), ".cache"), "defold-typescript", "bob");
}

export function bobCachePath(opts: { sha1: string; cacheDir: string }): string {
  return path.join(opts.cacheDir, opts.sha1, "bob.jar");
}

export interface ResolvedBobJar {
  readonly jarPath: string;
  readonly cached: boolean;
}

// Returns the sha-keyed cache path and whether it already exists. `cached`
// false means the caller must download `bobDownloadUrl(sha1)` to `jarPath` —
// this module performs no network or filesystem writes.
export function resolveBobJar(opts: {
  sha1: string;
  cacheDir: string;
  probe: (candidate: string) => boolean;
}): ResolvedBobJar {
  const jarPath = bobCachePath({ sha1: opts.sha1, cacheDir: opts.cacheDir });
  return { jarPath, cached: opts.probe(jarPath) };
}

// override -> `java` on PATH -> editor's bundled JDK -> clear error. `probe`
// and `bundledJava` are injectable so callers (and tests) decide what "found
// on PATH" and "found in the editor bundle" mean without spawning or touching
// the real filesystem.
export function resolveJava(opts: {
  override?: string;
  probe: (cmd: string) => boolean;
  bundledJava?: () => string | null;
}): string {
  if (opts.override) {
    return opts.override;
  }
  if (opts.probe("java")) {
    return "java";
  }
  const bundled = opts.bundledJava?.();
  if (bundled) {
    return bundled;
  }
  throw new Error(
    "defold-typescript: no Java runtime found. Checked the --java/DEFOLD_JAVA override, " +
      '"java" on PATH, and the Defold editor\'s bundled JDK. Install a JDK and ensure "java" ' +
      "is on PATH, or pass --java <path> (or set DEFOLD_JAVA). bob.jar requires a JVM to run.",
  );
}
