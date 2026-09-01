import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildComponentAnimationIndex,
  componentIdOfSameObjectAddress,
} from "./component-animation-index";

// A standalone `images` block is a bare image the atlas exposes without
// declaring an animation for it. It is deliberately present in every fixture:
// only `animations { id: … }` may reach a suggestion, because a wrong id here
// is a runtime crash rather than a no-op.
function atlas(...ids: string[]): string {
  return (
    'images {\n  image: "/assets/images/loose.png"\n}\n' +
    ids
      .map(
        (id) => `animations {\n  id: "${id}"\n  images {\n    image: "/assets/${id}.png"\n  }\n}\n`,
      )
      .join("")
  );
}

function indexOf(scenes: Record<string, string>, assets: Record<string, string> = {}) {
  return buildComponentAnimationIndex({
    scenes: new Map(Object.entries(scenes)),
    assets: new Map(Object.entries(assets)),
  });
}

function animationsFor(
  index: ReturnType<typeof indexOf>,
  resource: string,
  component: string,
): string[] | undefined {
  const found = index.byScriptResource.get(resource)?.get(component);
  return found === undefined ? undefined : [...found].sort();
}

function sourceFor(
  index: ReturnType<typeof indexOf>,
  resource: string,
  component: string,
): string | undefined {
  return index.sourceByScriptResource.get(resource)?.get(component);
}

// A `.go` document: its root message is the game object itself.
function gameObject(script: string, ...components: string[]): string {
  return `components {\n  id: "self"\n  component: "${script}"\n}\n${components.join("")}`;
}

function referencedComponent(id: string, resource: string): string {
  return `components {\n  id: "${id}"\n  component: "${resource}"\n}\n`;
}

// One level of escaping, the way a `.collection` carries a whole `.go`.
function escapePayload(payload: string): string {
  return payload.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function embeddedSprite(id: string, tileSet: string): string {
  return (
    `embedded_components {\n  id: "${id}"\n  type: "sprite"\n` +
    `  data: "${escapePayload(`tile_set: "${tileSet}"\ndefault_animation: "idle"\n`)}"\n}\n`
  );
}

// A `.animationset` document: repeated `animations { animation: … }` entries
// naming *files*, never ids. The id an entry contributes is its basename, so a
// fixture that spelled ids here would not exercise the rule at all.
function animationSet(...entries: string[]): string {
  const listed = entries.map((entry) => `animations {\n  animation: "${entry}"\n}\n`).join("");
  return `${listed}skeleton: ""\n`;
}

// A `.model` document. Every sibling field is present because only
// `animations:` may decide the ids: a reader that reached for `mesh` would find
// a plausible glTF here and quietly pass the cases that matter.
function model(animations: string): string {
  return (
    'mesh: "/meshes/hero.gltf"\n' +
    'material: "/builtins/materials/model.material"\n' +
    `animations: "${animations}"\n` +
    'default_animation: ""\n' +
    'name: "unnamed"\n'
  );
}

function embeddedModel(id: string, animations: string): string {
  return (
    `embedded_components {\n  id: "${id}"\n  type: "model"\n` +
    `  data: "${escapePayload(model(animations))}"\n}\n`
  );
}

function collection(...objects: string[]): string {
  return objects
    .map(
      (object, at) =>
        `embedded_instances {\n  id: "o${at}"\n  data: "${escapePayload(object)}"\n}\n`,
    )
    .join("");
}

// The example project's documents keyed the way the host names them: `join`
// yields `\` on Windows and `/` elsewhere, which is exactly the caller shape
// the index's key contract has to absorb.
function exampleProjectDocuments(): { scenes: Map<string, string>; assets: Map<string, string> } {
  const root = join(import.meta.dir, "../../../docs/examples/platformer");
  const walk = (directory: string): string[] =>
    readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === "build" ? [] : walk(path);
      return path;
    });
  const read = (match: RegExp): Map<string, string> =>
    new Map(
      walk(root)
        .filter((path) => match.test(path))
        .map((path) => [path.slice(root.length + 1), readFileSync(path, "utf8")]),
    );
  return { scenes: read(/\.(go|collection)$/), assets: read(/\.(atlas|tilesource|sprite)$/) };
}

function rekey(documents: ReadonlyMap<string, string>, separator: string): Map<string, string> {
  return new Map([...documents].map(([path, text]) => [path.split(/[/\\]/).join(separator), text]));
}

describe("buildComponentAnimationIndex", () => {
  test("scopes a script's animations to the sprite components of the object that owns it", () => {
    const index = indexOf(
      {
        "game/player.collection": collection(
          gameObject("/src/player.ts.script", embeddedSprite("sprite", "/assets/player.atlas")),
        ),
      },
      { "assets/player.atlas": atlas("walk", "jump") },
    );
    expect([...index.byScriptResource.keys()]).toEqual(["src/player.ts.script"]);
    expect(animationsFor(index, "src/player.ts.script", "sprite")).toEqual(["jump", "walk"]);
    expect(index.unresolved).toEqual([]);
  });

  test("resolves the extra hop through a standalone `.sprite` document", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          referencedComponent("body", "/assets/a.sprite"),
        ),
      },
      {
        "assets/a.sprite": 'tile_set: "/assets/a.atlas"\ndefault_animation: "idle"\n',
        "assets/a.atlas": atlas("idle", "run"),
      },
    );
    expect(animationsFor(index, "src/hero.ts.script", "body")).toEqual(["idle", "run"]);
    expect(index.unresolved).toEqual([]);
  });

  test("a tile source declaring no animation keys the component to an empty set", () => {
    // Resolved with nothing to offer, which is not the same as an absent key:
    // the caller may still tell the author this component has no animations.
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          referencedComponent("body", "/assets/a.sprite"),
        ),
      },
      {
        "assets/a.sprite": 'tile_set: "/assets/level.tilesource"\n',
        "assets/level.tilesource": 'image: "/assets/images/sheet.png"\n',
      },
    );
    expect(animationsFor(index, "src/hero.ts.script", "body")).toEqual([]);
    expect(index.unresolved).toEqual([]);
  });

  test("an unreadable tile source drops its own component and no other", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedSprite("missing", "/assets/gone.atlas"),
          embeddedSprite("body", "/assets/a.atlas"),
        ),
      },
      { "assets/a.atlas": atlas("idle") },
    );
    expect(animationsFor(index, "src/hero.ts.script", "missing")).toBeUndefined();
    expect(animationsFor(index, "src/hero.ts.script", "body")).toEqual(["idle"]);
    expect(index.unresolved).toHaveLength(1);
    expect(index.unresolved[0]).toContain("/assets/gone.atlas");
    expect(index.unresolved[0]).toContain("main/hero.go");
  });

  test("two sprite components on one object keep their animations apart", () => {
    // The embedded and the referenced chain on one object, so the two halves of
    // `spriteTileSets` cannot feed each other.
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedSprite("body", "/assets/body.atlas"),
          referencedComponent("cape", "/assets/cape.sprite"),
        ),
      },
      {
        "assets/body.atlas": atlas("idle", "run"),
        "assets/cape.sprite": 'tile_set: "/assets/cape.atlas"\ndefault_animation: "flap"\n',
        "assets/cape.atlas": atlas("flap", "furl"),
      },
    );
    expect([...(index.byScriptResource.get("src/hero.ts.script")?.keys() ?? [])]).toEqual([
      "body",
      "cape",
    ]);
    expect(animationsFor(index, "src/hero.ts.script", "body")).toEqual(["idle", "run"]);
    expect(animationsFor(index, "src/hero.ts.script", "cape")).toEqual(["flap", "furl"]);
    expect(index.unresolved).toEqual([]);
  });

  test("one object's animations never reach another object's script", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedSprite("body", "/assets/body.atlas"),
        ),
        "main/foe.go": gameObject(
          "/src/foe.ts.script",
          embeddedSprite("body", "/assets/foe.atlas"),
        ),
      },
      {
        "assets/body.atlas": atlas("idle", "run"),
        "assets/foe.atlas": atlas("lunge"),
      },
    );
    expect(animationsFor(index, "src/hero.ts.script", "body")).toEqual(["idle", "run"]);
    expect(animationsFor(index, "src/foe.ts.script", "body")).toEqual(["lunge"]);
    expect(index.unresolved).toEqual([]);
  });

  test("two game objects claiming one script own it jointly, which is to say not at all", () => {
    const index = indexOf(
      {
        "main/a.go": gameObject("/src/hero.ts.script", embeddedSprite("body", "/assets/a.atlas")),
        "main/b.go": gameObject("/src/hero.ts.script", embeddedSprite("body", "/assets/a.atlas")),
      },
      { "assets/a.atlas": atlas("idle") },
    );
    expect(index.byScriptResource.has("src/hero.ts.script")).toBe(false);
    expect(index.unresolved).toHaveLength(1);
    expect(index.unresolved[0]).toContain("main/a.go");
    expect(index.unresolved[0]).toContain("main/b.go");
    expect(index.unresolved[0]).toContain("src/hero.ts.script");
  });

  test("a non-sprite component of the same object contributes nothing", () => {
    const index = indexOf(
      {
        "main/hero.go":
          gameObject("/src/hero.ts.script", embeddedSprite("body", "/assets/a.atlas")) +
          'embedded_components {\n  id: "collisionobject"\n  type: "collisionobject"\n  data: "mass: 0.0\\n"\n}\n',
      },
      { "assets/a.atlas": atlas("idle") },
    );
    expect([...(index.byScriptResource.get("src/hero.ts.script")?.keys() ?? [])]).toEqual(["body"]);
  });

  test("an unparseable scene is named, and never silences the ones that parse", () => {
    const index = indexOf(
      {
        "main/broken.go": 'components {\n  id: "x"\n  component: "/src/broken.ts.script"\n',
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedSprite("body", "/assets/a.atlas"),
        ),
      },
      { "assets/a.atlas": atlas("idle") },
    );
    expect([...index.byScriptResource.keys()]).toEqual(["src/hero.ts.script"]);
    expect(index.unresolved).toHaveLength(1);
    expect(index.unresolved[0]).toContain("main/broken.go");
  });

  test("an unparseable embedded payload is named, and the sibling object still indexes", () => {
    const good = gameObject("/src/hero.ts.script", embeddedSprite("body", "/assets/a.atlas"));
    const index = indexOf(
      {
        "game/main.collection":
          `embedded_instances {\n  id: "broken"\n  data: "${escapePayload('components {\n  id: "x"\n')}"\n}\n` +
          collection(good),
      },
      { "assets/a.atlas": atlas("idle") },
    );
    expect(animationsFor(index, "src/hero.ts.script", "body")).toEqual(["idle"]);
    expect(index.unresolved).toHaveLength(1);
    expect(index.unresolved[0]).toContain("game/main.collection");
  });

  test("an unreadable asset document is named and keys nothing", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedSprite("body", "/assets/a.atlas"),
        ),
      },
      { "assets/a.atlas": 'animations {\n  id: "idle"\n' },
    );
    expect(index.byScriptResource.get("src/hero.ts.script")?.size).toBe(0);
    expect(index.unresolved.some((reason) => reason.includes("assets/a.atlas"))).toBe(true);
  });

  test("a scene naming no script owns nothing", () => {
    const index = indexOf(
      { "main/hero.go": referencedComponent("body", "/assets/a.sprite") },
      { "assets/a.sprite": 'tile_set: "/assets/a.atlas"\n', "assets/a.atlas": atlas("idle") },
    );
    expect([...index.byScriptResource.keys()]).toEqual([]);
    expect(index.unresolved).toEqual([]);
  });

  test("indexes the committed example project's own scenes and atlases", () => {
    const index = buildComponentAnimationIndex(exampleProjectDocuments());
    expect(index.unresolved).toEqual([]);
    expect([...index.byScriptResource.keys()]).toEqual(["src/player.ts.script"]);
    // The object's `collisionobject` and `camera` components are not sprites,
    // and `game.collection` declares no game object naming a script of its own.
    expect([...(index.byScriptResource.get("src/player.ts.script")?.keys() ?? [])]).toEqual([
      "sprite",
    ]);
    expect(animationsFor(index, "src/player.ts.script", "sprite")).toEqual([
      "climb",
      "duck",
      "fall",
      "idle",
      "jump",
      "swim",
      "walk",
    ]);
  });

  test("keys separated the Windows way index identically to POSIX ones", () => {
    const documents = exampleProjectDocuments();
    const posix = buildComponentAnimationIndex({
      scenes: rekey(documents.scenes, "/"),
      assets: rekey(documents.assets, "/"),
    });
    const windows = buildComponentAnimationIndex({
      scenes: rekey(documents.scenes, "\\"),
      assets: rekey(documents.assets, "\\"),
    });
    expect(windows.unresolved).toEqual([]);
    expect(windows.byScriptResource).toEqual(posix.byScriptResource);
    expect(windows.sourceByScriptResource).toEqual(posix.sourceByScriptResource);
  });

  test("a key mixing separators normalizes per segment, not by whole-string match", () => {
    const index = indexOf(
      {
        "game\\sub/player.collection": collection(
          gameObject("/src/player.ts.script", embeddedSprite("sprite", "/assets/sub/player.atlas")),
        ),
      },
      { "assets\\sub/player.atlas": atlas("walk") },
    );
    expect(index.unresolved).toEqual([]);
    expect(sourceFor(index, "src/player.ts.script", "sprite")).toBe("assets/sub/player.atlas");
  });

  test("an unresolved reason names the scene by its POSIX display path", () => {
    const index = indexOf({
      "game\\sub\\hero.go": gameObject(
        "/src/hero.ts.script",
        embeddedSprite("body", "/assets/missing.atlas"),
      ),
    });
    expect(index.unresolved).toEqual([
      'game/sub/hero.go: the sprite component "body" names the tile source /assets/missing.atlas, which is not among the project\'s asset documents',
    ]);
  });

  test("an animation names the tile source that declared it, not the object displaying it", () => {
    const index = indexOf(
      {
        "game/player.collection": collection(
          gameObject("/src/player.ts.script", embeddedSprite("sprite", "/assets/player.atlas")),
        ),
      },
      { "assets/player.atlas": atlas("walk", "jump") },
    );
    expect(sourceFor(index, "src/player.ts.script", "sprite")).toBe("assets/player.atlas");
  });

  test("the tile source is the one the `.sprite` hop lands on, not the `.sprite` itself", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          referencedComponent("body", "/assets/a.sprite"),
        ),
      },
      {
        "assets/a.sprite": 'tile_set: "/assets/level.tilesource"\n',
        "assets/level.tilesource": 'image: "/assets/images/sheet.png"\n',
      },
    );
    expect(sourceFor(index, "src/hero.ts.script", "body")).toBe("assets/level.tilesource");
  });

  test("two sprite components on one object each report their own tile source", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedSprite("body", "/assets/body.atlas"),
          referencedComponent("cape", "/assets/cape.sprite"),
        ),
      },
      {
        "assets/body.atlas": atlas("idle", "run"),
        "assets/cape.sprite": 'tile_set: "/assets/cape.atlas"\n',
        "assets/cape.atlas": atlas("flap", "furl"),
      },
    );
    expect(sourceFor(index, "src/hero.ts.script", "body")).toBe("assets/body.atlas");
    expect(sourceFor(index, "src/hero.ts.script", "cape")).toBe("assets/cape.atlas");
  });

  test("a sprite naming a tile source no asset document holds reports none", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedSprite("missing", "/assets/gone.atlas"),
          embeddedSprite("body", "/assets/a.atlas"),
        ),
      },
      { "assets/a.atlas": atlas("idle") },
    );
    expect(sourceFor(index, "src/hero.ts.script", "missing")).toBeUndefined();
    expect(sourceFor(index, "src/hero.ts.script", "body")).toBe("assets/a.atlas");
    expect(index.unresolved).toHaveLength(1);
    expect(index.unresolved[0]).toContain("/assets/gone.atlas");
  });

  test("a script two objects claim reports no tile source, the way it reports no animation", () => {
    const index = indexOf(
      {
        "main/a.go": gameObject("/src/hero.ts.script", embeddedSprite("body", "/assets/a.atlas")),
        "main/b.go": gameObject("/src/hero.ts.script", embeddedSprite("body", "/assets/a.atlas")),
      },
      { "assets/a.atlas": atlas("idle") },
    );
    expect(index.byScriptResource.has("src/hero.ts.script")).toBe(false);
    expect(index.sourceByScriptResource.has("src/hero.ts.script")).toBe(false);
  });

  test("a model component's animations are the basenames its animation set lists", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedModel("hero", "/anims/hero.animationset"),
        ),
      },
      { "anims/hero.animationset": animationSet("/anims/idle.gltf", "/anims/run.glb") },
    );
    expect(animationsFor(index, "src/hero.ts.script", "hero")).toEqual(["idle", "run"]);
    expect(sourceFor(index, "src/hero.ts.script", "hero")).toBe("anims/hero.animationset");
    expect(index.unresolved).toEqual([]);
  });

  test("a nested animation set prefixes its entries with its own basename", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedModel("hero", "/anims/hero.animationset"),
        ),
      },
      {
        "anims/hero.animationset": animationSet("/anims/idle.gltf", "/anims/combat.animationset"),
        "anims/combat.animationset": animationSet("/anims/slash.gltf"),
      },
    );
    expect(animationsFor(index, "src/hero.ts.script", "hero")).toEqual(["combat/slash", "idle"]);
    expect(index.unresolved).toEqual([]);
  });

  test("a model naming a mesh source directly contributes nothing and is recorded", () => {
    const index = indexOf({
      "main/hero.go": gameObject("/src/hero.ts.script", embeddedModel("hero", "/meshes/hero.gltf")),
    });
    expect(animationsFor(index, "src/hero.ts.script", "hero")).toBeUndefined();
    expect(index.unresolved).toEqual([
      'main/hero.go: the model component "hero" names /meshes/hero.gltf rather than an animation set, so none of its animation ids are established',
    ]);
  });

  test("an entry in an unsupported format contributes nothing and is recorded", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedModel("hero", "/anims/hero.animationset"),
        ),
      },
      { "anims/hero.animationset": animationSet("/anims/idle.gltf", "/anims/legacy.dae") },
    );
    expect(animationsFor(index, "src/hero.ts.script", "hero")).toEqual(["idle"]);
    expect(index.unresolved).toEqual([
      "anims/hero.animationset: the entry /anims/legacy.dae is not a .gltf, .glb or .animationset, so it declares no animation id",
    ]);
  });

  test("two model components on disjoint animation sets stay disjoint", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedModel("hero", "/anims/hero.animationset"),
          referencedComponent("prop", "/models/prop.model"),
        ),
      },
      {
        "anims/hero.animationset": animationSet("/anims/idle.gltf", "/anims/run.glb"),
        "models/prop.model": model("/anims/prop.animationset"),
        "anims/prop.animationset": animationSet("/anims/spin.gltf"),
      },
    );
    expect(animationsFor(index, "src/hero.ts.script", "hero")).toEqual(["idle", "run"]);
    expect(animationsFor(index, "src/hero.ts.script", "prop")).toEqual(["spin"]);
    expect(sourceFor(index, "src/hero.ts.script", "prop")).toBe("anims/prop.animationset");
    expect(index.unresolved).toEqual([]);
  });

  test("a sprite and a model on one object keep their own ids", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedSprite("sprite", "/assets/hero.atlas"),
          embeddedModel("model", "/anims/hero.animationset"),
        ),
      },
      {
        "assets/hero.atlas": atlas("blink"),
        "anims/hero.animationset": animationSet("/anims/idle.gltf"),
      },
    );
    expect(animationsFor(index, "src/hero.ts.script", "sprite")).toEqual(["blink"]);
    expect(animationsFor(index, "src/hero.ts.script", "model")).toEqual(["idle"]);
    expect(index.unresolved).toEqual([]);
  });

  test("an animation set that references itself is recorded, not looped", () => {
    const index = indexOf(
      {
        "main/hero.go": gameObject(
          "/src/hero.ts.script",
          embeddedModel("hero", "/anims/loop.animationset"),
        ),
      },
      { "anims/loop.animationset": animationSet("/anims/loop.animationset") },
    );
    expect(animationsFor(index, "src/hero.ts.script", "hero")).toBeUndefined();
    expect(index.unresolved).toEqual([
      "anims/loop.animationset: the entry /anims/loop.animationset re-enters an animation set already being read, so the chain is cyclic",
    ]);
  });
});

describe("componentIdOfSameObjectAddress", () => {
  test("reads the id out of the same-object form", () => {
    expect(componentIdOfSameObjectAddress("#sprite")).toBe("sprite");
  });

  test("every other address form scopes nothing", () => {
    // A path form names a component on a *different* game object, so resolving
    // its id against this script's object would offer another atlas's ids.
    for (const address of ["sprite", "", "#", "/player#sprite", "a#b#c", "#a#b"]) {
      expect(componentIdOfSameObjectAddress(address)).toBeUndefined();
    }
  });
});
