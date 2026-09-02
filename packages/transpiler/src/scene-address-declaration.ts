import type { SceneCollectionRoles } from "./scene-collection-roles";
import { buildSceneComponentIndex } from "./scene-component-index";
import { buildSceneObjectPathIndex, type SceneObjectPathIndex } from "./scene-object-path-index";

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

// An interface with no members closes on the same line: an empty body written
// across two lines is what a formatter would collapse, and the generated file
// has to survive a consumer's formatter run byte-identical or every regeneration
// looks like a change.
function bodyOf(keys: readonly string[]): string {
  if (keys.length === 0) return "{}";
  const members = keys
    .map((key) => `    ${JSON.stringify(key)}: true;\n`)
    .sort()
    .join("");
  return `{\n${members}  }`;
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
 */
export function buildSceneAddressDeclaration(
  documents: ReadonlyMap<string, string>,
  roles: SceneCollectionRoles,
): string {
  // One walk for both key sets: the qualified component addresses are the path
  // universe joined to its own prototypes, not a second index over the same files.
  const index = buildSceneObjectPathIndex(documents, roles);
  const components = componentAddressesOf(documents, index);

  return `${BANNER}
declare global {
  interface SceneGameObjectAddresses ${bodyOf([...index.paths])}

  interface SceneComponentAddresses ${bodyOf(components)}
}

export {};
`;
}
