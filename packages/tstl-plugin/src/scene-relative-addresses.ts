import {
  buildSceneObjectPathIndex,
  buildScriptNamingContexts,
  computeOutputRel,
  displayPathOf,
  GUI_EXTENSIONS,
  guiScriptResourceOf,
  type NamingContext,
  parseSceneTextFormat,
  relativeAddressesFrom,
  type SceneObjectPathIndex,
  SceneTextFormatError,
} from "@defold-typescript/transpiler";
import { readBuildConfigFromHost } from "./build-config";
import { type SceneIndexCache, sceneCollectionRolesOf } from "./scene-index-cache";

// The relative forms the file being edited may write, and the objects each one
// resolves from. Unlike every other completion universe this is per-file by
// construction: a relative address continues the collection path of the object
// hosting the script, so it means one thing from there and nothing anywhere
// else.
export interface RelativeUniverse {
  /** Every object hosting this file's generated script, sorted by object path. */
  readonly contexts: readonly NamingContext[];
  /** Relative game-object paths, valid from at least one context. */
  readonly paths: ReadonlySet<string>;
  /** Those paths joined to the components their object owns. */
  readonly addresses: ReadonlySet<string>;
  /** Entry name -> the sorted object paths it resolves from. */
  readonly contextsByEntry: ReadonlyMap<string, readonly string[]>;
}

const CONTEXTS = "relative:naming-contexts";

interface ProjectContexts {
  readonly index: SceneObjectPathIndex;
  readonly byScriptResource: ReadonlyMap<string, readonly NamingContext[]>;
}

// A `.gui` names the gui script it drives, and that indirection is the only way
// a gui script reaches an object: the walk reads the edge through the same
// production rule the node-id index keys on rather than a second reader.
function guiScriptsOf(cache: SceneIndexCache): ReadonlyMap<string, string> {
  const scripts = new Map<string, string>();
  for (const [displayPath, text] of cache.documents(GUI_EXTENSIONS).documents) {
    let resource: string | undefined;
    try {
      resource = guiScriptResourceOf(parseSceneTextFormat(text));
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      continue;
    }
    if (resource !== undefined) scripts.set(displayPath, resource);
  }
  return scripts;
}

function projectContexts(cache: SceneIndexCache): ProjectContexts {
  return cache.derived(CONTEXTS, () => {
    const index = buildSceneObjectPathIndex(
      cache.documents().documents,
      sceneCollectionRolesOf(cache),
    );
    return { index, byScriptResource: buildScriptNamingContexts(index, guiScriptsOf(cache)) };
  });
}

/**
 * The relative universe the file at `fileName` may write from, keyed per file
 * under the same cache the absolute indexes live in.
 *
 * The file is mapped *forward* to the script resource a scene would name — the
 * same direction `nodeEntries` takes, because an output path cannot say which
 * include base produced it. Both script kinds are resolved and their contexts
 * unioned: a `.ts` is named as a `.script` by a game object and as a
 * `.gui_script` by a `.gui`, and nothing in the file itself says which.
 */
export function relativeUniverseFor(cache: SceneIndexCache, fileName: string): RelativeUniverse {
  return cache.derived(`relative-universe:${fileName}`, () => {
    const { index, byScriptResource } = projectContexts(cache);
    const config = readBuildConfigFromHost(cache.host, cache.projectRoot);
    const rel = displayPathOf(cache.projectRoot, fileName);

    const byObject = new Map<string, NamingContext>();
    for (const kind of ["script", "gui-script"] as const) {
      for (const context of byScriptResource.get(computeOutputRel(rel, config, kind)) ?? []) {
        byObject.set(context.object, context);
      }
    }
    const contexts = [...byObject.values()].sort((a, b) => a.object.localeCompare(b.object));

    const paths = new Set<string>();
    const addresses = new Set<string>();
    const contextsByEntry = new Map<string, string[]>();
    for (const context of contexts) {
      const relative = relativeAddressesFrom(index, context);
      for (const entry of relative.paths) {
        paths.add(entry);
        contextsByEntry.set(entry, [...(contextsByEntry.get(entry) ?? []), context.object]);
      }
      for (const entry of relative.addresses) {
        addresses.add(entry);
        contextsByEntry.set(entry, [...(contextsByEntry.get(entry) ?? []), context.object]);
      }
    }
    for (const objects of contextsByEntry.values()) objects.sort();

    return { contexts, paths, addresses, contextsByEntry };
  });
}

/**
 * Whether a bare `/path` can resolve from where this file runs. A bare address
 * continues the caller's own world, so one offered to a script running behind a
 * proxy names an object that world cannot reach.
 *
 * A file with no naming context offers them: nothing is known about where it
 * runs, and withholding every bare path would delete the completions the
 * absolute universe has always provided. Socket-qualified keys are never
 * touched — whether a slot accepts a foreign socket is a different question.
 */
export function offersBareWorld(universe: RelativeUniverse): boolean {
  return (
    universe.contexts.length === 0 ||
    universe.contexts.some((context) => context.socket === undefined)
  );
}
