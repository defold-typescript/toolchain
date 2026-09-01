import { describe, expect, test } from "bun:test";
import { buildSceneCollectionRoles, type SceneCollectionRoles } from "./scene-collection-roles";

function rolesOf(input: {
  documents?: Record<string, string>;
  references?: Record<string, string>;
  gameProject?: string;
}): SceneCollectionRoles {
  return buildSceneCollectionRoles({
    documents: new Map(Object.entries(input.documents ?? {})),
    references: new Map(Object.entries(input.references ?? {})),
    gameProject: input.gameProject,
  });
}

function bootstrapping(collection: string): string {
  return `[bootstrap]\nmain_collection = ${collection}\n`;
}

// A `.go` holding a collectionproxy as an embedded component: the `data:` payload
// is a whole escaped document, the form Defold writes when the component has no
// file of its own.
function embeddedReference(type: string, field: string, resource: string): string {
  return (
    `embedded_components {\n  id: "loader"\n  type: "${type}"\n` +
    `  data: "${field}: \\"${resource}\\"\\n"\n}\n`
  );
}

// The socket a proxy world is addressed by is `CollectionDesc.name`, which is
// deliberately none of: the proxy component's id, the collection instance's id,
// or the file's basename.
const LEVEL1 = 'name: "mylevel"\ninstances {\n  id: "enemy"\n  prototype: "/levels/enemy.go"\n}\n';

describe("buildSceneCollectionRoles", () => {
  test("the bootstrap collection is the one [bootstrap] main_collection names", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection":
          'collection_instances {\n  id: "world"\n  collection: "/main/world.collection"\n}\n' +
          'collection_instances {\n  id: "menu"\n  collection: "/main/menu.collection"\n}\n',
        "main/world.collection": 'instances {\n  id: "hero"\n  prototype: "/main/hero.go"\n}\n',
        "main/menu.collection": 'instances {\n  id: "title"\n  prototype: "/main/title.go"\n}\n',
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect(roles.bootstrap).toBe("main/main.collection");
    expect([...roles.instanced].sort()).toEqual(["main/menu.collection", "main/world.collection"]);
    expect(roles.incomplete).toEqual([]);
  });

  test("an embedded collectionproxy makes its target a proxy world named by the target's own name: field", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection": 'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
        "main/loader.go": embeddedReference(
          "collectionproxy",
          "collection",
          "/levels/level1.collection",
        ),
        "levels/level1.collection": LEVEL1,
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect(Object.fromEntries(roles.sockets)).toEqual({ "levels/level1.collection": "mylevel" });
    expect(roles.incomplete).toEqual([]);
  });

  test("a standalone .collectionproxy reference resolves through the reference document", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection": 'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
        "main/loader.go":
          'components {\n  id: "loader"\n  component: "/levels/level1.collectionproxy"\n}\n',
        "levels/level1.collection": LEVEL1,
      },
      references: {
        "levels/level1.collectionproxy": 'collection: "/levels/level1.collection"\n',
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect(Object.fromEntries(roles.sockets)).toEqual({ "levels/level1.collection": "mylevel" });
    expect(roles.incomplete).toEqual([]);
  });

  test("a reference document the walk never read is a named gap, not a dropped edge", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection": 'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
        "main/loader.go":
          'components {\n  id: "loader"\n  component: "/levels/level1.collectionproxy"\n}\n',
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect(roles.sockets.size).toBe(0);
    expect(roles.incomplete).toHaveLength(1);
    expect(roles.incomplete[0]).toContain("main/loader.go");
    expect(roles.incomplete[0]).toContain("/levels/level1.collectionproxy");
  });

  test("a collectionfactory prototype is a factory prototype and nothing else", () => {
    const embedded = rolesOf({
      documents: {
        "main/main.collection":
          'instances {\n  id: "spawner"\n  prototype: "/main/spawner.go"\n}\n',
        "main/spawner.go": embeddedReference(
          "collectionfactory",
          "prototype",
          "/spawn/pack.collection",
        ),
        "spawn/pack.collection": 'instances {\n  id: "enemy"\n  prototype: "/spawn/enemy.go"\n}\n',
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect([...embedded.factoryPrototypes]).toEqual(["spawn/pack.collection"]);
    expect(embedded.sockets.size).toBe(0);
    expect(embedded.instanced.size).toBe(0);
    expect(embedded.incomplete).toEqual([]);

    const standalone = rolesOf({
      documents: {
        "main/main.collection":
          'instances {\n  id: "spawner"\n  prototype: "/main/spawner.go"\n}\n',
        "main/spawner.go":
          'components {\n  id: "spawner"\n  component: "/spawn/pack.collectionfactory"\n}\n',
        "spawn/pack.collection": 'instances {\n  id: "enemy"\n  prototype: "/spawn/enemy.go"\n}\n',
      },
      references: { "spawn/pack.collectionfactory": 'prototype: "/spawn/pack.collection"\n' },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect([...standalone.factoryPrototypes]).toEqual(["spawn/pack.collection"]);
    expect(standalone.sockets.size).toBe(0);
    expect(standalone.incomplete).toEqual([]);
  });

  test("a collection reachable more than one way keeps every role", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection":
          'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n' +
          'collection_instances {\n  id: "preview"\n  collection: "/levels/level1.collection"\n}\n',
        "main/loader.go": embeddedReference(
          "collectionproxy",
          "collection",
          "/levels/level1.collection",
        ),
        "levels/level1.collection": LEVEL1,
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect([...roles.instanced]).toEqual(["levels/level1.collection"]);
    expect(Object.fromEntries(roles.sockets)).toEqual({ "levels/level1.collection": "mylevel" });
    expect(roles.incomplete).toEqual([]);
  });

  test("a collection reachable no way is a named incomplete entry and carries no role", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection": 'instances {\n  id: "hero"\n  prototype: "/main/hero.go"\n}\n',
        "main/orphan.collection": 'instances {\n  id: "ghost"\n  prototype: "/main/ghost.go"\n}\n',
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect(roles.bootstrap).toBe("main/main.collection");
    expect(roles.sockets.size).toBe(0);
    expect(roles.instanced.size).toBe(0);
    expect(roles.factoryPrototypes.size).toBe(0);
    expect(roles.incomplete).toHaveLength(1);
    expect(roles.incomplete[0]).toContain("main/orphan.collection");
  });

  test("a .go is never classified and never reported unreachable", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection": 'instances {\n  id: "hero"\n  prototype: "/main/hero.go"\n}\n',
        "main/hero.go": 'components {\n  id: "script"\n  component: "/main/hero.script"\n}\n',
        "main/unused.go": 'components {\n  id: "script"\n  component: "/main/hero.script"\n}\n',
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect(roles.incomplete).toEqual([]);
    expect(roles.sockets.size).toBe(0);
    expect(roles.factoryPrototypes.size).toBe(0);
  });

  test("an absent game.project is a named incomplete entry and yields no bootstrap", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection": 'instances {\n  id: "hero"\n  prototype: "/main/hero.go"\n}\n',
      },
    });

    expect(roles.bootstrap).toBeUndefined();
    expect(roles.incomplete.join("\n")).toContain("game.project");
  });

  test("a main_collection naming a collection the walk did not read is a named incomplete entry", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection": 'instances {\n  id: "hero"\n  prototype: "/main/hero.go"\n}\n',
      },
      gameProject: bootstrapping("/main/absent.collection"),
    });

    expect(roles.bootstrap).toBeUndefined();
    expect(roles.incomplete.join("\n")).toContain("/main/absent.collection");
  });

  test("two proxied collections declaring the same name: are a named incomplete entry, and both sockets still stand", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection":
          'instances {\n  id: "one"\n  prototype: "/main/one.go"\n}\n' +
          'instances {\n  id: "two"\n  prototype: "/main/two.go"\n}\n',
        "main/one.go": embeddedReference(
          "collectionproxy",
          "collection",
          "/levels/level1.collection",
        ),
        "main/two.go": embeddedReference(
          "collectionproxy",
          "collection",
          "/levels/level2.collection",
        ),
        "levels/level1.collection": LEVEL1,
        "levels/level2.collection":
          'name: "mylevel"\ninstances {\n  id: "boss"\n  prototype: "/levels/boss.go"\n}\n',
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect(Object.fromEntries(roles.sockets)).toEqual({
      "levels/level1.collection": "mylevel",
      "levels/level2.collection": "mylevel",
    });
    expect(roles.incomplete).toHaveLength(1);
    expect(roles.incomplete[0]).toContain("mylevel");
  });

  test("a proxied collection with no name: field is a named incomplete entry and gets no socket", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection": 'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
        "main/loader.go": embeddedReference(
          "collectionproxy",
          "collection",
          "/levels/level1.collection",
        ),
        "levels/level1.collection":
          'instances {\n  id: "enemy"\n  prototype: "/levels/enemy.go"\n}\n',
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect(roles.sockets.size).toBe(0);
    expect(roles.incomplete.join("\n")).toContain("levels/level1.collection");
  });

  test("a proxy reference reaches its target through an embedded instance's escaped document", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection":
          'embedded_instances {\n  id: "loader"\n  data: "embedded_components {\\n"\n' +
          '  "  id: \\"proxy\\"\\n"\n  "  type: \\"collectionproxy\\"\\n"\n' +
          '  "  data: \\"collection: \\\\\\"/levels/level1.collection\\\\\\"\\\\n\\"\\n"\n  "}\\n"\n}\n',
        "levels/level1.collection": LEVEL1,
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect(Object.fromEntries(roles.sockets)).toEqual({ "levels/level1.collection": "mylevel" });
    expect(roles.incomplete).toEqual([]);
  });
  test("main_collection naming the compiled .collectionc resource is the source .collection", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection": 'instances {\n  id: "hero"\n  prototype: "/main/hero.go"\n}\n',
      },
      gameProject: bootstrapping("/main/main.collectionc"),
    });

    expect(roles.bootstrap).toBe("main/main.collection");
    expect(roles.incomplete).toEqual([]);
  });

  test("a proxy naming the compiled .collectionc resource reaches the same source collection", () => {
    const roles = rolesOf({
      documents: {
        "main/main.collection": 'instances {\n  id: "loader"\n  prototype: "/main/loader.go"\n}\n',
        "main/loader.go": embeddedReference(
          "collectionproxy",
          "collection",
          "/levels/level1.collectionc",
        ),
        "levels/level1.collection": LEVEL1,
      },
      gameProject: bootstrapping("/main/main.collection"),
    });

    expect(Object.fromEntries(roles.sockets)).toEqual({ "levels/level1.collection": "mylevel" });
    expect(roles.incomplete).toEqual([]);
  });
});
