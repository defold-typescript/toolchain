import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const EDITOR_VERSION_KEY = "version";

// Pinned for live verification — these are the assumed Defold editor bundle
// `config` paths per OS. Live verification against a real install is a
// follow-up: tests prove the probe *mechanics* against synthetic fixtures
// via the injected `readConfig` seam, never the correctness of the real
// paths.
export function editorConfigCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
  home: () => string = homedir,
): string[] {
  switch (platform) {
    case "darwin":
      return [
        "/Applications/Defold.app/Contents/Resources/config",
        join(home(), "Applications", "Defold.app", "Contents", "Resources", "config"),
      ];
    case "linux":
      return [join(home(), "Defold", "config"), "/opt/Defold/config"];
    case "win32":
      return [env.LOCALAPPDATA, env.PROGRAMFILES]
        .filter((root): root is string => Boolean(root))
        .map((root) => join(root, "Defold", "config"));
    default:
      return [];
  }
}

const defaultReadConfig = (p: string): string | null => {
  if (!existsSync(p)) {
    return null;
  }
  return readFileSync(p, "utf8");
};

export interface DetectInstalledEditorVersionOpts {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: () => string;
  readonly readConfig?: (path: string) => string | null;
}

export function detectInstalledEditorVersion(
  opts: DetectInstalledEditorVersionOpts = {},
): string | null {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir;
  const readConfig = opts.readConfig ?? defaultReadConfig;
  const candidates = editorConfigCandidates(platform, env, home);
  const pattern = new RegExp(`^\\s*${EDITOR_VERSION_KEY}\\s*=\\s*(\\S+)`, "m");
  for (const candidate of candidates) {
    const body = readConfig(candidate);
    if (body === null) {
      continue;
    }
    const match = body.match(pattern);
    if (match && match[1] !== undefined) {
      return match[1];
    }
  }
  return null;
}
