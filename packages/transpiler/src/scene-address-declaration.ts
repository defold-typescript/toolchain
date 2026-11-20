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

// What a component address resolves to, as the type text written for it: the
// default export of the script module it hosts, else its component kind as a
// string literal (`"sprite"`), else `true` for a component whose kind cannot be
// read.
type AddressValues = ReadonlyMap<string, string>;

const UNKNOWN = "true";

function valueText(
  resource: string | undefined,
  kind: string | undefined,
  scriptModules: ReadonlyMap<string, string>,
): string {
  const specifier = resource === undefined ? undefined : scriptModules.get(resource);
  if (specifier !== undefined) return `typeof import(${JSON.stringify(specifier)}).default`;
  return kind === undefined ? UNKNOWN : JSON.stringify(kind);
}

// Every value the leaves composing `path` write for `id`: one per recorded
// variant where two worlds sharing a socket declare it differently, else the
// single value every leaf agrees on.
function pathValuesOf(
  paths: SceneObjectPathIndex,
  path: string,
  id: string,
  scriptModules: ReadonlyMap<string, string>,
): string[] {
  const variants = paths.componentVariantsOf.get(path)?.get(id);
  if (variants !== undefined) {
    return variants.map(({ resource, kind }) => valueText(resource, kind, scriptModules));
  }
  return [
    valueText(
      paths.componentResourcesOf.get(path)?.get(id),
      paths.componentKindsOf.get(path)?.get(id),
      scriptModules,
    ),
  ];
}

// A bare `#id` is typed only when every declaration of that id anywhere in the
// project writes the same value, and a path key only when every leaf composing
// it does. The per-object walk covers each object a world reaches, every
// variant of a shared-socket path included; the per-document pass covers what it
// cannot — a factory prototype with no static path, an embedded component under
// the same id — so a bare address never borrows one object's script or kind for
// another's component. The per-document pass reads every declaration rather than
// one per id, so two objects in one collection factory's collection disagree the
// same way two objects in two files do. Agreeing on the written value rather than
// on the resource lets two sprites with different images share a kind, at a bare
// id and at a path alike.
function bareValuesOf(
  documents: ReadonlyMap<string, string>,
  paths: SceneObjectPathIndex,
  scriptModules: ReadonlyMap<string, string>,
): Map<string, string> {
  const agreed = new Map<string, string>();
  const record = (id: string, value: string): void => {
    const previous = agreed.get(id);
    if (previous === undefined) agreed.set(id, value);
    else if (previous !== value) agreed.set(id, UNKNOWN);
  };
  for (const [path, ids] of paths.componentsOf) {
    for (const id of ids) {
      for (const value of pathValuesOf(paths, path, id, scriptModules)) record(id, value);
    }
  }
  for (const [displayPath, text] of documents) {
    let declarations: ReturnType<typeof collectComponentDeclarations>;
    try {
      declarations = collectComponentDeclarations(parseSceneTextFormat(text), displayPath, []);
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      continue;
    }
    for (const { id, resource, kind } of declarations.occurrences) {
      record(id, valueText(resource, kind, scriptModules));
    }
  }
  return agreed;
}

function componentValuesOf(
  documents: ReadonlyMap<string, string>,
  paths: SceneObjectPathIndex,
  scriptModules: ReadonlyMap<string, string>,
): AddressValues {
  const values = new Map<string, string>();
  const bare = bareValuesOf(documents, paths, scriptModules);
  for (const key of componentAddressesOf(documents, paths)) {
    const hash = key.indexOf("#");
    const path = key.slice(0, hash);
    const id = key.slice(hash + 1);
    if (path === "") {
      values.set(key, bare.get(id) ?? UNKNOWN);
      continue;
    }
    const written = new Set(pathValuesOf(paths, path, id, scriptModules));
    const [only] = written;
    values.set(key, written.size === 1 && only !== undefined ? only : UNKNOWN);
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
    .map(([key, value]) => `    ${JSON.stringify(key)}: ${value};\n`)
    .sort()
    .join("");
  return `{\n${members}  }`;
}

function trueValues(keys: Iterable<string>): AddressValues {
  return new Map([...keys].map((key) => [key, UNKNOWN]));
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
 * export, so `msg.post` can read the script's messages off it and `go.get` its
 * properties. Every other component address is written as its kind — the
 * referenced resource's extension or the embedded component's `type` — so
 * `go.get` can read that kind's property catalog; one whose kind cannot be read
 * stays `true`. Omitted, no address names a module.
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
