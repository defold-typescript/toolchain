import { parseSceneTextFormat, type SceneMessage, SceneTextFormatError } from "./scene-text-format";

// The animation ids each script may play, keyed first by the project-relative
// resource path of the `.script` that owns them and then by the id of the
// sprite component they belong to, plus an honest record of every link that
// could not be settled. A missing key means nothing may be offered for it; an
// empty set means the component resolved and declares no animation.
export interface SpriteAnimationIndex {
  readonly byScriptResource: ReadonlyMap<string, ReadonlyMap<string, ReadonlySet<string>>>;
  // The display path of the tile source each keyed component's ids were read
  // from, under the same two keys. Present for exactly the components
  // `byScriptResource` keys, so the two can never disagree about a resource.
  readonly tileSetByScriptResource: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly unresolved: readonly string[];
}

// Resource paths inside a scene are project-absolute; the index is keyed the
// way `buildGuiNodeIndex` keys its own, with the leading `/` dropped, so a
// caller maps the file it holds forward through the build's output-path math
// and looks the result up here.
function resourceKey(resource: string): string {
  return resource.startsWith("/") ? resource.slice(1) : resource;
}

const SCRIPT_SUFFIX = ".script";
const SPRITE_SUFFIX = ".sprite";

function firstField(message: SceneMessage, name: string): string | undefined {
  return (message.fields.get(name) ?? [])[0];
}

function childrenOf(message: SceneMessage, name: string): readonly SceneMessage[] {
  return message.messages.get(name) ?? [];
}

// Only `animations { id: … }` counts. Defold may also expose a bare
// `images { image: … }` entry as a one-frame animation named after the file,
// which is unverified here — and a wrong suggestion in this slot is a runtime
// crash rather than a no-op.
function declaredAnimations(document: SceneMessage): Set<string> {
  const ids = new Set<string>();
  for (const animation of childrenOf(document, "animations")) {
    for (const id of animation.fields.get("id") ?? []) {
      if (id !== "") ids.add(id);
    }
  }
  return ids;
}

interface AssetIndex {
  readonly animationsByTileSet: Map<string, Set<string>>;
  readonly tileSetBySprite: Map<string, string>;
}

function readAssets(assets: ReadonlyMap<string, string>, unresolved: string[]): AssetIndex {
  const animationsByTileSet = new Map<string, Set<string>>();
  const tileSetBySprite = new Map<string, string>();

  for (const [displayPath, text] of assets) {
    let document: SceneMessage;
    try {
      document = parseSceneTextFormat(text);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      unresolved.push(`${displayPath}: could not be parsed (${error.message})`);
      continue;
    }
    if (displayPath.endsWith(SPRITE_SUFFIX)) {
      const tileSet = firstField(document, "tile_set");
      if (tileSet !== undefined) tileSetBySprite.set(displayPath, resourceKey(tileSet));
      continue;
    }
    animationsByTileSet.set(displayPath, declaredAnimations(document));
  }

  return { animationsByTileSet, tileSetBySprite };
}

// The sprite components of one game object, as `id -> tile_set resource`. An
// embedded sprite carries its own payload; a referenced one names a `.sprite`
// document that carries it instead.
function spriteTileSets(
  object: SceneMessage,
  displayPath: string,
  assets: AssetIndex,
  unresolved: string[],
): Map<string, string> {
  const tileSets = new Map<string, string>();

  for (const embedded of childrenOf(object, "embedded_components")) {
    if (firstField(embedded, "type") !== "sprite") continue;
    const id = firstField(embedded, "id");
    const payload = firstField(embedded, "data");
    if (id === undefined || payload === undefined) continue;
    try {
      const tileSet = firstField(parseSceneTextFormat(payload), "tile_set");
      if (tileSet !== undefined) tileSets.set(id, resourceKey(tileSet));
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      unresolved.push(
        `${displayPath}: the embedded sprite "${id}" could not be read (${error.message})`,
      );
    }
  }

  for (const referenced of childrenOf(object, "components")) {
    const component = firstField(referenced, "component");
    const id = firstField(referenced, "id");
    if (id === undefined || component === undefined || !component.endsWith(SPRITE_SUFFIX)) continue;
    const tileSet = assets.tileSetBySprite.get(resourceKey(component));
    if (tileSet === undefined) {
      unresolved.push(
        `${displayPath}: the sprite component "${id}" names ${component}, which is not among the project's sprite documents`,
      );
      continue;
    }
    tileSets.set(id, tileSet);
  }

  return tileSets;
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

export function buildSpriteAnimationIndex(input: {
  scenes: ReadonlyMap<string, string>;
  assets: ReadonlyMap<string, string>;
}): SpriteAnimationIndex {
  const unresolved: string[] = [];
  const assets = readAssets(input.assets, unresolved);
  const byScriptResource = new Map<string, ReadonlyMap<string, ReadonlySet<string>>>();
  const tileSetByScriptResource = new Map<string, ReadonlyMap<string, string>>();
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

  function claim(object: SceneMessage, displayPath: string): void {
    const scripts = scriptResourcesOf(object);
    if (scripts.length === 0) return;

    const tileSets = spriteTileSets(object, displayPath, assets, unresolved);
    const animations = new Map<string, ReadonlySet<string>>();
    const declaringTileSets = new Map<string, string>();
    for (const [id, tileSet] of tileSets) {
      const declared = assets.animationsByTileSet.get(tileSet);
      if (declared === undefined) {
        unresolved.push(
          `${displayPath}: the sprite component "${id}" names the tile source /${tileSet}, which is not among the project's asset documents`,
        );
        continue;
      }
      animations.set(id, declared);
      declaringTileSets.set(id, tileSet);
    }

    for (const key of scripts) {
      const owner = claimedBy.get(key);
      if (owner !== undefined) {
        byScriptResource.delete(key);
        tileSetByScriptResource.delete(key);
        unresolved.push(
          `${key}: claimed by both ${owner} and ${displayPath}, so its sprite animations are ambiguous`,
        );
        continue;
      }
      claimedBy.set(key, displayPath);
      byScriptResource.set(key, animations);
      tileSetByScriptResource.set(key, declaringTileSets);
    }
  }

  for (const [displayPath, text] of input.scenes) {
    try {
      walk(parseSceneTextFormat(text), "", displayPath);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      unresolved.push(`${displayPath}: could not be parsed (${error.message})`);
    }
  }

  return { byScriptResource, tileSetByScriptResource, unresolved };
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
