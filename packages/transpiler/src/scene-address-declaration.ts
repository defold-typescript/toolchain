import { buildSceneComponentIndex } from "./scene-component-index";
import { buildSceneObjectPathIndex } from "./scene-object-path-index";

const BANNER = `// Generated from this project's scenes by \`defold-typescript scene-types\`.
// Do not edit: every run rewrites it from the .go/.collection sources.
//
// Each key is an address the project declares. The aliases in
// \`@defold-typescript/types\` stay widened with \`(string & {})\`, so these keys
// only add completions — an address composed at runtime is never rejected.
`;

// `buildSceneComponentIndex` reports bare component ids with no owning object,
// so the same-object form `#id` is the whole address the index can prove. A
// `/path#id` key would be a cross product of two universes that were never
// joined: it would claim every object owns every component.
function componentAddressesOf(documents: ReadonlyMap<string, string>): string[] {
  return [...buildSceneComponentIndex(documents).ids].map((id) => `#${id}`);
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
 * project-relative display paths, values are file text.
 *
 * Pure, like the two indexes it composes: the filesystem walk belongs to the
 * caller. Keys are sorted so a project whose scenes did not change re-emits a
 * byte-identical file, and a document map built in a different order emits the
 * same bytes as well; a `Set` iteration order leaking into the output would
 * make every regeneration rewrite the file and re-check the whole program.
 */
export function buildSceneAddressDeclaration(documents: ReadonlyMap<string, string>): string {
  const paths = [...buildSceneObjectPathIndex(documents).paths];
  const components = componentAddressesOf(documents);

  return `${BANNER}
declare global {
  interface SceneGameObjectAddresses ${bodyOf(paths)}

  interface SceneComponentAddresses ${bodyOf(components)}
}

export {};
`;
}
