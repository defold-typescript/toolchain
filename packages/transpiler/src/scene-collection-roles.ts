import { readGameProjectSetting } from "./config-key-index";
import { parseSceneTextFormat, type SceneMessage, SceneTextFormatError } from "./scene-text-format";

// Which world each collection is, so an address can say where it resolves. A
// game object's address has two axes — which world, then which path inside it —
// and only these roles can tell them apart. Shaped like the indexes it feeds: a
// non-empty `incomplete` means the classification is not provably whole, so no
// consumer may conclude a collection has no role.
export interface SceneCollectionRoles {
  /** The one collection `[bootstrap] main_collection` names, whose paths are bare. */
  readonly bootstrap?: string | undefined;
  /** Proxied collections, mapped to the socket `CollectionDesc.name` gives them. */
  readonly sockets: ReadonlyMap<string, string>;
  /** Collections another collection instances, whose paths exist only under that id. */
  readonly instanced: ReadonlySet<string>;
  /** Collection-factory prototypes, whose objects have no static path at all. */
  readonly factoryPrototypes: ReadonlySet<string>;
  readonly incomplete: readonly string[];
}

export interface SceneCollectionRolesInput {
  /** The `.go`/`.collection` universe, keyed by display path. */
  readonly documents: ReadonlyMap<string, string>;
  /** The `.collectionproxy`/`.collectionfactory` documents, keyed by display path. */
  readonly references: ReadonlyMap<string, string>;
  /** `game.project`'s text, or `undefined` when the walk could not read it. */
  readonly gameProject: string | undefined;
}

// The two places Defold embeds a whole escaped document in `data:`, the same
// rule `buildSceneComponentIndex` states — every other `data:` is a plain scalar.
const EMBEDDING_BLOCKS = new Set(["embedded_instances", "embedded_components"]);

// A component reference and the field its document holds the target under: a
// proxy names the collection it opens as a world, a factory names the prototype
// it spawns copies of.
const REFERENCE_KINDS = [
  { extension: ".collectionproxy", type: "collectionproxy", field: "collection" },
  { extension: ".collectionfactory", type: "collectionfactory", field: "prototype" },
] as const;

type ReferenceKind = (typeof REFERENCE_KINDS)[number];

// Matches `scene-object-path-index.ts`: resource paths inside a scene are
// project-absolute, documents are keyed by project-relative display path.
function resourceKey(resource: string): string {
  return resource.startsWith("/") ? resource.slice(1) : resource;
}

// `game.project` and a `.collectionproxy` name the *compiled* resource the
// engine loads (`/main/main.collectionc`), not the source the walk read — the
// same normalisation `resolveBootPathScripts` applies to its own boot walk.
// Without it every real project fails to find its bootstrap world.
function collectionKey(resource: string): string {
  return resourceKey(resource).replace(/\.collectionc$/, ".collection");
}

function firstField(message: SceneMessage, name: string): string | undefined {
  return (message.fields.get(name) ?? [])[0];
}

// Only a `.collection` is a world. A `.go` is a prototype, so running the role
// rules over it would make every prototype in the project a role-less
// "reachable no way" entry and drown the honest ones.
function isCollection(displayPath: string): boolean {
  return displayPath.endsWith(".collection");
}

/**
 * Classify every collection the project declares into the world it is: the one
 * bootstrap root, a proxy world addressed through its own socket, a collection
 * instanced inside another, or a factory prototype with no static address.
 *
 * Pure, like the indexes it feeds — the filesystem walk belongs to the caller.
 * There is deliberately no everything-else-is-a-root fallback: that fallback is
 * what offers a bare `/enemy` for an object living in another world, and losing
 * a completion is safe where offering a false one is not.
 */
export function buildSceneCollectionRoles(input: SceneCollectionRolesInput): SceneCollectionRoles {
  const { documents, references, gameProject } = input;
  const incomplete: string[] = [];

  const parsed = new Map<string, SceneMessage>();
  for (const [displayPath, text] of documents) {
    try {
      parsed.set(displayPath, parseSceneTextFormat(text));
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      incomplete.push(`${displayPath}: could not be parsed (${error.message})`);
    }
  }

  const instanced = new Set<string>();
  for (const document of parsed.values()) {
    for (const block of document.messages.get("collection_instances") ?? []) {
      const collection = firstField(block, "collection");
      if (collection !== undefined) instanced.add(resourceKey(collection));
    }
  }

  const proxied = new Set<string>();
  const factoryPrototypes = new Set<string>();

  function record(kind: ReferenceKind, resource: string): void {
    (kind.type === "collectionproxy" ? proxied : factoryPrototypes).add(collectionKey(resource));
  }

  // A standalone reference is a component file of its own; its target lives in
  // the reference document rather than in the scene that points at it, so a
  // reference the walk never read is a named gap and not a dropped edge.
  function followReferenceDocument(displayPath: string, resource: string): void {
    const kind = REFERENCE_KINDS.find((candidate) => resource.endsWith(candidate.extension));
    if (kind === undefined) return;
    const text = references.get(resourceKey(resource));
    if (text === undefined) {
      incomplete.push(
        `${displayPath}: the component ${resource} is not among the project's readable ${kind.extension} documents, so the collection it names is unclassified`,
      );
      return;
    }
    let document: SceneMessage;
    try {
      document = parseSceneTextFormat(text);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      incomplete.push(`${resourceKey(resource)}: could not be parsed (${error.message})`);
      return;
    }
    const target = firstField(document, kind.field);
    if (target === undefined) {
      incomplete.push(
        `${resourceKey(resource)}: declares no ${kind.field}:, so the collection it names is unclassified`,
      );
      return;
    }
    record(kind, target);
  }

  function walk(
    message: SceneMessage,
    blockName: string,
    displayPath: string,
    depth: number,
  ): void {
    if (blockName === "components") {
      const component = firstField(message, "component");
      if (component !== undefined) followReferenceDocument(displayPath, component);
    }

    const payloads: SceneMessage[] = [];
    if (EMBEDDING_BLOCKS.has(blockName)) {
      for (const payload of message.fields.get("data") ?? []) {
        try {
          payloads.push(parseSceneTextFormat(payload));
        } catch (error) {
          if (!(error instanceof SceneTextFormatError)) throw error;
          incomplete.push(
            `${displayPath}: embedded payload at depth ${depth + 1} could not be parsed (${error.message})`,
          );
        }
      }
    }

    if (blockName === "embedded_components") {
      const type = firstField(message, "type");
      const kind = REFERENCE_KINDS.find((candidate) => candidate.type === type);
      if (kind !== undefined) {
        for (const payload of payloads) {
          const target = firstField(payload, kind.field);
          if (target === undefined) {
            incomplete.push(
              `${displayPath}: the embedded ${kind.type} declares no ${kind.field}:, so the collection it names is unclassified`,
            );
            continue;
          }
          record(kind, target);
        }
      }
    }

    for (const payload of payloads) walk(payload, "", displayPath, depth + 1);
    for (const [name, nested] of message.messages) {
      for (const child of nested) walk(child, name, displayPath, depth);
    }
  }

  for (const [displayPath, document] of parsed) walk(document, "", displayPath, 0);

  // The socket is the proxied collection's own `name:` — `CollectionDesc.name`,
  // which the editor writes on the collection itself and which is deliberately
  // neither the proxy component's id nor the file's basename.
  const sockets = new Map<string, string>();
  const byName = new Map<string, string[]>();
  for (const displayPath of [...proxied].sort()) {
    const document = parsed.get(displayPath);
    if (document === undefined) {
      incomplete.push(
        `${displayPath}: is opened as a collection proxy but is not among the project's readable scene documents, so its world has no name`,
      );
      continue;
    }
    const name = firstField(document, "name");
    if (name === undefined || name === "") {
      incomplete.push(
        `${displayPath}: is opened as a collection proxy but declares no name:, so its world cannot be addressed`,
      );
      continue;
    }
    sockets.set(displayPath, name);
    byName.set(name, [...(byName.get(name) ?? []), displayPath]);
  }
  for (const [name, holders] of byName) {
    if (holders.length > 1) {
      incomplete.push(
        `${holders.join(", ")}: all declare name: "${name}", so an address under that socket does not say which world it means`,
      );
    }
  }

  // A project the walk found no collection in has no world to name, so an
  // absent `[bootstrap]` says nothing a reader could act on — the same posture
  // `sceneIndexForBuild` takes towards a scene-less project. A project that does
  // have collections is a different case: there the absence is exactly why no
  // address is offered bare, so it is always named.
  const hasCollections = [...parsed.keys()].some(isCollection);

  let bootstrap: string | undefined;
  if (gameProject === undefined) {
    if (hasCollections) {
      incomplete.push(
        "game.project could not be read, so no collection is known to be the bootstrap world and no address is offered unqualified",
      );
    }
  } else {
    const main = readGameProjectSetting(gameProject, "bootstrap", "main_collection");
    if (main === undefined) {
      if (hasCollections) {
        incomplete.push(
          "game.project declares no [bootstrap] main_collection, so no collection is the bootstrap world",
        );
      }
    } else if (!parsed.has(collectionKey(main))) {
      incomplete.push(
        `game.project names ${main} as [bootstrap] main_collection, which is not among the project's readable scene documents`,
      );
    } else {
      bootstrap = collectionKey(main);
    }
  }

  for (const displayPath of parsed.keys()) {
    if (!isCollection(displayPath)) continue;
    if (
      displayPath === bootstrap ||
      sockets.has(displayPath) ||
      instanced.has(displayPath) ||
      factoryPrototypes.has(displayPath)
    ) {
      continue;
    }
    incomplete.push(
      `${displayPath}: is reached by no bootstrap, proxy, instance or factory reference, so which world its objects live in is unknown`,
    );
  }

  return { bootstrap, sockets, instanced, factoryPrototypes, incomplete };
}
