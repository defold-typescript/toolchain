import { parseSceneTextFormat, SceneTextFormatError } from "./scene-text-format";

// The node ids each script may address, keyed by the project-relative path of
// the TypeScript source that owns them, plus an honest record of every scene
// whose ownership could not be settled. A key's absence is not an empty scene:
// it means no single `.gui` owns that script, so nothing may be offered for it.
export interface GuiNodeIndex {
  readonly byScript: ReadonlyMap<string, ReadonlySet<string>>;
  readonly unresolved: readonly string[];
}

// A `.gui` names its script as a project-absolute resource path, and the CLI
// emits `<name>.ts.gui_script` beside `<name>.ts` — so dropping the leading `/`
// and this suffix yields the source path the editor knows the file by. A
// hand-written Lua `.gui_script` strips to a key no `.ts` file can match, which
// is why no separate check for one is needed.
const SCRIPT_SUFFIX = ".gui_script";

function scriptKeyOf(script: string): string | undefined {
  if (!script.endsWith(SCRIPT_SUFFIX)) return undefined;
  const withoutSuffix = script.slice(0, -SCRIPT_SUFFIX.length);
  const key = withoutSuffix.startsWith("/") ? withoutSuffix.slice(1) : withoutSuffix;
  return key === "" ? undefined : key;
}

export function buildGuiNodeIndex(documents: ReadonlyMap<string, string>): GuiNodeIndex {
  const byScript = new Map<string, ReadonlySet<string>>();
  const claimedBy = new Map<string, string>();
  const unresolved: string[] = [];

  for (const [displayPath, text] of documents) {
    let document: ReturnType<typeof parseSceneTextFormat>;
    try {
      document = parseSceneTextFormat(text);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      unresolved.push(`${displayPath}: could not be parsed (${error.message})`);
      continue;
    }

    const [script] = document.fields.get("script") ?? [];
    if (script === undefined) continue;
    const key = scriptKeyOf(script);
    if (key === undefined) continue;

    const owner = claimedBy.get(key);
    if (owner !== undefined) {
      byScript.delete(key);
      unresolved.push(
        `${key}: claimed by both ${owner} and ${displayPath}, so its node ids are ambiguous`,
      );
      continue;
    }
    claimedBy.set(key, displayPath);

    // Top-level `nodes` only. A `layouts` or `templates` block repeats a node
    // under an override, and walking into them would offer the same id twice
    // while inventing ids from scenes this script does not drive.
    const ids = new Set<string>();
    for (const message of document.messages.get("nodes") ?? []) {
      for (const id of message.fields.get("id") ?? []) {
        if (id !== "") ids.add(id);
      }
    }
    byScript.set(key, ids);
  }

  return { byScript, unresolved };
}
