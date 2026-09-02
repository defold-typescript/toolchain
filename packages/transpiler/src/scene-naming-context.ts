import type { SceneObjectPathIndex } from "./scene-object-path-index";

/**
 * One place a script runs, and the addressing frame it runs in. At runtime an
 * instance carries `m_CollectionPathHashState` seeded from its compiled id up
 * to and including the last `/`, and `GetAbsoluteIdentifier` resolves a
 * relative string by continuing that hash — so a relative address written in a
 * script means one thing from this object and nothing anywhere else.
 */
export interface NamingContext {
  /** The world-qualified composed path of the object hosting the script. */
  readonly object: string;
  /** The proxy socket this object lives behind, or `undefined` in the bootstrap world. */
  readonly socket: string | undefined;
  /**
   * `object` through its last `/`, inclusive — the collection path a relative
   * address continues. World-qualified by construction, so a relative address
   * can never resolve across a world.
   */
  readonly prefix: string;
}

const SCRIPT_SUFFIX = ".script";
const GUI_SUFFIX = ".gui";

function contextOf(object: string): NamingContext {
  // A world-qualified key is `socket:/path`; the socket is whatever precedes
  // the first `/`, minus its `:`. The bootstrap world's keys start with `/`, so
  // they yield no socket rather than an empty one.
  const worldEnd = object.indexOf("/");
  const qualifier = worldEnd <= 0 ? "" : object.slice(0, worldEnd);
  const socket = qualifier.endsWith(":") ? qualifier.slice(0, -1) : undefined;
  return { object, socket, prefix: object.slice(0, object.lastIndexOf("/") + 1) };
}

/**
 * Every naming context each script resource runs in, keyed by that resource and
 * sorted by object path.
 *
 * `guiScripts` maps a `.gui` display path to the gui-script resource it names,
 * which the caller builds with `guiScriptResourceOf` — the walk needs no `.gui`
 * documents of its own.
 *
 * A script hosted by several objects has several contexts, and that is not
 * ambiguity: a `.go` instanced in two collections genuinely runs in both, and
 * it is the consumer's provenance that tells an author which context an entry
 * resolves from.
 */
export function buildScriptNamingContexts(
  index: SceneObjectPathIndex,
  guiScripts: ReadonlyMap<string, string>,
): ReadonlyMap<string, readonly NamingContext[]> {
  const contexts = new Map<string, NamingContext[]>();

  for (const [object, resources] of index.componentResourcesOf) {
    for (const resource of resources.values()) {
      const script = resource.endsWith(SCRIPT_SUFFIX)
        ? resource
        : resource.endsWith(GUI_SUFFIX)
          ? guiScripts.get(resource)
          : undefined;
      if (script === undefined) continue;
      const hosted = contexts.get(script);
      if (hosted === undefined) {
        contexts.set(script, [contextOf(object)]);
      } else if (!hosted.some((context) => context.object === object)) {
        hosted.push(contextOf(object));
      }
    }
  }

  for (const hosted of contexts.values()) {
    hosted.sort((a, b) => a.object.localeCompare(b.object));
  }
  return contexts;
}

/**
 * The relative forms a script may write from one naming context: every object
 * path under the context's prefix with that prefix stripped, and each of those
 * joined to the components its object owns.
 *
 * An object `componentsOf` withheld still contributes its path — the object is
 * provably there — but no `#component` join, because which components it owns
 * was never read.
 */
export function relativeAddressesFrom(
  index: SceneObjectPathIndex,
  context: NamingContext,
): { readonly paths: ReadonlySet<string>; readonly addresses: ReadonlySet<string> } {
  const paths = new Set<string>();
  const addresses = new Set<string>();

  for (const key of index.paths) {
    if (!key.startsWith(context.prefix)) continue;
    const relative = key.slice(context.prefix.length);
    if (relative === "") continue;
    paths.add(relative);
    for (const id of index.componentsOf.get(key) ?? []) {
      addresses.add(`${relative}#${id}`);
    }
  }

  return { paths, addresses };
}
