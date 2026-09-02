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

// A component id and the resource it references, where one is referenced at all.
// The two axes are gathered by one pass because they are read off the same
// block: a second walk over the same documents is exactly how the id universe
// and the resource universe drift apart.
export interface ComponentDeclarations {
  readonly ids: Set<string>;
  readonly resources: Map<string, string>;
}

// Resource paths inside a scene are project-absolute; documents are keyed by
// project-relative display path, the same convention `resourceKey` follows in
// `scene-object-path-index.ts`.
function resourceKey(resource: string): string {
  return resource.startsWith("/") ? resource.slice(1) : resource;
}

function collect(
  message: SceneMessage,
  blockName: string,
  depth: number,
  displayPath: string,
  declarations: ComponentDeclarations,
  incomplete: string[],
): void {
  if (COMPONENT_BLOCKS.has(blockName)) {
    const declared = message.fields.get("id") ?? [];
    for (const id of declared) {
      declarations.ids.add(id);
    }
    // `embedded_components` is skipped on purpose: its payload *is* the
    // component, so it names no resource and must never be credited with one.
    if (blockName === "components") {
      const [id] = declared;
      const [component] = message.fields.get("component") ?? [];
      if (id !== undefined && id !== "" && component !== undefined) {
        declarations.resources.set(id, resourceKey(component));
      }
    }
  }
  if (EMBEDDING_BLOCKS.has(blockName)) {
    for (const payload of message.fields.get("data") ?? []) {
      try {
        collect(
          parseSceneTextFormat(payload),
          "",
          depth + 1,
          displayPath,
          declarations,
          incomplete,
        );
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
      collect(child, name, depth, displayPath, declarations, incomplete);
    }
  }
}

/**
 * Every component id one already-parsed scene message declares, plus the
 * resource each *referenced* component names, following the two `data:`
 * payloads Defold embeds a whole document in. Exported because the game-object
 * path walk attributes components to the object that owns them and must read
 * the same rule this index reads — a second collector is exactly how the two
 * universes drift apart.
 *
 * `blockName` names the block `message` was taken from, because the `data:`
 * re-parse is keyed off it: a whole document is `""`, while a single
 * `embedded_instances` block has to say so or its payload is never opened.
 */
export function collectComponentDeclarations(
  message: SceneMessage,
  displayPath: string,
  incomplete: string[],
  blockName = "",
): ComponentDeclarations {
  const declarations: ComponentDeclarations = { ids: new Set(), resources: new Map() };
  collect(message, blockName, 0, displayPath, declarations, incomplete);
  return declarations;
}

/** The id half of {@link collectComponentDeclarations}, for callers that join no resources. */
export function collectComponentIds(
  message: SceneMessage,
  displayPath: string,
  incomplete: string[],
  blockName = "",
): Set<string> {
  return collectComponentDeclarations(message, displayPath, incomplete, blockName).ids;
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
      for (const id of collectComponentIds(parseSceneTextFormat(text), displayPath, incomplete)) {
        ids.add(id);
      }
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      incomplete.push(`${displayPath}: could not be parsed (${error.message})`);
    }
  }

  return { ids, incomplete };
}
