import * as path from "node:path";
import { scanFilesSync } from "./scan";

export type ScriptKind = "script" | "gui-script" | "render-script" | "editor-script";

export const DEFAULT_TYPES_ENTRYPOINT = "@defold-typescript/types";

const KIND_BY_EXT: Record<string, ScriptKind> = {
  ".script": "script",
  ".gui_script": "gui-script",
  ".render_script": "render-script",
};

const SKIP_SEGMENTS = new Set(["node_modules", ".defold-types", "build"]);

export function isSkipped(relPath: string): boolean {
  return relPath.split(/[/\\]/).some((segment) => SKIP_SEGMENTS.has(segment));
}

// Emitted transpiler output is `<name>.ts.script`, which ends in `.script`;
// without this guard the kind detector would read our own build artifacts as
// real Defold `.script` components and break the per-kind API wall.
const GENERATED_SCRIPT_SUFFIX = ".ts.script";

function isGeneratedScript(relPath: string): boolean {
  return relPath.endsWith(GENERATED_SCRIPT_SUFFIX);
}

export function isComponentPath(relPath: string): boolean {
  if (isGeneratedScript(relPath)) {
    return false;
  }
  return Object.keys(KIND_BY_EXT).some((ext) => relPath.endsWith(ext));
}

export function detectScriptKinds(cwd: string): Set<ScriptKind> {
  const kinds = new Set<ScriptKind>();
  for (const [ext, kind] of Object.entries(KIND_BY_EXT)) {
    for (const match of scanFilesSync(cwd, `**/*${ext}`)) {
      if (!isSkipped(match) && !isGeneratedScript(match)) {
        kinds.add(kind);
        break;
      }
    }
  }
  return kinds;
}

export function groupScriptKindsByDirectory(cwd: string): Map<string, Set<ScriptKind>> {
  const byDir = new Map<string, Set<ScriptKind>>();
  for (const [ext, kind] of Object.entries(KIND_BY_EXT)) {
    for (const match of scanFilesSync(cwd, `**/*${ext}`)) {
      if (isSkipped(match) || isGeneratedScript(match)) {
        continue;
      }
      const dir = path.posix.dirname(match.split(path.sep).join("/"));
      let set = byDir.get(dir);
      if (set === undefined) {
        set = new Set<ScriptKind>();
        byDir.set(dir, set);
      }
      set.add(kind);
    }
  }
  return byDir;
}

export function selectDirectoryWalls(cwd: string): Map<string, ScriptKind> {
  const walls = new Map<string, ScriptKind>();
  for (const [dir, kinds] of groupScriptKindsByDirectory(cwd)) {
    const kind = selectScriptKind(kinds);
    if (kind !== null) {
      walls.set(dir, kind);
    }
  }
  return walls;
}

export function selectScriptKind(kinds: Set<ScriptKind>): ScriptKind | null {
  if (kinds.size !== 1) {
    return null;
  }
  for (const kind of kinds) {
    return kind;
  }
  return null;
}

export function selectScriptKindEntrypoint(kinds: Set<ScriptKind>): string {
  const kind = selectScriptKind(kinds);
  return kind === null ? DEFAULT_TYPES_ENTRYPOINT : `${DEFAULT_TYPES_ENTRYPOINT}/${kind}`;
}
