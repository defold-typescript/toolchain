import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { EDITOR_PORT_FILE, evalEditor, readEditorPort } from "./editor-attach";

export const EDITOR_VERSION_KEY = "version";

export const EDITOR_ROOT_ENV = "DEFOLD_TYPESCRIPT_EDITOR";

// `DEFOLD_TYPESCRIPT_EDITOR` names the editor's resources root and is consulted
// before the per-OS paths below, mirroring how `DEFOLD_TYPESCRIPT_LOCAL_DISTRIBUTION`
// fronts `defaultDistributionRoots` for the local ref-doc distribution. Both the
// bundle root and its `Contents/Resources` interior are emitted unconditionally:
// the enumerator returns candidates and the probe decides which exist, which is
// what lets the probe report list both.
function overrideCandidates(env: NodeJS.ProcessEnv): string[] {
  const root = env[EDITOR_ROOT_ENV];
  if (!root) {
    return [];
  }
  return [join(root, "config"), join(root, "Contents", "Resources", "config")];
}

// The per-OS paths are the *fallback* — where an editor is found when the user
// has not said. Live verification (bug-149) found them incomplete on Windows and
// uncompletable in principle: the Windows editor is a portable archive extracted
// wherever the user likes, so no list of conventions can cover it. That is what
// `DEFOLD_TYPESCRIPT_EDITOR` answers. Tests still prove the probe *mechanics*
// against synthetic fixtures via the injected `readConfig` seam, never the
// correctness of the real paths.
export function editorConfigCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv = process.env,
  home: () => string = homedir,
): string[] {
  const override = overrideCandidates(env);
  switch (platform) {
    case "darwin":
      return [
        ...override,
        "/Applications/Defold.app/Contents/Resources/config",
        join(home(), "Applications", "Defold.app", "Contents", "Resources", "config"),
      ];
    case "linux":
      return [...override, join(home(), "Defold", "config"), "/opt/Defold/config"];
    case "win32":
      return [
        ...override,
        ...[env.LOCALAPPDATA, env.PROGRAMFILES]
          .filter((root): root is string => Boolean(root))
          .map((root) => join(root, "Defold", "config")),
        join(home(), "Defold", "config"),
      ];
    default:
      return override;
  }
}

const defaultReadConfig = (p: string): string | null => {
  if (!existsSync(p)) {
    return null;
  }
  return readFileSync(p, "utf8");
};

/**
 * Whether the running-editor lane has nothing to say about this project, decided
 * with one `stat` and no promise. Callers consult it to find out whether they
 * must await `probeInstalledEditor` at all, which is what keeps the common
 * no-editor case off the async path; it is deliberately a predicate and never a
 * second copy of the lookup.
 */
export function runningEditorDeclines(cwd: string): boolean {
  return readEditorPort(cwd) === null;
}

const defaultEvalVersion = async (cwd: string, signal?: AbortSignal): Promise<string | null> => {
  const value = await evalEditor(cwd, "return editor.version", undefined, signal);
  // `/eval` renders every value through `tostring`, so a Lua `nil` arrives as
  // the text "nil" and is indistinguishable from that string. Treating it as no
  // answer is right for a version question and wrong for nothing this asks.
  return value === null || value === "" || value === "nil" ? null : value;
};

export interface DetectInstalledEditorVersionOpts {
  readonly cwd?: string;
  readonly platform?: NodeJS.Platform;
  readonly env?: NodeJS.ProcessEnv;
  readonly home?: () => string;
  readonly readConfig?: (path: string) => string | null;
  readonly evalVersion?: (cwd: string, signal?: AbortSignal) => Promise<string | null>;
  // The deadline the running-editor lane runs under. Owned by the caller, which
  // is the only layer that knows what the command can afford to wait.
  readonly signal?: AbortSignal;
}

export interface ProbedPath {
  readonly path: string;
  readonly reason: "missing" | "no-version-key" | "found" | "no-editor-open" | "no-answer";
}

export interface EditorProbe {
  readonly version: string | null;
  readonly probed: readonly ProbedPath[];
}

// `probed` records what the loop actually read, in order, so a miss is
// diagnosable instead of mute. A hit short-circuits, so the successful candidate
// is the last entry and no later candidate appears — rebuilding the list from
// `editorConfigCandidates` would wrongly claim paths that were never opened.
//
// This is the filesystem lane on its own, and it is the *only* copy of that
// loop: `probeInstalledEditor` runs the editor lane and then delegates here, so
// the two cannot drift. It stays synchronous because reading `config` files
// never needed a promise, which is what lets a caller that has not yet been
// taught to await keep asking the filesystem question directly.
export function probeEditorConfigFiles(opts: DetectInstalledEditorVersionOpts = {}): EditorProbe {
  const platform = opts.platform ?? process.platform;
  const env = opts.env ?? process.env;
  const home = opts.home ?? homedir;
  const readConfig = opts.readConfig ?? defaultReadConfig;
  const candidates = editorConfigCandidates(platform, env, home);
  const pattern = new RegExp(`^\\s*${EDITOR_VERSION_KEY}\\s*=\\s*(\\S+)`, "m");
  const probed: ProbedPath[] = [];
  for (const candidate of candidates) {
    const body = readConfig(candidate);
    if (body === null) {
      probed.push({ path: candidate, reason: "missing" });
      continue;
    }
    const match = body.match(pattern);
    if (match && match[1] !== undefined) {
      probed.push({ path: candidate, reason: "found" });
      return { version: match[1], probed };
    }
    probed.push({ path: candidate, reason: "no-version-key" });
  }
  return { version: null, probed };
}

// The running editor is asked first: a published port file is evidence that
// *this project* is open in *that* instance right now, where every config
// candidate below is only a guess about the machine. No timeout is owned here —
// the deadline rides in on the caller's signal.
export async function probeInstalledEditor(
  opts: DetectInstalledEditorVersionOpts = {},
): Promise<EditorProbe> {
  const cwd = opts.cwd ?? process.cwd();
  const evalVersion = opts.evalVersion ?? defaultEvalVersion;
  // The entry names the port file so the report keeps its "here is what was
  // read" meaning for a source that is not a config file.
  const portPath = join(cwd, EDITOR_PORT_FILE);
  if (!runningEditorDeclines(cwd)) {
    const version = await evalVersion(cwd, opts.signal);
    if (version !== null) {
      return { version, probed: [{ path: portPath, reason: "found" }] };
    }
    const fallback = probeEditorConfigFiles(opts);
    return {
      version: fallback.version,
      probed: [{ path: portPath, reason: "no-answer" }, ...fallback.probed],
    };
  }
  const fallback = probeEditorConfigFiles(opts);
  return {
    version: fallback.version,
    probed: [{ path: portPath, reason: "no-editor-open" }, ...fallback.probed],
  };
}

export async function detectInstalledEditorVersion(
  opts: DetectInstalledEditorVersionOpts = {},
): Promise<string | null> {
  return (await probeInstalledEditor(opts)).version;
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
