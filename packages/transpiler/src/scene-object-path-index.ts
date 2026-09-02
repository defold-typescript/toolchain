import type { SceneCollectionRoles } from "./scene-collection-roles";
import { collectComponentDeclarations } from "./scene-component-index";
import { parseSceneTextFormat, type SceneMessage, SceneTextFormatError } from "./scene-text-format";

// Every game-object path the project declares, `/`-prefixed and composed the way
// Defold composes them, plus an honest record of everything the walk could not
// settle. Shaped like `SceneComponentIndex`: a non-empty `incomplete` means the
// universe is not provably whole, so no consumer may conclude a path is absent.
export interface SceneObjectPathIndex {
  // Two axes, in one key: which world, then which path inside it. A bare
  // `/enemy` is the bootstrap world; `mylevel:/enemy` is the proxy world the
  // proxied collection's `name:` opened. A collection factory's prototype has
  // no static address at all, so it contributes neither form.
  readonly paths: ReadonlySet<string>;
  // The documents declaring each path's *leaf* segment, sorted — the files an
  // author would open to rename that object. A composed address is attributed to
  // the collection that names the object, never to the ones that prefixed it.
  readonly declaredIn: ReadonlyMap<string, readonly string[]>;
  // The component ids the object *at* each path owns, sorted — the join that
  // turns two id universes into one address. A path whose prototype could not be
  // read carries no entry at all rather than an empty one: an empty array is
  // indistinguishable from an object that genuinely owns no component, and the
  // reason is named in `incomplete` instead.
  readonly componentsOf: ReadonlyMap<string, readonly string[]>;
  // For each object, the resource each of its *referenced* components names —
  // the `component: "/src/player.ts.script"` edge that says this object hosts
  // that script. An *embedded* component is absent by construction rather than
  // withheld: its payload is the component, so it names no resource. Withheld
  // for exactly the keys `componentsOf` withholds, on the same rule.
  readonly componentResourcesOf: ReadonlyMap<string, ReadonlyMap<string, string>>;
  readonly incomplete: readonly string[];
}

// One composed path's leaf: the document that declared it, and the components
// its prototype owns — `undefined` where that prototype could not be read.
interface PathLeaf {
  readonly declarer: string;
  readonly components: readonly string[] | undefined;
  readonly resources: ReadonlyMap<string, string> | undefined;
}

// The two blocks whose `id` is a leaf segment. `collection_instances` is handled
// apart, because its id is a namespace rather than an object.
const LEAF_BLOCKS = ["instances", "embedded_instances"];

// Resource paths inside a scene are project-absolute; documents are keyed by
// project-relative display path, the same convention `resourceKey` follows in
// `sprite-animation-index.ts`.
function resourceKey(resource: string): string {
  return resource.startsWith("/") ? resource.slice(1) : resource;
}

function firstField(message: SceneMessage, name: string): string | undefined {
  return (message.fields.get(name) ?? [])[0];
}

function childrenOf(message: SceneMessage, name: string): readonly SceneMessage[] {
  return message.messages.get(name) ?? [];
}

// Build the game-object path universe from already-read scene sources: keys are
// display paths, values are file text. Pure the same way `buildSceneComponentIndex`
// is — the filesystem walk belongs to the caller.
//
// `roles` says which world each collection is, and is required rather than
// defaulted: an optional parameter falling back to today's every-collection-is-a-
// root behaviour would keep the wrong-world suggestion reachable from any call
// site that forgot to pass it.
//
// A `children:` edge is deliberately not a path segment. Defold ids are unique
// inside one collection and a child object is still addressed `/child`, so
// parenting is a transform relation; nesting comes from a collection instanced
// inside another.
export function buildSceneObjectPathIndex(
  documents: ReadonlyMap<string, string>,
  roles: SceneCollectionRoles,
): SceneObjectPathIndex {
  const incomplete: string[] = [];

  if (documents.size === 0) {
    incomplete.push("no scene sources were read, so no game-object path can be proven absent");
    incomplete.push(...roles.incomplete);
    return {
      paths: new Set(),
      declaredIn: new Map(),
      componentsOf: new Map(),
      componentResourcesOf: new Map(),
      incomplete,
    };
  }

  const parsed = new Map<string, SceneMessage>();
  for (const [displayPath, text] of documents) {
    try {
      parsed.set(displayPath, parseSceneTextFormat(text));
    } catch (error) {
      if (!(error instanceof SceneTextFormatError)) throw error;
      incomplete.push(`${displayPath}: could not be parsed (${error.message})`);
    }
  }

  // Memo keyed by display path, so a collection instanced twice is read once;
  // `inProgress` is the cycle guard, without which two collections instancing
  // each other would recur until the stack ran out. Each entry maps a composed
  // path to the document that declared its leaf, so the attribution is carried
  // by the same walk that builds the path rather than recovered afterwards.
  const composed = new Map<string, ReadonlyMap<string, PathLeaf>>();
  const inProgress = new Set<string>();

  // A `.go` instanced twenty times is read once: the components it declares are
  // a property of the prototype, not of the instance that named it.
  interface PrototypeDeclarations {
    readonly components: readonly string[];
    readonly resources: ReadonlyMap<string, string>;
  }
  const prototypeDeclarations = new Map<string, PrototypeDeclarations | undefined>();

  function declarationsOfPrototype(key: string): PrototypeDeclarations | undefined {
    const done = prototypeDeclarations.get(key);
    if (done !== undefined || prototypeDeclarations.has(key)) return done;
    const document = parsed.get(key);
    let declarations: PrototypeDeclarations | undefined;
    if (document !== undefined) {
      const collected = collectComponentDeclarations(document, key, incomplete);
      declarations = { components: [...collected.ids].sort(), resources: collected.resources };
    }
    prototypeDeclarations.set(key, declarations);
    return declarations;
  }

  function pathsOf(displayPath: string): ReadonlyMap<string, PathLeaf> {
    const done = composed.get(displayPath);
    if (done !== undefined) return done;
    if (inProgress.has(displayPath)) {
      incomplete.push(
        `${displayPath}: is instanced inside itself through a cycle of collection references, so its paths cannot be composed`,
      );
      return new Map();
    }
    const document = parsed.get(displayPath);
    if (document === undefined) return new Map();

    inProgress.add(displayPath);
    const paths = new Map<string, PathLeaf>();

    for (const blockName of LEAF_BLOCKS) {
      for (const block of childrenOf(document, blockName)) {
        const id = firstField(block, "id");
        if (id === undefined || id === "") continue;
        let components: readonly string[] | undefined;
        let resources: ReadonlyMap<string, string> | undefined;
        if (blockName === "embedded_instances") {
          // The payload declares the object outright, so the same collector the
          // flat index uses reads it — and names the document itself when the
          // escaped text will not parse.
          const before = incomplete.length;
          const declarations = collectComponentDeclarations(
            block,
            displayPath,
            incomplete,
            blockName,
          );
          if (incomplete.length === before) {
            components = [...declarations.ids].sort();
            resources = declarations.resources;
          }
        } else {
          const prototype = firstField(block, "prototype");
          if (prototype === undefined) {
            // Distinct from an unresolvable resource: nothing was named, so
            // there is no document to go looking for.
            incomplete.push(
              `${displayPath}: the instance "${id}" declares no prototype, so the components it owns cannot be read`,
            );
          } else if (parsed.has(resourceKey(prototype))) {
            const declarations = declarationsOfPrototype(resourceKey(prototype));
            components = declarations?.components;
            resources = declarations?.resources;
          } else {
            incomplete.push(
              `${displayPath}: the instance "${id}" names ${prototype}, which is not among the project's readable scene documents`,
            );
          }
        }
        paths.set(`/${id}`, { declarer: displayPath, components, resources });
      }
    }

    for (const block of childrenOf(document, "collection_instances")) {
      const id = firstField(block, "id");
      const collection = firstField(block, "collection");
      if (id === undefined || id === "" || collection === undefined) continue;
      const key = resourceKey(collection);
      if (!parsed.has(key)) {
        incomplete.push(
          `${displayPath}: the collection instance "${id}" names ${collection}, which is not among the project's readable scene documents`,
        );
        continue;
      }
      for (const [nested, leaf] of pathsOf(key)) {
        paths.set(`/${id}${nested}`, leaf);
      }
    }

    inProgress.delete(displayPath);
    composed.set(displayPath, paths);
    return paths;
  }

  // Composed for every document, contributed from the worlds alone: a cycle or a
  // dangling reference reached only from a collection no world opens is still a
  // gap the caller has to hear about.
  for (const displayPath of parsed.keys()) pathsOf(displayPath);

  // The bootstrap world's addresses are bare; every proxy world's are prefixed
  // by the socket its collection's `name:` declares. A collection with neither
  // role contributes nothing — including a factory prototype, whose objects only
  // ever exist under a runtime-generated prefix.
  const worlds: [string, string][] = [];
  if (roles.bootstrap !== undefined) worlds.push(["", roles.bootstrap]);
  for (const [displayPath, socket] of roles.sockets) worlds.push([`${socket}:`, displayPath]);

  const paths = new Set<string>();
  const declaredIn = new Map<string, string[]>();
  const componentsOf = new Map<string, string[]>();
  const componentResourcesOf = new Map<string, Map<string, string>>();
  // An address two leaves compose is only as provable as its weakest leaf: one
  // unread prototype withholds the claim for the whole key rather than letting
  // the readable half stand in for both.
  const withheld = new Set<string>();
  for (const [prefix, displayPath] of worlds) {
    for (const [path, leaf] of pathsOf(displayPath)) {
      const key = `${prefix}${path}`;
      paths.add(key);
      const declarers = declaredIn.get(key);
      if (declarers === undefined) {
        declaredIn.set(key, [leaf.declarer]);
      } else if (!declarers.includes(leaf.declarer)) {
        // Two worlds sharing one socket compose the same address from two
        // different leaves, which the roles already name as a hole — both
        // declaring files still answer for it.
        declarers.push(leaf.declarer);
      }
      if (leaf.components === undefined || leaf.resources === undefined) {
        withheld.add(key);
        continue;
      }
      const owned = componentsOf.get(key);
      if (owned === undefined) {
        componentsOf.set(key, [...leaf.components]);
      } else {
        for (const id of leaf.components) if (!owned.includes(id)) owned.push(id);
      }
      const referenced = componentResourcesOf.get(key);
      if (referenced === undefined) {
        componentResourcesOf.set(key, new Map(leaf.resources));
      } else {
        // Same union rule as the ids above: the first leaf to name a component's
        // resource answers for it, so two worlds sharing one socket — already a
        // hole the roles name — cannot silently overwrite each other.
        for (const [id, resource] of leaf.resources) {
          if (!referenced.has(id)) referenced.set(id, resource);
        }
      }
    }
  }
  for (const declarers of declaredIn.values()) declarers.sort();
  for (const key of withheld) {
    componentsOf.delete(key);
    componentResourcesOf.delete(key);
  }
  for (const owned of componentsOf.values()) owned.sort();

  incomplete.push(...roles.incomplete);

  // The roles walk opens the same escaped payloads this one does, so an
  // unparseable `data:` reaches the list twice by two honest routes. Identical
  // strings carry identical information, and a reader shown the same reason
  // twice learns nothing the second time.
  return {
    paths,
    declaredIn,
    componentsOf,
    componentResourcesOf,
    incomplete: [...new Set(incomplete)],
  };
}
