import { parseSceneTextFormat, SceneTextFormatError } from "./scene-text-format";

// The node ids each script may address, keyed by the project-relative resource
// path of the `.gui_script` that owns them, plus an honest record of every scene
// whose ownership could not be settled. A key's absence is not an empty scene:
// it means no single `.gui` owns that resource, so nothing may be offered for
// it.
export interface GuiNodeIndex {
  readonly byScriptResource: ReadonlyMap<string, ReadonlySet<string>>;
  readonly unresolved: readonly string[];
}

// A `.gui` names its script as a project-absolute resource path, and the key is
// that path with the leading `/` removed — never a guess at the source it came
// from. An output path cannot say which include base was stripped to produce it,
// so the only well-defined direction is forward: a caller maps the file it holds
// through the build's own output-path math and looks the result up here. A
// hand-written Lua `.gui_script` keys itself, which no computed name (always
// `.ts.gui_script`) can equal, so it needs no separate check.
const SCRIPT_SUFFIX = ".gui_script";

function scriptKeyOf(script: string): string | undefined {
  if (!script.endsWith(SCRIPT_SUFFIX)) return undefined;
  const key = script.startsWith("/") ? script.slice(1) : script;
  return key === SCRIPT_SUFFIX ? undefined : key;
}

export function buildGuiNodeIndex(documents: ReadonlyMap<string, string>): GuiNodeIndex {
  const byScriptResource = new Map<string, ReadonlySet<string>>();
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
      byScriptResource.delete(key);
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
    byScriptResource.set(key, ids);
  }

  return { byScriptResource, unresolved };
}
