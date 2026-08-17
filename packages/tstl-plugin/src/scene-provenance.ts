import {
  buildConfigKeyIndex,
  buildGuiNodeIndex,
  buildInputActionIndex,
  buildSceneComponentIndex,
  buildSceneObjectPathIndex,
  buildSpriteAnimationIndex,
  type ClassifiedSlot,
  componentIdOfSameObjectAddress,
  computeOutputRel,
  isAddressClass,
  isFragmentCaret,
} from "@defold-typescript/transpiler";
import { readBuildConfigFromHost } from "./build-config";
import {
  ANIMATION_ASSET_EXTENSIONS,
  displayPathOf,
  GAME_PROJECT_DOCUMENT,
  GUI_EXTENSIONS,
  INPUT_BINDING_EXTENSIONS,
  PROJECT_EXTENSIONS,
} from "./scene-documents";
import type { SceneIndexCache } from "./scene-index-cache";

// Keys of their own under the same cache the completion indexes use, so a
// provenance map is thrown away with every index it was derived beside — and
// never collides with the id universe a completion reads under the bare name.
const COMPONENT_PROVENANCE = "provenance:component-ids";
const ACTION_PROVENANCE = "provenance:input-actions";
const GUI_PROVENANCE = "provenance:gui-nodes";
const PATH_PROVENANCE = "provenance:object-paths";
const ANIMATION_PROVENANCE = "provenance:sprite-animations";

type Provenance = ReadonlyMap<string, readonly string[]>;

// Re-running a shipped builder over a one-document narrowing of the same map is
// what answers "did this document declare that id" — exactly, and with no
// second reader of the scene text format. It is exact only where the documents
// are independent, which is what keeps composed universes out of this module.
function byDeclaringDocument(
  documents: ReadonlyMap<string, string>,
  idsOf: (narrowed: ReadonlyMap<string, string>) => Iterable<string>,
): Provenance {
  const declarers = new Map<string, string[]>();
  for (const [displayPath, text] of documents) {
    for (const id of idsOf(new Map([[displayPath, text]]))) {
      const paths = declarers.get(id);
      if (paths) {
        paths.push(displayPath);
      } else {
        declarers.set(id, [displayPath]);
      }
    }
  }
  for (const paths of declarers.values()) paths.sort();
  return declarers;
}

// A `.gui` claims one generated script, so a node id is only provenance for the
// file that script belongs to. Narrowing keeps two `.gui` files claiming the
// same script from cancelling each other out the way the whole-project index
// makes them: both really do declare the id.
function byClaimedScript(documents: ReadonlyMap<string, string>): ReadonlyMap<string, Provenance> {
  const byResource = new Map<string, Map<string, string[]>>();
  for (const [displayPath, text] of documents) {
    const index = buildGuiNodeIndex(new Map([[displayPath, text]]));
    for (const [resource, ids] of index.byScriptResource) {
      let declarers = byResource.get(resource);
      if (!declarers) {
        declarers = new Map();
        byResource.set(resource, declarers);
      }
      for (const id of ids) {
        const paths = declarers.get(id);
        if (paths) {
          paths.push(displayPath);
        } else {
          declarers.set(id, [displayPath]);
        }
      }
    }
  }
  for (const declarers of byResource.values()) {
    for (const paths of declarers.values()) paths.sort();
  }
  return byResource;
}

function componentProvenance(cache: SceneIndexCache): Provenance {
  return cache.derived(COMPONENT_PROVENANCE, () =>
    byDeclaringDocument(
      cache.documents().documents,
      (narrowed) => buildSceneComponentIndex(narrowed).ids,
    ),
  );
}

function actionProvenance(cache: SceneIndexCache): Provenance {
  return cache.derived(ACTION_PROVENANCE, () =>
    byDeclaringDocument(cache.documents(INPUT_BINDING_EXTENSIONS).documents, (narrowed) =>
      buildInputActionIndex(narrowed),
    ),
  );
}

function nodeProvenance(cache: SceneIndexCache, fileName: string): Provenance {
  const byResource = cache.derived(GUI_PROVENANCE, () =>
    byClaimedScript(cache.documents(GUI_EXTENSIONS).documents),
  );
  // An output path cannot say which include base produced it, so the file being
  // edited is mapped forward through the build's own math — the same direction
  // the completion path takes.
  const config = readBuildConfigFromHost(cache.host, cache.projectRoot);
  const resource = computeOutputRel(
    displayPathOf(cache.projectRoot, fileName),
    config,
    "gui-script",
  );
  return byResource.get(resource) ?? new Map();
}

// A composed path is not a narrowing of anything: the builder records the
// document declaring each leaf as it walks, so the map is read straight off the
// index rather than recovered by re-running it per document.
function pathProvenance(cache: SceneIndexCache): Provenance {
  return cache.derived(
    PATH_PROVENANCE,
    () => buildSceneObjectPathIndex(cache.documents().documents).declaredIn,
  );
}

// Scoped exactly the way the animation completion is: to the sprite component
// the slot's sibling literal addresses on the one game object owning this
// script, resolved through the same helper so the two cannot disagree about
// which sprite is addressed. The tile set is reported only for an id it really
// declares — a panel naming a file that does not carry the name is the
// fabricated answer this surface exists to avoid.
function animationProvenance(input: {
  slot: ClassifiedSlot;
  cache: SceneIndexCache;
  fileName: string;
  entryName: string;
}): readonly string[] {
  const { slot, cache, fileName, entryName } = input;
  const component = componentIdOfSameObjectAddress(slot.addressText ?? "");
  if (component === undefined) return [];
  const index = cache.derived(ANIMATION_PROVENANCE, () =>
    buildSpriteAnimationIndex({
      scenes: cache.documents().documents,
      assets: cache.documents(ANIMATION_ASSET_EXTENSIONS).documents,
    }),
  );
  const config = readBuildConfigFromHost(cache.host, cache.projectRoot);
  const resource = computeOutputRel(displayPathOf(cache.projectRoot, fileName), config, "script");
  const tileSet = index.tileSetByScriptResource.get(resource)?.get(component);
  if (tileSet === undefined) return [];
  return index.byScriptResource.get(resource)?.get(component)?.has(entryName) ? [tileSet] : [];
}

// A config key is declared by the one file that answers a reader at runtime, and
// a resource path is declared by the file it names. Both are still checked
// against the project rather than asserted: a panel naming a document that does
// not carry the id is the fabricated answer this whole surface exists to avoid.
function constantProvenance(
  slot: ClassifiedSlot,
  cache: SceneIndexCache,
  entryName: string,
): readonly string[] {
  if (slot.class === "config-key") {
    const text = cache.documents(PROJECT_EXTENSIONS).documents.get(GAME_PROJECT_DOCUMENT);
    if (text === undefined) return [];
    const keys = cache.derived("config-keys", () => buildConfigKeyIndex(text));
    return keys.has(entryName) ? [GAME_PROJECT_DOCUMENT] : [];
  }
  const extensions = slot.resourceExtensions;
  if (extensions === undefined || extensions.length === 0) return [];
  return cache.resourcePaths(extensions).has(entryName) ? [entryName.replace(/^\//, "")] : [];
}

// The display paths of the project files that declare `entryName` in the
// universe this slot draws from, sorted, empty when the project does not name
// one exactly. Every kind the completion path offers is answered here; silence
// means the file could not be named, not that the kind is uncovered, and it
// forwards the request to the editor's own panel.
export function resolveEntryProvenance(input: {
  slot: ClassifiedSlot;
  position: number;
  cache: SceneIndexCache;
  fileName: string;
  entryName: string;
}): readonly string[] {
  const { slot, position, cache, fileName, entryName } = input;
  if (isAddressClass(slot.class)) {
    // The caret decides which universe owns the request, on the same predicate
    // the completion path offers from — so a name carried by both maps is still
    // answered from the one the author is standing in.
    if (!isFragmentCaret(slot, position)) {
      return pathProvenance(cache).get(entryName) ?? [];
    }
    return componentProvenance(cache).get(entryName) ?? [];
  }
  if (slot.class === "gui-node") {
    return nodeProvenance(cache, fileName).get(entryName) ?? [];
  }
  if (slot.class === "action-id") {
    return actionProvenance(cache).get(entryName) ?? [];
  }
  if (slot.class === "animation") {
    return animationProvenance({ slot, cache, fileName, entryName });
  }
  if (slot.class === "config-key" || slot.class === "resource-path") {
    return constantProvenance(slot, cache, entryName);
  }
  return [];
}
