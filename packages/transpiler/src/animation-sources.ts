import { parseSceneTextFormat, type SceneMessage, SceneTextFormatError } from "./scene-text-format";

// Resource paths inside a scene are project-absolute; an index keyed off one
// drops the leading `/`, so a caller maps the file it holds forward through the
// build's output-path math and looks the result up.
export function resourceKey(resource: string): string {
  return resource.startsWith("/") ? resource.slice(1) : resource;
}

// The keys a caller supplies name files on the host, so they may arrive with
// native separators; the resource paths they are matched against come out of
// scene content and are always `/`-separated. Normalizing here enforces that
// contract at the boundary instead of leaving it to whichever caller happens
// to build the maps.
export function normalizeDocumentKey(path: string): string {
  return path.replaceAll("\\", "/");
}

const SPRITE_SUFFIX = ".sprite";
const MODEL_SUFFIX = ".model";
const ANIMATION_SET_SUFFIX = ".animationset";

// The documents that carry only a hop to the ids, never the ids themselves: a
// `.sprite` names its tile source, a `.model` names its animation set, and a
// `.animationset` names the files whose basenames are the ids. Reading any of
// them for `animations { id: … }` yields an empty set that is indistinguishable
// from a real source declaring nothing.
const HOP_ONLY_SUFFIXES = [SPRITE_SUFFIX, MODEL_SUFFIX, ANIMATION_SET_SUFFIX];

function childrenOf(message: SceneMessage, name: string): readonly SceneMessage[] {
  return message.messages.get(name) ?? [];
}

// Only `animations { id: … }` counts. Defold may also expose a bare
// `images { image: … }` entry as a one-frame animation named after the file,
// which is unverified here — and a wrong suggestion in an animation slot is a
// runtime crash rather than a no-op.
export function declaredAnimations(document: SceneMessage): Set<string> {
  const ids = new Set<string>();
  for (const animation of childrenOf(document, "animations")) {
    for (const id of animation.fields.get("id") ?? []) {
      if (id !== "") ids.add(id);
    }
  }
  return ids;
}

// The animation ids every asset document declares, keyed by display path, with
// each unreadable document named in `unresolved` instead of silently declaring
// nothing. The hop-only kinds are skipped: they declare no ids of their own,
// only the path to the document that does, which their own readers parse them
// for.
//
// One reader for both animation indexes, so a sprite component and a gui
// texture can never disagree about what an atlas declares.
export function readAnimationSources(
  assets: ReadonlyMap<string, string>,
  unresolved: string[],
): Map<string, Set<string>> {
  const animationsByTileSet = new Map<string, Set<string>>();
  for (const [path, text] of assets) {
    const displayPath = normalizeDocumentKey(path);
    if (HOP_ONLY_SUFFIXES.some((suffix) => displayPath.endsWith(suffix))) continue;
    let document: SceneMessage;
    try {
      document = parseSceneTextFormat(text);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      unresolved.push(`${displayPath}: could not be parsed (${error.message})`);
      continue;
    }
    animationsByTileSet.set(displayPath, declaredAnimations(document));
  }
  return animationsByTileSet;
}

// The entry paths a `.animationset` lists, in document order. The values are
// resource paths, not ids: `AnimationSetBuilder` stamps the owning set's name
// on every animation a file contains, so the id an entry contributes is derived
// from its path rather than read out of the file it names. Empty values are
// dropped the way an empty animation id is.
export function animationSetEntries(document: SceneMessage): string[] {
  const entries: string[] = [];
  for (const entry of childrenOf(document, "animations")) {
    for (const animation of entry.fields.get("animation") ?? []) {
      if (animation !== "") entries.push(animation);
    }
  }
  return entries;
}
