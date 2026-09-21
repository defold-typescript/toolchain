import type { SceneCollectionRoles } from "./scene-collection-roles";
import { buildSceneComponentIndex, collectComponentDeclarations } from "./scene-component-index";
import { buildSceneObjectPathIndex, type SceneObjectPathIndex } from "./scene-object-path-index";
import { parseSceneTextFormat, SceneTextFormatError } from "./scene-text-format";

const BANNER = `// Generated from this project's scenes by \`defold-typescript scene-types\`.
// Do not edit: every run rewrites it from the .go/.collection sources.
//
// Each key is an address the project declares. The aliases in
// \`@defold-typescript/types\` stay widened with \`(string & {})\`, so these keys
// only add completions — an address composed at runtime is never rejected.
`;

// Two forms, from two universes that *are* joined now. `buildSceneComponentIndex`
// reports bare component ids with no owning object, so the same-object form
// `#id` stays the whole address it can prove on its own — a `/path#id` key built
// from it alone would be a cross product claiming every object owns every
// component. The object-qualified form comes instead from the path walk's
// `componentsOf`, which attributes each id to the one object whose prototype
// declared it, and so carries the same world axis a path key does.
function componentAddressesOf(
  documents: ReadonlyMap<string, string>,
  paths: SceneObjectPathIndex,
): string[] {
  const keys = [...buildSceneComponentIndex(documents).ids].map((id) => `#${id}`);
  for (const [path, ids] of paths.componentsOf) {
    for (const id of ids) keys.push(`${path}#${id}`);
  }
  return keys;
}

// What a component address resolves to: `true` for an address that names no
// script this program compiles, else the specifier of the script module it hosts.
type AddressValues = ReadonlyMap<string, string | undefined>;

// A bare `#id` is typed only when every declaration of that id anywhere in the
// project names the same mapped script. The per-object walk covers each object a
// world reaches; the per-document pass covers what it cannot — a factory
// prototype with no static path, an embedded component under the same id — so a
// bare address never borrows one object's script for another's component.
function bareScriptsOf(
  documents: ReadonlyMap<string, string>,
  paths: SceneObjectPathIndex,
): Map<string, string | undefined> {
  const agreed = new Map<string, string | undefined>();
  const record = (id: string, resource: string | undefined): void => {
    if (!agreed.has(id)) agreed.set(id, resource);
    else if (agreed.get(id) !== resource) agreed.set(id, undefined);
  };
  for (const [path, ids] of paths.componentsOf) {
    const resources = paths.componentResourcesOf.get(path);
    for (const id of ids) record(id, resources?.get(id));
  }
  for (const [displayPath, text] of documents) {
    let declarations: ReturnType<typeof collectComponentDeclarations>;
    try {
      declarations = collectComponentDeclarations(parseSceneTextFormat(text), displayPath, []);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      continue;
    }
    for (const id of declarations.ids) record(id, declarations.resources.get(id));
  }
  return agreed;
}

function componentValuesOf(
  documents: ReadonlyMap<string, string>,
  paths: SceneObjectPathIndex,
  scriptModules: ReadonlyMap<string, string>,
): AddressValues {
  const values = new Map<string, string | undefined>();
  const moduleOf = (resource: string | undefined): string | undefined =>
    resource === undefined ? undefined : scriptModules.get(resource);
  const keys = componentAddressesOf(documents, paths);
  if (scriptModules.size === 0) {
    for (const key of keys) values.set(key, undefined);
    return values;
  }
  const bare = bareScriptsOf(documents, paths);
  for (const key of keys) {
    const hash = key.indexOf("#");
    const path = key.slice(0, hash);
    const id = key.slice(hash + 1);
    values.set(
      key,
      moduleOf(path === "" ? bare.get(id) : paths.componentResourcesOf.get(path)?.get(id)),
    );
  }
  return values;
}

// An interface with no members closes on the same line: an empty body written
// across two lines is what a formatter would collapse, and the generated file
// has to survive a consumer's formatter run byte-identical or every regeneration
// looks like a change.
function bodyOf(values: AddressValues): string {
  if (values.size === 0) return "{}";
  const members = [...values]
    .map(([key, specifier]) => {
      const value =
        specifier === undefined ? "true" : `typeof import(${JSON.stringify(specifier)}).default`;
      return `    ${JSON.stringify(key)}: ${value};\n`;
    })
    .sort()
    .join("");
  return `{\n${members}  }`;
}

function trueValues(keys: Iterable<string>): AddressValues {
  return new Map([...keys].map((key) => [key, undefined]));
}

/**
 * The global augmentation that fills `SceneGameObjectAddresses` and
 * `SceneComponentAddresses` from already-read scene sources — keys are
 * project-relative display paths, values are file text. `roles` says which
 * world each collection is, so a path key carries the world it resolves in.
 *
 * Pure, like the two indexes it composes: the filesystem walk belongs to the
 * caller. Keys are sorted so a project whose scenes did not change re-emits a
 * byte-identical file, and a document map built in a different order emits the
 * same bytes as well; a `Set` iteration order leaking into the output would
 * make every regeneration rewrite the file and re-check the whole program.
 *
 * `scriptModules` maps a script resource a scene names to the import specifier
 * of the program source that compiles to it, relative to the declaration file.
 * A component address whose resource maps is written as that module's default
 * export, so `msg.post` can read the script's messages off it; every other
 * address stays `true`. Omitted, every address is `true`.
 */
export function buildSceneAddressDeclaration(
  documents: ReadonlyMap<string, string>,
  roles: SceneCollectionRoles,
  scriptModules: ReadonlyMap<string, string> = new Map(),
): string {
  // One walk for both key sets: the qualified component addresses are the path
  // universe joined to its own prototypes, not a second index over the same files.
  const index = buildSceneObjectPathIndex(documents, roles);
  const components = componentValuesOf(documents, index, scriptModules);

  return `${BANNER}
declare global {
  interface SceneGameObjectAddresses ${bodyOf(trueValues(index.paths))}

  interface SceneComponentAddresses ${bodyOf(components)}
}

export {};
`;
}
