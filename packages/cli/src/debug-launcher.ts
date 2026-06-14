import * as path from "node:path";

// One native extension whose build engine links platform runtime libraries the
// Defold build server does not (yet) ship. `tracking` is the upstream note/URL
// surfaced in the warn-and-continue message; adding an extension is data-only.
export interface NativeExtensionRuntime {
  readonly extension: string;
  readonly libraries: readonly string[];
  readonly tracking?: string;
}

export interface EngineTarget {
  readonly enginePlatform: string;
  readonly buildFolder: string;
  readonly executable: string;
  // Native extensions whose runtime libraries the build engine needs placed
  // beside it. An empty list means "no extension runtime libs to place on this
  // platform" (macOS/Linux resolve OpenAL from the OS); only Windows
  // native-extension builds currently declare any.
  readonly nativeExtensions: readonly NativeExtensionRuntime[];
}

const OPENAL_TRACKING = "defold/defold#11860 (https://github.com/defold/defold/issues/11860)";

// `enginePlatform` keys the d.defold.com download path; `buildFolder` keys the
// native-extension build output. Current Defold uses the same `-macos` identifier
// for both, but they are tracked separately so a future divergence stays local.
// Keyed by `${process.platform}-${process.arch}` because Apple Silicon and Intel
// resolve to different engine archives (`arm64-macos` vs `x86_64-macos`).
const PLATFORM_TARGETS: Record<string, EngineTarget> = {
  "darwin-arm64": {
    enginePlatform: "arm64-macos",
    buildFolder: "arm64-macos",
    executable: "dmengine",
    nativeExtensions: [],
  },
  "darwin-x64": {
    enginePlatform: "x86_64-macos",
    buildFolder: "x86_64-macos",
    executable: "dmengine",
    nativeExtensions: [],
  },
  "linux-x64": {
    enginePlatform: "x86_64-linux",
    buildFolder: "x86_64-linux",
    executable: "dmengine",
    nativeExtensions: [],
  },
  "win32-x64": {
    enginePlatform: "x86_64-win32",
    buildFolder: "x86_64-win32",
    executable: "dmengine.exe",
    nativeExtensions: [
      {
        extension: "openal",
        libraries: ["OpenAL32.dll", "wrap_oal.dll"],
        tracking: OPENAL_TRACKING,
      },
    ],
  },
};

export const ENGINE_INFO_URL = "https://d.defold.com/stable/info.json";
export const ENGINE_ARCHIVE_BASE = "https://d.defold.com/archive/stable";

export const DEBUG_LAUNCHER_REL = ".vscode/defold-debug.ts";

export function targetPlatform(platform: NodeJS.Platform, arch: string): EngineTarget {
  const key = `${platform}-${arch}`;
  const target = PLATFORM_TARGETS[key];
  if (!target) {
    throw new Error(
      `defold-typescript debug: unsupported platform "${key}"; expected one of ${Object.keys(
        PLATFORM_TARGETS,
      ).join(", ")}.`,
    );
  }
  return target;
}

export function engineDownloadUrl(
  sha1: string,
  enginePlatform: string,
  executable: string,
): string {
  return `${ENGINE_ARCHIVE_BASE}/${sha1}/engine/${enginePlatform}/${executable}`;
}

// Pinned seam for a future auto-fetch slice covering any native extension's
// runtime libraries. Unused by the launcher today: no native extension has a
// durable archive source yet (OpenAL is blocked upstream at defold/defold#11860;
// others are unknown), so the launcher only warns (see renderDebugLauncher).
export function nativeExtensionRuntimeDownloadUrl(
  sha1: string,
  enginePlatform: string,
  libName: string,
): string {
  return `${ENGINE_ARCHIVE_BASE}/${sha1}/engine/${enginePlatform}/${libName}`;
}

export interface NativeExtensionRuntimeWarningOptions {
  readonly target: EngineTarget;
  readonly buildFolder: string;
  readonly exists: (candidate: string) => boolean;
}

// Pure resolver: for each declared native extension, collect the runtime
// libraries missing from `buildFolder` and emit one warn-and-continue message
// per extension naming it, the missing libraries, the folder, and the tracking
// note. Empty result means nothing to warn about. The embedded launcher mirrors
// this logic under the lockstep contract.
export function nativeExtensionRuntimeWarnings(
  opts: NativeExtensionRuntimeWarningOptions,
): string[] {
  const { target, buildFolder, exists } = opts;
  const warnings: string[] = [];
  for (const ext of target.nativeExtensions) {
    const missing = ext.libraries.filter((lib) => !exists(path.join(buildFolder, lib)));
    if (missing.length === 0) {
      continue;
    }
    let warning =
      `Place ${missing.join(" and ")} by hand next to the ${ext.extension} build engine ` +
      `(${buildFolder}); the Defold build server does not yet ship them.`;
    if (ext.tracking) {
      warning += ` Tracking: ${ext.tracking}`;
    }
    warnings.push(warning);
  }
  return warnings;
}

export interface ResolveEngineOptions {
  readonly cwd: string;
  readonly target: EngineTarget;
  readonly stockPath: string;
  readonly probe: (candidate: string) => boolean;
}

// Prefer the native-extension build engine when it exists; the stock engine is
// the fallback for projects without native extensions.
export function resolveEnginePath(opts: ResolveEngineOptions): string {
  const { cwd, target, stockPath, probe } = opts;
  const buildEnginePath = path.join(cwd, "build", target.buildFolder, target.executable);
  return probe(buildEnginePath) ? buildEnginePath : stockPath;
}

export function debugLaunchConfig() {
  return {
    name: "Defold: Debug (TypeScript)",
    type: "lua-local",
    request: "launch",
    stopOnEntry: false,
    verbose: false,
    internalConsoleOptions: "openOnSessionStart",
    program: { command: "bun" },
    args: [DEBUG_LAUNCHER_REL],
    // Local Lua Debugger (>=0.3.0) pre-scans `scriptFiles` for the emitted
    // `--# sourceMappingURL=` trailers so a breakpoint in a `.ts` resolves
    // ahead of time; without it no source-mapped breakpoint ever binds. Every
    // build emits `<name>.ts.script` under `src/`. `scriptRoots` lets the
    // debugger resolve the running Defold chunk path (`/src/...`) and the map's
    // bare `sources` entry (`player.ts`) back to files on disk.
    scriptFiles: ["src/**/*.ts.script"],
    scriptRoots: [".", "src"],
  };
}

export const VSCODE_LAUNCH_CONTENT = {
  version: "0.2.0",
  configurations: [debugLaunchConfig()],
};

// The scaffolded launcher embeds the same platform table and archive endpoints
// the helpers above use, so the self-contained `.vscode/defold-debug.ts` and the
// unit-tested logic stay in lockstep. It is a Bun script: `process.platform` for
// the OS, `fetch` for the engine download, `Bun.spawn` with inherited stdio for
// the run (the pipe Local Lua Debugger attaches over). No shell, no Git Bash.
function renderDebugLauncher(): string {
  const targets = JSON.stringify(PLATFORM_TARGETS, null, 2);
  return `import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import * as path from "node:path";

interface NativeExtensionRuntime {
  extension: string;
  libraries: string[];
  tracking?: string;
}

interface EngineTarget {
  enginePlatform: string;
  buildFolder: string;
  executable: string;
  nativeExtensions: NativeExtensionRuntime[];
}

const PLATFORM_TARGETS: Record<string, EngineTarget> = ${targets};

const ENGINE_INFO_URL = "${ENGINE_INFO_URL}";
const ENGINE_ARCHIVE_BASE = "${ENGINE_ARCHIVE_BASE}";

const target = PLATFORM_TARGETS[\`\${process.platform}-\${process.arch}\`];
if (!target) {
  console.error(\`Unsupported platform: \${process.platform}-\${process.arch}\`);
  process.exit(1);
}

const here = path.dirname(new URL(import.meta.url).pathname);
const stockEnginePath = path.join(here, target.executable);

if (!existsSync(stockEnginePath)) {
  const info = (await (await fetch(ENGINE_INFO_URL)).json()) as { sha1: string };
  const url = \`\${ENGINE_ARCHIVE_BASE}/\${info.sha1}/engine/\${target.enginePlatform}/\${target.executable}\`;
  console.log(\`Fetching \${url}\`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(\`Engine download failed: \${res.status} \${res.statusText}\`);
    process.exit(1);
  }
  await Bun.write(stockEnginePath, res);
}

const buildFolder = path.join("build", target.buildFolder);
const buildEnginePath = path.join(buildFolder, target.executable);
let enginePath = existsSync(buildEnginePath) ? buildEnginePath : stockEnginePath;

// A build engine links each declared native extension's runtime libraries, but
// no Defold-hosted archive currently ships them (OpenAL is blocked on the
// upstream copy fix, defold/defold#11860). Warn once per extension on the real
// gap and continue the launch; placing the libraries by hand is the only fix
// today. The declared set is empty off Windows, so this is a no-op there.
if (enginePath === buildEnginePath) {
  for (const ext of target.nativeExtensions) {
    const missing = ext.libraries.filter(
      (lib) => !existsSync(path.join(buildFolder, lib)),
    );
    if (missing.length) {
      let warning =
        \`Place \${missing.join(" and ")} by hand next to the \${ext.extension} build engine \` +
        \`(\${buildFolder}); the Defold build server does not yet ship them.\`;
      if (ext.tracking) {
        warning += \` Tracking: \${ext.tracking}\`;
      }
      console.warn(warning);
    }
  }
}

// macOS: a build engine launched in place attaches to the editor process; copy
// it aside first so it runs standalone.
if (process.platform === "darwin" && enginePath === buildEnginePath) {
  const tempEngine = path.join(buildFolder, "temp", target.executable);
  mkdirSync(path.dirname(tempEngine), { recursive: true });
  copyFileSync(buildEnginePath, tempEngine);
  enginePath = tempEngine;
}

if (process.platform !== "win32") {
  chmodSync(enginePath, 0o755);
}

const projectc = path.join("build", "default", "game.projectc");
console.log(\`Launching \${enginePath} \${projectc}\`);
const proc = Bun.spawn([enginePath, projectc], {
  stdio: ["inherit", "inherit", "inherit"],
});
process.exit(await proc.exited);
`;
}

export const DEBUG_LAUNCHER_SOURCE = renderDebugLauncher();
