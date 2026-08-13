import { parseSceneTextFormat, type SceneMessage, SceneTextFormatError } from "./scene-text-format";

// Every game-object path the project declares, `/`-prefixed and composed the way
// Defold composes them, plus an honest record of everything the walk could not
// settle. Shaped like `SceneComponentIndex`: a non-empty `incomplete` means the
// universe is not provably whole, so no consumer may conclude a path is absent.
export interface SceneObjectPathIndex {
  readonly paths: ReadonlySet<string>;
  readonly incomplete: readonly string[];
}

// The two blocks whose `id` is a leaf segment. `collection_instances` is handled
// apart, because its id is a namespace rather than an object.
const LEAF_BLOCKS = ["instances", "embedded_instances"];

// Resource paths inside a scene are project-absolute; documents are keyed by
// project-relative display path, the same convention `resourceKey` follows in
// `sprite-animation-index.ts`.
function resourceKey(resource: string): string {
  return resource.startsWith("/") ? resource.slice(1) : resource;
}

function firstField(message: SceneMessage, name: string): string | undefined {
  return (message.fields.get(name) ?? [])[0];
}

function childrenOf(message: SceneMessage, name: string): readonly SceneMessage[] {
  return message.messages.get(name) ?? [];
}

// Build the game-object path universe from already-read scene sources: keys are
// display paths, values are file text. Pure the same way `buildSceneComponentIndex`
// is — the filesystem walk belongs to the caller.
//
// A `children:` edge is deliberately not a path segment. Defold ids are unique
// inside one collection and a child object is still addressed `/child`, so
// parenting is a transform relation; nesting comes from a collection instanced
// inside another.
export function buildSceneObjectPathIndex(
  documents: ReadonlyMap<string, string>,
): SceneObjectPathIndex {
  const incomplete: string[] = [];

  if (documents.size === 0) {
    incomplete.push("no scene sources were read, so no game-object path can be proven absent");
    return { paths: new Set(), incomplete };
  }

  const parsed = new Map<string, SceneMessage>();
  for (const [displayPath, text] of documents) {
    try {
      parsed.set(displayPath, parseSceneTextFormat(text));
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      incomplete.push(`${displayPath}: could not be parsed (${error.message})`);
    }
  }

  // A collection another document instances is not a world of its own: at
  // runtime its objects only exist under that instance's id, so contributing its
  // own unprefixed paths as well would offer addresses that resolve to nothing.
  const instanced = new Set<string>();
  for (const document of parsed.values()) {
    for (const block of childrenOf(document, "collection_instances")) {
      const collection = firstField(block, "collection");
      if (collection !== undefined) instanced.add(resourceKey(collection));
    }
  }

  // Memo keyed by display path, so a collection instanced twice is read once;
  // `inProgress` is the cycle guard, without which two collections instancing
  // each other would recur until the stack ran out.
  const composed = new Map<string, ReadonlySet<string>>();
  const inProgress = new Set<string>();

  function pathsOf(displayPath: string): ReadonlySet<string> {
    const done = composed.get(displayPath);
    if (done !== undefined) return done;
    if (inProgress.has(displayPath)) {
      incomplete.push(
        `${displayPath}: is instanced inside itself through a cycle of collection references, so its paths cannot be composed`,
      );
      return new Set();
    }
    const document = parsed.get(displayPath);
    if (document === undefined) return new Set();

    inProgress.add(displayPath);
    const paths = new Set<string>();

    for (const blockName of LEAF_BLOCKS) {
      for (const block of childrenOf(document, blockName)) {
        const id = firstField(block, "id");
        if (id !== undefined && id !== "") paths.add(`/${id}`);
      }
    }

    for (const block of childrenOf(document, "collection_instances")) {
      const id = firstField(block, "id");
      const collection = firstField(block, "collection");
      if (id === undefined || id === "" || collection === undefined) continue;
      const key = resourceKey(collection);
      if (!parsed.has(key)) {
        incomplete.push(
          `${displayPath}: the collection instance "${id}" names ${collection}, which is not among the project's readable scene documents`,
        );
        continue;
      }
      for (const nested of pathsOf(key)) {
        paths.add(`/${id}${nested}`);
      }
    }

    inProgress.delete(displayPath);
    composed.set(displayPath, paths);
    return paths;
  }

  // Composed for every document, contributed from the un-instanced ones alone: a
  // cycle or a dangling reference reached only from inside an instanced
  // collection is still a gap the caller has to hear about.
  const paths = new Set<string>();
  for (const displayPath of parsed.keys()) {
    const own = pathsOf(displayPath);
    if (instanced.has(displayPath)) continue;
    for (const path of own) paths.add(path);
  }

  return { paths, incomplete };
}
