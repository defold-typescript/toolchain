import {
  COLLECTION_REFERENCE_EXTENSIONS,
  SCENE_EXTENSIONS,
  type ScriptKind,
} from "@defold-typescript/transpiler";

export type { ScriptKind };

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

// Does saving this change the scene-address universe? That universe is read by
// both of the generator's walks — the `.go`/`.collection` documents and the
// standalone `.collectionproxy`/`.collectionfactory` documents that classify a
// collection into the world it is — so the trigger tests both. The lists are the
// transpiler's own, so the watch trigger and the generator's walks cannot come
// to disagree about what a scene source is.
const SCENE_TRIGGER_EXTENSIONS = [...SCENE_EXTENSIONS, ...COLLECTION_REFERENCE_EXTENSIONS];

export function isScenePath(relPath: string): boolean {
  return SCENE_TRIGGER_EXTENSIONS.some((ext) => relPath.endsWith(ext));
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
