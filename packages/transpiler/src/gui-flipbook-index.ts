import { normalizeDocumentKey, readAnimationSources, resourceKey } from "./animation-sources";
import { parseSceneTextFormat, type SceneMessage, SceneTextFormatError } from "./scene-text-format";

// The flipbook animation ids each gui script may play, keyed by the
// project-relative resource path of the `.gui_script` that owns them, and then
// by animation id — whose value is the display path of every named texture
// declaring it, so a completion reads the keys and a provenance panel reads the
// value. A missing key means nothing may be offered for it; an empty map means
// the scene resolved and its textures declare no animation.
export interface GuiFlipbookIndex {
  readonly byScriptResource: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>;
  readonly unresolved: readonly string[];
}

// The scope is the `.gui` scene naming this script, never the node the call
// addresses: `gui.set_texture` retargets a node at runtime, so scoping to a
// node's authored texture would reject calls that are valid. The scene's
// `textures` blocks are the honest universe.
const SCRIPT_SUFFIX = ".gui_script";

function scriptKeyOf(script: string): string | undefined {
  if (!script.endsWith(SCRIPT_SUFFIX)) return undefined;
  const key = resourceKey(script);
  return key === SCRIPT_SUFFIX ? undefined : key;
}

export function buildGuiFlipbookIndex(input: {
  scenes: ReadonlyMap<string, string>;
  assets: ReadonlyMap<string, string>;
}): GuiFlipbookIndex {
  const unresolved: string[] = [];
  const animationsBySource = readAnimationSources(input.assets, unresolved);
  const byScriptResource = new Map<string, ReadonlyMap<string, ReadonlySet<string>>>();
  const claimedBy = new Map<string, string>();

  for (const [path, text] of input.scenes) {
    const displayPath = normalizeDocumentKey(path);
    let document: SceneMessage;
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
        `${key}: claimed by both ${owner} and ${displayPath}, so its flipbook animations are ambiguous`,
      );
      continue;
    }
    claimedBy.set(key, displayPath);

    // Top-level `textures` only, for the reason `buildGuiNodeIndex` reads only
    // top-level `nodes`: a `layouts` or `templates` block repeats an authored
    // surface under an override rather than naming a source of its own.
    const declaredBy = new Map<string, Set<string>>();
    for (const message of document.messages.get("textures") ?? []) {
      for (const texture of message.fields.get("texture") ?? []) {
        if (texture === "") continue;
        const source = resourceKey(texture);
        const ids = animationsBySource.get(source);
        if (ids === undefined) {
          unresolved.push(
            `${displayPath}: the texture ${texture} is not among the project's asset documents`,
          );
          continue;
        }
        for (const id of ids) {
          const declarers = declaredBy.get(id);
          if (declarers) {
            declarers.add(source);
          } else {
            declaredBy.set(id, new Set([source]));
          }
        }
      }
    }
    byScriptResource.set(key, declaredBy);
  }

  return { byScriptResource, unresolved };
}
