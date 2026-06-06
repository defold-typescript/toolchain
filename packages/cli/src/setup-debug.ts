import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { scanFilesSync } from "./scan";
import { isSkipped } from "./script-kind";

// Our pinned release URL, mirrored from `docs/guide/debugging.md`. The
// `lldebugger-url` leak guard forbids the upstream ts-defold URL, so this must
// stay equal to the guide's snapshot URL.
export const LLDEBUGGER_URL =
  "https://github.com/king8fisher/defold-typescript/releases/download/lldebugger-v1/lldebugger.zip";

// Names the concept (a debug-only bootstrap, inert in release), not the
// pipeline step that introduced it, so the marker reads correctly in a
// consumer's source. Idempotency keys on its presence.
export const BOOTSTRAP_MARKER = "// lldebugger-bootstrap: debug entry, inert in release builds";

// Mirrors the snippet in `docs/guide/debugging.md` exactly so the tool and the
// guide can never drift; the well-formedness is locked by a guide-comparison
// test.
const BOOTSTRAP_SNIPPET = `${BOOTSTRAP_MARKER}
/** @noResolution */
declare module "lldebugger.debug" {
  export function start(): void;
}

import * as lldebugger from "lldebugger.debug";

if (sys.get_engine_info().is_debug) {
  lldebugger.start();
}
`;

const FACTORY_NAMES = ["defineScript", "defineGuiScript", "defineRenderScript"] as const;

const MANUAL_STEPS: readonly string[] = [
  "Install the Local Lua Debugger extension (tomblind.local-lua-debugger-vscode) in VS Code.",
  "Run Project -> Fetch Libraries in the Defold editor to download the lldebugger module.",
];

function isProjectHeader(line: string): boolean {
  return line.trim() === "[project]";
}

function isSectionHeader(line: string): boolean {
  return /^\[.+\]\s*$/.test(line.trim());
}

// Line-aware INI edit: find the max `dependencies#N` under `[project]` and
// append `#(N+1)`; skip when the URL already appears. Deliberately no TOML/INI
// parser — `game.project` is a flat INI the engine writes itself.
export function addLldebuggerDependency(gameProjectText: string): string {
  const lines = gameProjectText.split("\n");
  if (!lines.some(isProjectHeader)) {
    throw new Error(
      "defold-typescript setup-debug: game.project has no [project] section; this is not a Defold project.",
    );
  }
  if (gameProjectText.includes(LLDEBUGGER_URL)) {
    return gameProjectText;
  }

  let inProject = false;
  let maxIndex = -1;
  let lastDepLine = -1;
  let lastProjectLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (isSectionHeader(line)) {
      inProject = isProjectHeader(line);
      if (inProject) {
        lastProjectLine = i;
      }
      continue;
    }
    if (inProject && line.trim() !== "") {
      lastProjectLine = i;
      const dep = line.match(/^dependencies#(\d+)\s*=/);
      if (dep?.[1] !== undefined) {
        const n = Number(dep[1]);
        if (n > maxIndex) {
          maxIndex = n;
        }
        lastDepLine = i;
      }
    }
  }

  const newLine = `dependencies#${maxIndex + 1} = ${LLDEBUGGER_URL}`;
  const insertAt = (lastDepLine >= 0 ? lastDepLine : lastProjectLine) + 1;
  lines.splice(insertAt, 0, newLine);
  return lines.join("\n");
}

export function injectDebugBootstrap(source: string): string {
  if (source.includes(BOOTSTRAP_MARKER)) {
    return source;
  }
  return `${BOOTSTRAP_SNIPPET}\n${source}`;
}

function hasFactoryCall(text: string): boolean {
  return FACTORY_NAMES.some((name) => text.includes(`${name}(`));
}

export function findEntryScriptCandidates(cwd: string): string[] {
  const srcDir = path.join(cwd, "src");
  if (!existsSync(srcDir)) {
    return [];
  }
  return scanFilesSync(cwd, "src/**/*.ts")
    .filter((rel) => !isSkipped(rel))
    .filter((rel) => hasFactoryCall(readFileSync(path.join(cwd, rel), "utf8")))
    .sort();
}

export interface SetupDebugOptions {
  readonly cwd: string;
  readonly script?: string;
  readonly json?: boolean;
  readonly chooseScript?: (candidates: string[]) => Promise<string>;
}

export interface SetupDebugResult {
  readonly ok: boolean;
  readonly written: string[];
  readonly manualSteps: readonly string[];
  readonly error?: string;
}

function failure(error: string): SetupDebugResult {
  return { ok: false, written: [], manualSteps: MANUAL_STEPS, error };
}

async function defaultChooseScript(candidates: string[]): Promise<string> {
  const { select } = await import("@inquirer/prompts");
  return select({
    message: "Select the entry script to receive the debugger bootstrap:",
    choices: candidates.map((candidate) => ({ name: candidate, value: candidate })),
  });
}

async function resolveTargetScript(opts: SetupDebugOptions): Promise<string | SetupDebugResult> {
  const { cwd, script, json = false, chooseScript } = opts;
  if (script !== undefined) {
    if (!existsSync(path.join(cwd, script))) {
      return failure(`defold-typescript setup-debug: script not found: ${script}`);
    }
    return script;
  }

  const candidates = findEntryScriptCandidates(cwd);
  if (candidates.length === 0) {
    return failure(
      "defold-typescript setup-debug: no entry script with a lifecycle factory call found under src/.",
    );
  }
  if (candidates.length === 1) {
    return candidates[0] as string;
  }

  const chooser = chooseScript ?? (json ? undefined : defaultChooseScript);
  if (chooser === undefined) {
    return failure(
      `defold-typescript setup-debug: multiple entry scripts found (${candidates.join(", ")}); pass --script to choose one.`,
    );
  }
  return chooser(candidates);
}

export async function runSetupDebug(opts: SetupDebugOptions): Promise<SetupDebugResult> {
  const { cwd } = opts;
  const gameProjectPath = path.join(cwd, "game.project");
  if (!existsSync(gameProjectPath)) {
    return failure(
      "defold-typescript setup-debug: no game.project here; this is not a Defold project.",
    );
  }

  const target = await resolveTargetScript(opts);
  if (typeof target !== "string") {
    return target;
  }

  const written: string[] = [];

  const scriptPath = path.join(cwd, target);
  const source = readFileSync(scriptPath, "utf8");
  const injected = injectDebugBootstrap(source);
  if (injected !== source) {
    writeFileSync(scriptPath, injected);
  }
  written.push(target);

  const gameProjectText = readFileSync(gameProjectPath, "utf8");
  const updated = addLldebuggerDependency(gameProjectText);
  if (updated !== gameProjectText) {
    writeFileSync(gameProjectPath, updated);
  }
  written.push("game.project");

  return { ok: true, written, manualSteps: MANUAL_STEPS };
}
