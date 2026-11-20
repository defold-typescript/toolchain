import { defineGuiScript } from "../../generated/kinds/gui-script";
import type { Hash, Vector4 } from "../../src/core-types";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

declare global {
  interface SceneComponentAddresses {
    "/menu#ui": "gui";
  }
}

vmath.vector3(1, 2, 3);
const _w: number = gui.get_width();
void _w;

// The typed `gui` overloads reach the gui-script surface.
const _pos: Vector4 = gui.get(gui.get_node("box"), "position");
void _pos;

// @ts-expect-error render.* is absent on the gui-script surface
render.get_width();

// The hand-authored `render` augmentation is restricted the same as the
// generated namespace: an augmentation must not re-open a wall the kind closes.
// @ts-expect-error render.* is absent on the gui-script surface
render.render_target({});

defineGuiScript({
  init: () => ({ frames: 0 }),
  update(self) {
    const _frames: number = self.frames;
    void _frames;
  },
});

defineGuiScript({
  // @ts-expect-error a gui script cannot declare properties
  properties: { speed: 1 },
});

// The gui-script surface loads the `gui` namespace, whose catalog a gui address reads.
const uiMaterial = go.get("/menu#ui", "material");
const _uiMaterial: Equal<typeof uiMaterial, Hash> = true;
void _uiMaterial;
// @ts-expect-error material is a Hash
go.set("/menu#ui", "material", 1);
