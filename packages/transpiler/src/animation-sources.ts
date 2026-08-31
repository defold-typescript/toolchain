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
// nothing. A `.sprite` is skipped: it declares no ids of its own, only the hop
// to the tile source that does, which its own reader parses it for.
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
    if (displayPath.endsWith(SPRITE_SUFFIX)) continue;
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
