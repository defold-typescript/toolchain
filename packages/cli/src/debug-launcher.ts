import * as path from "node:path";

export interface EngineTarget {
  readonly enginePlatform: string;
  readonly buildFolder: string;
  readonly executable: string;
  // Runtime libraries the build engine needs placed beside it. An empty list
  // means "system-resolved, nothing to place" (macOS/Linux resolve OpenAL from
  // the OS); only Windows native-extension builds need the DLLs supplied.
  readonly openalLibraries: readonly string[];
}

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
    openalLibraries: [],
  },
  "darwin-x64": {
    enginePlatform: "x86_64-macos",
    buildFolder: "x86_64-macos",
    executable: "dmengine",
    openalLibraries: [],
  },
  "linux-x64": {
    enginePlatform: "x86_64-linux",
    buildFolder: "x86_64-linux",
    executable: "dmengine",
    openalLibraries: [],
  },
  "win32-x64": {
    enginePlatform: "x86_64-win32",
    buildFolder: "x86_64-win32",
    executable: "dmengine.exe",
    openalLibraries: ["OpenAL32.dll", "wrap_oal.dll"],
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

// Pinned seam for a future auto-fetch slice, re-enabled once the upstream fix
// (defold/defold#11860) ships the Windows OpenAL runtime DLLs in the stable
// archive. Unused by the launcher today: no Defold-hosted archive currently
// serves these files, so the launcher only warns (see renderDebugLauncher).
export function openalDownloadUrl(sha1: string, enginePlatform: string, libName: string): string {
  return `${ENGINE_ARCHIVE_BASE}/${sha1}/engine/${enginePlatform}/${libName}`;
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

interface EngineTarget {
  enginePlatform: string;
  buildFolder: string;
  executable: string;
  openalLibraries: string[];
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

// Windows native-extension build engines link the OpenAL runtime DLLs, but no
// Defold-hosted archive currently ships them and the upstream copy fix
// (defold/defold#11860) is closed unmerged. Warn once on the real gap and
// continue the launch; placing the DLLs by hand is the only fix today.
if (process.platform === "win32" && enginePath === buildEnginePath) {
  const missing = target.openalLibraries.filter(
    (lib) => !existsSync(path.join(buildFolder, lib)),
  );
  if (missing.length) {
    console.warn(
      \`Place \${missing.join(" and ")} by hand next to the build engine (\${buildFolder}); \` +
        "the Defold build server does not yet ship them. Tracking: defold/defold#11860 " +
        "(https://github.com/defold/defold/issues/11860).",
    );
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
