import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

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

const defaultListDir = (dir: string): string[] => {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
};

export interface DetectEditorBundledJavaOpts {
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: () => string;
  readonly listDir?: (dir: string) => string[];
  readonly exists?: (path: string) => boolean;
}

// The editor ships a JDK at `<resources-root>/packages/jdk-<version>/bin/java`
// (`java.exe` on win32); the resources root is the parent of each
// `editorConfigCandidates` entry. First readable `jdk-*` with a present binary
// wins; `null` when no editor bundle yields one.
export function detectEditorBundledJava(opts: DetectEditorBundledJavaOpts = {}): string | null {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir;
  const listDir = opts.listDir ?? defaultListDir;
  const exists = opts.exists ?? existsSync;
  const javaBin = platform === "win32" ? "java.exe" : "java";
  for (const configPath of editorConfigCandidates(platform, env, home)) {
    const packagesDir = join(dirname(configPath), "packages");
    const jdkDirs = listDir(packagesDir)
      .filter((entry) => entry.startsWith("jdk-"))
      .sort();
    for (const jdk of jdkDirs) {
      const javaPath = join(packagesDir, jdk, "bin", javaBin);
      if (exists(javaPath)) {
        return javaPath;
      }
    }
  }
  return null;
}
