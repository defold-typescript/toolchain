import * as path from "node:path";

export interface EngineTarget {
  readonly enginePlatform: string;
  readonly buildFolder: string;
  readonly executable: string;
}

// `enginePlatform` keys the d.defold.com download path; `buildFolder` keys the
// native-extension build output. They diverge on macOS (`x86_64-darwin` vs
// `x86_64-osx`), which is why they are tracked separately.
const PLATFORM_TARGETS: Record<string, EngineTarget> = {
  darwin: { enginePlatform: "x86_64-darwin", buildFolder: "x86_64-osx", executable: "dmengine" },
  linux: { enginePlatform: "x86_64-linux", buildFolder: "x86_64-linux", executable: "dmengine" },
  win32: {
    enginePlatform: "x86_64-win32",
    buildFolder: "x86_64-win32",
    executable: "dmengine.exe",
  },
};

const ENGINE_INFO_URL = "https://d.defold.com/stable/info.json";
const ENGINE_ARCHIVE_BASE = "https://d.defold.com/archive/stable";

export const DEBUG_LAUNCHER_REL = ".vscode/defold-debug.ts";

export function targetPlatform(platform: NodeJS.Platform): EngineTarget {
  const target = PLATFORM_TARGETS[platform];
  if (!target) {
    throw new Error(
      `defold-typescript debug: unsupported platform "${platform}"; expected one of ${Object.keys(
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

// Windows only: paths to OpenAL32.dll and wrap_oal.dll from your Defold SDK
// (defoldsdk/ext/lib/x86_64-win32/). Leave empty on macOS/Linux.
const WINDOWS_OPENAL32_PATH = "";
const WINDOWS_WRAPOAL_PATH = "";

interface EngineTarget {
  enginePlatform: string;
  buildFolder: string;
  executable: string;
}

const PLATFORM_TARGETS: Record<string, EngineTarget> = ${targets};

const ENGINE_INFO_URL = "${ENGINE_INFO_URL}";
const ENGINE_ARCHIVE_BASE = "${ENGINE_ARCHIVE_BASE}";

const target = PLATFORM_TARGETS[process.platform];
if (!target) {
  console.error(\`Unsupported platform: \${process.platform}\`);
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

if (process.platform === "win32" && enginePath === buildEnginePath) {
  for (const [src, name] of [
    [WINDOWS_OPENAL32_PATH, "OpenAL32.dll"],
    [WINDOWS_WRAPOAL_PATH, "wrap_oal.dll"],
  ] as const) {
    const dest = path.join(buildFolder, name);
    if (src && !existsSync(dest)) {
      copyFileSync(src, dest);
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
