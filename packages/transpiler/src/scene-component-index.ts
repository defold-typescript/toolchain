import { parseSceneTextFormat, type SceneMessage, SceneTextFormatError } from "./scene-text-format";

// Every component id the project declares, plus an honest record of everything
// the walk could not read. A non-empty `incomplete` means the universe is not
// provably whole, so no consumer may conclude that a missing id is absent.
export interface SceneComponentIndex {
  readonly ids: ReadonlySet<string>;
  readonly incomplete: readonly string[];
}

// `id` under these names is a component id. `instances`,
// `collection_instances` and `embedded_instances` carry game-object ids, which
// name a *path* — and a path can never be proven wrong, because `factory.create`
// invents them at runtime.
const COMPONENT_BLOCKS = new Set(["components", "embedded_components"]);

// The only two places Defold embeds a whole escaped document in `data:`. Every
// other `data:` is a plain scalar — `embedded_collision_shape` stores sphere
// radii there — so re-parsing all of them would report the repo's own example
// projects as unreadable and suppress the check for good.
const EMBEDDING_BLOCKS = new Set(["embedded_instances", "embedded_components"]);

function collect(
  message: SceneMessage,
  blockName: string,
  depth: number,
  displayPath: string,
  ids: Set<string>,
  incomplete: string[],
): void {
  if (COMPONENT_BLOCKS.has(blockName)) {
    for (const id of message.fields.get("id") ?? []) {
      ids.add(id);
    }
  }
  if (EMBEDDING_BLOCKS.has(blockName)) {
    for (const payload of message.fields.get("data") ?? []) {
      try {
        collect(parseSceneTextFormat(payload), "", depth + 1, displayPath, ids, incomplete);
      } catch (error) {
        if (!(error instanceof SceneTextFormatError)) throw error;
        incomplete.push(
          `${displayPath}: embedded payload at depth ${depth + 1} could not be parsed (${error.message})`,
        );
      }
    }
  }
  for (const [name, nested] of message.messages) {
    for (const child of nested) {
      collect(child, name, depth, displayPath, ids, incomplete);
    }
  }
}

// Build the component-id universe from already-read scene sources: keys are
// display paths, values are file text. Pure — the filesystem walk belongs to the
// caller, so a test can drive this from inline strings and a build can drive it
// from a real scan.
export function buildSceneComponentIndex(
  documents: ReadonlyMap<string, string>,
): SceneComponentIndex {
  const ids = new Set<string>();
  const incomplete: string[] = [];

  if (documents.size === 0) {
    incomplete.push("no scene sources were read, so no component id can be proven absent");
    return { ids, incomplete };
  }

  for (const [displayPath, text] of documents) {
    try {
      collect(parseSceneTextFormat(text), "", 0, displayPath, ids, incomplete);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      incomplete.push(`${displayPath}: could not be parsed (${error.message})`);
    }
  }

  return { ids, incomplete };
}
