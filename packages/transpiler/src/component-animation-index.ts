import {
  animationSetEntries,
  normalizeDocumentKey,
  readAnimationSources,
  resourceKey,
} from "./animation-sources";
import { parseSceneTextFormat, type SceneMessage, SceneTextFormatError } from "./scene-text-format";

// The animation ids each script may play, keyed first by the project-relative
// resource path of the `.script` that owns them and then by the id of the
// component they belong to, plus an honest record of every link that could not
// be settled. A missing key means nothing may be offered for it; an empty set
// means the component resolved and declares no animation.
export interface ComponentAnimationIndex {
  readonly byScriptResource: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>;
  // The display path of the document each keyed component's ids were read from
  // — an atlas or tile source for a sprite, an animation set for a model —
  // under the same two keys. Present for exactly the components
  // `byScriptResource` keys, so the two can never disagree about a resource.
  readonly sourceByScriptResource: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly unresolved: readonly string[];
}

const SCRIPT_SUFFIX = ".script";
const SPRITE_SUFFIX = ".sprite";
const MODEL_SUFFIX = ".model";
const ANIMATION_SET_SUFFIX = ".animationset";

// The only mesh containers `AnimationSetBuilder` accepts. Anything else in an
// entry is a build error, so it may contribute no id.
const MESH_SUFFIXES = [".gltf", ".glb"];

function firstField(message: SceneMessage, name: string): string | undefined {
  return (message.fields.get(name) ?? [])[0];
}

function childrenOf(message: SceneMessage, name: string): readonly SceneMessage[] {
  return message.messages.get(name) ?? [];
}

// The id an animation-set entry contributes, before its prefix: the entry's
// filename with its extension dropped. The names inside the mesh container are
// never read — for a set the editor stamps the owning name on every animation
// the file holds, so the path is the whole answer.
function basename(resource: string): string {
  const file = resource.slice(resource.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  return dot === -1 ? file : file.slice(0, dot);
}

// Which kind of document a component reads its ids from. The two resolve
// differently — a tile source declares ids outright, an animation set names
// files whose basenames are the ids — while sharing one key space, because
// component ids are unique within a game object.
type AnimationSourceKind = "sprite" | "model";

interface AnimationSource {
  readonly kind: AnimationSourceKind;
  readonly path: string;
}

interface AssetIndex {
  readonly animationsByTileSet: Map<string, Set<string>>;
  readonly tileSetBySprite: Map<string, string>;
  readonly modelDocuments: Set<string>;
  readonly animationSourceByModel: Map<string, string>;
  readonly entriesByAnimationSet: Map<string, readonly string[]>;
}

function readAssets(assets: ReadonlyMap<string, string>, unresolved: string[]): AssetIndex {
  const animationsByTileSet = readAnimationSources(assets, unresolved);
  const tileSetBySprite = new Map<string, string>();
  const modelDocuments = new Set<string>();
  const animationSourceByModel = new Map<string, string>();
  const entriesByAnimationSet = new Map<string, readonly string[]>();

  for (const [path, text] of assets) {
    const displayPath = normalizeDocumentKey(path);
    const isSprite = displayPath.endsWith(SPRITE_SUFFIX);
    const isModel = displayPath.endsWith(MODEL_SUFFIX);
    const isAnimationSet = displayPath.endsWith(ANIMATION_SET_SUFFIX);
    if (!isSprite && !isModel && !isAnimationSet) continue;
    let document: SceneMessage;
    try {
      document = parseSceneTextFormat(text);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      unresolved.push(`${displayPath}: could not be parsed (${error.message})`);
      continue;
    }
    if (isSprite) {
      const tileSet = firstField(document, "tile_set");
      if (tileSet !== undefined) tileSetBySprite.set(displayPath, resourceKey(tileSet));
      continue;
    }
    if (isModel) {
      modelDocuments.add(displayPath);
      const animations = firstField(document, "animations");
      if (animations !== undefined) animationSourceByModel.set(displayPath, animations);
      continue;
    }
    entriesByAnimationSet.set(displayPath, animationSetEntries(document));
  }

  return {
    animationsByTileSet,
    tileSetBySprite,
    modelDocuments,
    animationSourceByModel,
    entriesByAnimationSet,
  };
}

// The ids one animation set contributes, or `undefined` when the chain itself
// could not be read. An entry in an unsupported format is refused on its own
// and the rest of the set still stands, because that entry is a build error the
// author sees; a missing document or a cycle breaks the chain instead, and a
// partial answer from a chain that is not understood is exactly the wrong guess
// this index refuses to make.
function resolveAnimationSet(input: {
  path: string;
  prefix: string;
  visited: Set<string>;
  assets: AssetIndex;
  unresolved: string[];
}): Set<string> | undefined {
  const { path, prefix, visited, assets, unresolved } = input;
  const entries = assets.entriesByAnimationSet.get(path);
  if (entries === undefined) return undefined;

  visited.add(path);
  const ids = new Set<string>();
  for (const entry of entries) {
    const key = resourceKey(entry);
    if (MESH_SUFFIXES.some((suffix) => key.endsWith(suffix))) {
      ids.add(prefix + basename(key));
      continue;
    }
    if (!key.endsWith(ANIMATION_SET_SUFFIX)) {
      unresolved.push(
        `${path}: the entry ${entry} is not a .gltf, .glb or .animationset, so it declares no animation id`,
      );
      continue;
    }
    if (!assets.entriesByAnimationSet.has(key)) {
      unresolved.push(
        `${path}: the entry ${entry} is not among the project's animation set documents`,
      );
      return undefined;
    }
    if (visited.has(key)) {
      unresolved.push(
        `${path}: the entry ${entry} re-enters an animation set already being read, so the chain is cyclic`,
      );
      return undefined;
    }
    const nested = resolveAnimationSet({
      path: key,
      prefix: `${prefix + basename(key)}/`,
      visited,
      assets,
      unresolved,
    });
    if (nested === undefined) return undefined;
    for (const id of nested) ids.add(id);
  }
  return ids;
}

// The animation-declaring components of one game object, as
// `id -> source document`. An embedded component carries its own payload; a
// referenced one names a document that carries it instead. A `.model` naming a
// mesh source directly is refused here rather than resolved: the editor and the
// build pipeline disagree about which ids such a model can play, so no id is
// established and the model is named in `unresolved`.
function componentAnimationSources(
  object: SceneMessage,
  displayPath: string,
  assets: AssetIndex,
  unresolved: string[],
): Map<string, AnimationSource> {
  const sources = new Map<string, AnimationSource>();

  function claimModel(id: string, animations: string): void {
    if (!animations.endsWith(ANIMATION_SET_SUFFIX)) {
      unresolved.push(
        `${displayPath}: the model component "${id}" names ${animations} rather than an animation set, so none of its animation ids are established`,
      );
      return;
    }
    sources.set(id, { kind: "model", path: resourceKey(animations) });
  }

  for (const embedded of childrenOf(object, "embedded_components")) {
    const type = firstField(embedded, "type");
    if (type !== "sprite" && type !== "model") continue;
    const id = firstField(embedded, "id");
    const payload = firstField(embedded, "data");
    if (id === undefined || payload === undefined) continue;
    let document: SceneMessage;
    try {
      document = parseSceneTextFormat(payload);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      unresolved.push(
        `${displayPath}: the embedded ${type} "${id}" could not be read (${error.message})`,
      );
      continue;
    }
    if (type === "sprite") {
      const tileSet = firstField(document, "tile_set");
      if (tileSet !== undefined) sources.set(id, { kind: "sprite", path: resourceKey(tileSet) });
      continue;
    }
    const animations = firstField(document, "animations");
    if (animations !== undefined) claimModel(id, animations);
  }

  for (const referenced of childrenOf(object, "components")) {
    const component = firstField(referenced, "component");
    const id = firstField(referenced, "id");
    if (id === undefined || component === undefined) continue;
    if (component.endsWith(SPRITE_SUFFIX)) {
      const tileSet = assets.tileSetBySprite.get(resourceKey(component));
      if (tileSet === undefined) {
        unresolved.push(
          `${displayPath}: the sprite component "${id}" names ${component}, which is not among the project's sprite documents`,
        );
        continue;
      }
      sources.set(id, { kind: "sprite", path: tileSet });
      continue;
    }
    if (!component.endsWith(MODEL_SUFFIX)) continue;
    const resource = resourceKey(component);
    if (!assets.modelDocuments.has(resource)) {
      unresolved.push(
        `${displayPath}: the model component "${id}" names ${component}, which is not among the project's model documents`,
      );
      continue;
    }
    // A model that declares no animations at all is a legitimate authoring
    // state, not a broken link: it resolves to nothing and says nothing.
    const animations = assets.animationSourceByModel.get(resource);
    if (animations !== undefined) claimModel(id, animations);
  }

  return sources;
}

function scriptResourcesOf(object: SceneMessage): string[] {
  const resources: string[] = [];
  for (const component of childrenOf(object, "components")) {
    const resource = firstField(component, "component");
    if (resource === undefined || !resource.endsWith(SCRIPT_SUFFIX)) continue;
    const key = resourceKey(resource);
    if (key !== SCRIPT_SUFFIX.slice(1)) resources.push(key);
  }
  return resources;
}

function isGameObject(message: SceneMessage): boolean {
  return message.messages.has("components") || message.messages.has("embedded_components");
}

export function buildComponentAnimationIndex(input: {
  scenes: ReadonlyMap<string, string>;
  assets: ReadonlyMap<string, string>;
}): ComponentAnimationIndex {
  const unresolved: string[] = [];
  const assets = readAssets(input.assets, unresolved);
  const byScriptResource = new Map<string, ReadonlyMap<string, ReadonlySet<string>>>();
  const sourceByScriptResource = new Map<string, ReadonlyMap<string, string>>();
  const claimedBy = new Map<string, string>();

  // A `.go` document is a game object at its root; a `.collection` carries one
  // inside each `embedded_instances` `data:` payload, decoded exactly one level
  // at a time. No `instances { prototype: }` edge is followed: the referenced
  // `.go` is its own document and already claims its own script.
  function walk(message: SceneMessage, blockName: string, displayPath: string): void {
    if (isGameObject(message)) {
      claim(message, displayPath);
    }
    if (blockName === "embedded_instances") {
      for (const payload of message.fields.get("data") ?? []) {
        try {
          walk(parseSceneTextFormat(payload), "", displayPath);
        } catch (error) {
          if (!(error instanceof SceneTextFormatError)) throw error;
          unresolved.push(
            `${displayPath}: an embedded game object could not be read (${error.message})`,
          );
        }
      }
    }
    for (const [name, nested] of message.messages) {
      for (const child of nested) {
        walk(child, name, displayPath);
      }
    }
  }

  function idsOf(
    id: string,
    source: AnimationSource,
    displayPath: string,
  ): Set<string> | undefined {
    if (source.kind === "sprite") {
      const declared = assets.animationsByTileSet.get(source.path);
      if (declared !== undefined) return declared;
      unresolved.push(
        `${displayPath}: the sprite component "${id}" names the tile source /${source.path}, which is not among the project's asset documents`,
      );
      return undefined;
    }
    const resolved = resolveAnimationSet({
      path: source.path,
      prefix: "",
      visited: new Set(),
      assets,
      unresolved,
    });
    if (resolved !== undefined) return resolved;
    if (!assets.entriesByAnimationSet.has(source.path)) {
      unresolved.push(
        `${displayPath}: the model component "${id}" names the animation set /${source.path}, which is not among the project's asset documents`,
      );
    }
    return undefined;
  }

  function claim(object: SceneMessage, displayPath: string): void {
    const scripts = scriptResourcesOf(object);
    if (scripts.length === 0) return;

    const sources = componentAnimationSources(object, displayPath, assets, unresolved);
    const animations = new Map<string, ReadonlySet<string>>();
    const declaringSources = new Map<string, string>();
    for (const [id, source] of sources) {
      const ids = idsOf(id, source, displayPath);
      if (ids === undefined) continue;
      animations.set(id, ids);
      declaringSources.set(id, source.path);
    }

    for (const key of scripts) {
      const owner = claimedBy.get(key);
      if (owner !== undefined) {
        byScriptResource.delete(key);
        sourceByScriptResource.delete(key);
        unresolved.push(
          `${key}: claimed by both ${owner} and ${displayPath}, so its component animations are ambiguous`,
        );
        continue;
      }
      claimedBy.set(key, displayPath);
      byScriptResource.set(key, animations);
      sourceByScriptResource.set(key, declaringSources);
    }
  }

  for (const [path, text] of input.scenes) {
    const displayPath = normalizeDocumentKey(path);
    try {
      walk(parseSceneTextFormat(text), "", displayPath);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      unresolved.push(`${displayPath}: could not be parsed (${error.message})`);
    }
  }

  return { byScriptResource, sourceByScriptResource, unresolved };
}

// The component id a same-object `"#id"` address names, or `undefined` for
// every other form. A path form names a component on a *different* game
// object, so its id must never be resolved against this script's own.
export function componentIdOfSameObjectAddress(address: string): string | undefined {
  if (!address.startsWith("#")) return undefined;
  const id = address.slice(1);
  if (id === "" || id.includes("/") || id.includes("#")) return undefined;
  return id;
}
