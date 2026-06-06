import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";

export interface BootPathCandidate {
  readonly candidate: string;
  readonly trace: string[];
}

// `game.project` is a flat INI the engine writes itself; mirror the no-parser
// line idiom `addLldebuggerDependency` uses rather than adding a TOML dep.
const MAIN_COLLECTION_RE = /^main_collection\s*=\s*(.+)$/m;

// Both `.collection` files store component/collection references two ways: as a
// bare `component: "/path"` line and, inside an embedded `data:` string, as an
// escaped `component: \"/path\"`. The optional `\\?` before each quote matches
// both forms with one expression.
const COMPONENT_RE = /component:\s*\\?"([^"\\]+)\\?"/;
const COLLECTION_RE = /collection:\s*\\?"([^"\\]+\.collectionc?)\\?"/;

// A top-level (unescaped) instance id; the escaped `\"id\"` lines inside a
// `data:` string start with a quote and never match `^\s*id:`.
const TOP_LEVEL_ID_RE = /^\s*id:\s*"([^"\\]+)"\s*$/;

const TS_SCRIPT_SUFFIX = ".ts.script";

function projectPathToAbs(cwd: string, projectPath: string): string {
  return path.join(cwd, projectPath.replace(/^\//, ""));
}

function relPosix(cwd: string, abs: string): string {
  return path.relative(cwd, abs).split(path.sep).join("/");
}

// Walk the Defold boot path from `game.project`'s `main_collection`, collecting
// every reachable `.ts.script` component (mapped back to its source `.ts`) with
// the collection/instance chain that led to it. Never throws: a missing file or
// absent `[bootstrap]` yields an empty result; a `collection:` ref cycle is cut
// by the visited set.
export function resolveBootPathScripts(cwd: string): BootPathCandidate[] {
  const gameProjectPath = path.join(cwd, "game.project");
  if (!existsSync(gameProjectPath)) {
    return [];
  }

  let gameProject: string;
  try {
    gameProject = readFileSync(gameProjectPath, "utf8");
  } catch {
    return [];
  }

  const mainMatch = gameProject.match(MAIN_COLLECTION_RE);
  if (mainMatch?.[1] === undefined) {
    return [];
  }
  const mainCollection = mainMatch[1].trim().replace(/\.collectionc$/, ".collection");

  const candidates: BootPathCandidate[] = [];
  const visited = new Set<string>();

  const walk = (collectionAbs: string, tracePrefix: string[]): void => {
    if (visited.has(collectionAbs)) {
      return;
    }
    visited.add(collectionAbs);
    if (!existsSync(collectionAbs)) {
      return;
    }

    let content: string;
    try {
      content = readFileSync(collectionAbs, "utf8");
    } catch {
      return;
    }

    const trace = [...tracePrefix, relPosix(cwd, collectionAbs)];
    const children: string[] = [];
    let currentId: string | null = null;

    for (const line of content.split("\n")) {
      const idMatch = line.match(TOP_LEVEL_ID_RE);
      if (idMatch?.[1] !== undefined) {
        currentId = idMatch[1];
        continue;
      }

      const componentMatch = line.match(COMPONENT_RE);
      const component = componentMatch?.[1];
      if (component?.endsWith(TS_SCRIPT_SUFFIX)) {
        const candidate = component.replace(/^\//, "").replace(/\.script$/, "");
        candidates.push({
          candidate,
          trace: [...trace, currentId ?? "?", component],
        });
        continue;
      }

      const collectionMatch = line.match(COLLECTION_RE);
      if (collectionMatch?.[1] !== undefined) {
        const ref = collectionMatch[1].replace(/\.collectionc$/, ".collection");
        children.push(projectPathToAbs(cwd, ref));
      }
    }

    for (const child of children) {
      walk(child, trace);
    }
  };

  walk(projectPathToAbs(cwd, mainCollection), ["game.project"]);
  return candidates;
}
