import { describe, expect, test } from "bun:test";
import { buildGuiFlipbookIndex } from "./gui-flipbook-index";

// A standalone `images` block is a bare image the atlas exposes without
// declaring an animation for it. Present in every fixture because only
// `animations { id: … }` may reach a suggestion: a wrong id in this slot is a
// runtime crash rather than a no-op.
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

function texture(name: string, resource: string): string {
  return `textures {\n  name: "${name}"\n  texture: "${resource}"\n}\n`;
}

function gui(script: string | undefined, ...textures: string[]): string {
  const head = script === undefined ? "" : `script: "${script}"\n`;
  return `${head}material: "/builtins/materials/gui.material"\n${textures.join("")}`;
}

function indexOf(scenes: Record<string, string>, assets: Record<string, string> = {}) {
  return buildGuiFlipbookIndex({
    scenes: new Map(Object.entries(scenes)),
    assets: new Map(Object.entries(assets)),
  });
}

function animationsFor(index: ReturnType<typeof indexOf>, resource: string): string[] | undefined {
  const found = index.byScriptResource.get(resource);
  return found === undefined ? undefined : [...found.keys()].sort();
}

describe("buildGuiFlipbookIndex", () => {
  test("a gui script sees only the animations its own scene's textures declare", () => {
    const index = indexOf(
      {
        "main/hud.gui": gui("/hud.ts.gui_script", texture("hud", "/assets/hud.atlas")),
        "main/menu.gui": gui("/menu.ts.gui_script", texture("menu", "/assets/menu.atlas")),
      },
      {
        "assets/hud.atlas": atlas("blink", "pulse"),
        "assets/menu.atlas": atlas("fade", "slide"),
      },
    );
    expect(animationsFor(index, "hud.ts.gui_script")).toEqual(["blink", "pulse"]);
    expect(animationsFor(index, "menu.ts.gui_script")).toEqual(["fade", "slide"]);
    expect(index.unresolved).toEqual([]);
  });

  test("a scene naming two textures unions them, and stops there", () => {
    const index = indexOf(
      {
        "main/hud.gui": gui(
          "/hud.ts.gui_script",
          texture("hud", "/assets/hud.atlas"),
          texture("menu", "/assets/menu.atlas"),
        ),
      },
      {
        "assets/hud.atlas": atlas("blink", "pulse"),
        "assets/menu.atlas": atlas("fade", "slide"),
        "assets/orphan.atlas": atlas("spin"),
      },
    );
    expect(animationsFor(index, "hud.ts.gui_script")).toEqual(["blink", "fade", "pulse", "slide"]);
    expect(index.unresolved).toEqual([]);
  });

  test("a texture the project does not declare is recorded, not guessed", () => {
    const index = indexOf(
      {
        "main/hud.gui": gui(
          "/hud.ts.gui_script",
          texture("hud", "/assets/hud.atlas"),
          texture("gone", "/assets/absent.atlas"),
        ),
      },
      { "assets/hud.atlas": atlas("blink") },
    );
    expect(animationsFor(index, "hud.ts.gui_script")).toEqual(["blink"]);
    expect(index.unresolved).toHaveLength(1);
    expect(index.unresolved[0]).toContain("main/hud.gui");
    expect(index.unresolved[0]).toContain("/assets/absent.atlas");
  });

  test("two scenes claiming one script make its animations ambiguous", () => {
    const index = indexOf(
      {
        "main/a.gui": gui("/hud.ts.gui_script", texture("hud", "/assets/hud.atlas")),
        "main/b.gui": gui("/hud.ts.gui_script", texture("menu", "/assets/menu.atlas")),
      },
      {
        "assets/hud.atlas": atlas("blink"),
        "assets/menu.atlas": atlas("fade"),
      },
    );
    expect(index.byScriptResource.has("hud.ts.gui_script")).toBe(false);
    expect(index.unresolved).toHaveLength(1);
    expect(index.unresolved[0]).toContain("main/a.gui");
    expect(index.unresolved[0]).toContain("main/b.gui");
    expect(index.unresolved[0]).toContain("hud.ts.gui_script");
  });

  test("a scene naming no .gui_script is skipped", () => {
    const index = indexOf(
      {
        "main/orphan.gui": gui(undefined, texture("hud", "/assets/hud.atlas")),
        "main/legacy.gui": gui("/hud.lua", texture("hud", "/assets/hud.atlas")),
      },
      { "assets/hud.atlas": atlas("blink") },
    );
    expect([...index.byScriptResource.keys()]).toEqual([]);
    expect(index.unresolved).toEqual([]);
  });

  test("an id is credited to every named texture that declares it", () => {
    const index = indexOf(
      {
        "main/hud.gui": gui(
          "/hud.ts.gui_script",
          texture("hud", "/assets/hud.atlas"),
          texture("menu", "/assets/menu.atlas"),
        ),
      },
      {
        "assets/hud.atlas": atlas("blink"),
        "assets/menu.atlas": atlas("blink", "fade"),
      },
    );
    const declared = index.byScriptResource.get("hud.ts.gui_script");
    expect([...(declared?.get("blink") ?? [])]).toEqual(["assets/hud.atlas", "assets/menu.atlas"]);
    expect([...(declared?.get("fade") ?? [])]).toEqual(["assets/menu.atlas"]);
  });
});
