import type { Url } from "../../src/core-types";
import type { Equal } from "../type-assert";

declare global {
  interface SceneComponentAddresses {
    "/menu#ui": "gui";
    "/menu#camera": "camera";
  }
}

vmath.vector3(1, 2, 3);

// @ts-expect-error gui.* is absent on the script surface
gui.get_width();

// @ts-expect-error render.* is absent on the script surface
render.get_width();

// The hand-authored `render` augmentation is restricted the same as the
// generated namespace: an augmentation must not re-open a wall the kind closes.
// @ts-expect-error render.* is absent on the script surface
render.render_target({});

// The editor VM libraries must not reach a runtime kind. `http`, `json`, `zlib`
// and `pprint` are runtime surfaces in their own right, so the wall is checked
// on the two the engine has no form of: `zip`, and the `tiles` sub-namespace of
// the runtime `tilemap`.
// @ts-expect-error zip.* is an editor VM library, absent on the script surface
zip.pack("a.zip", undefined, "b");
// @ts-expect-error tilemap.tiles.* is an editor VM library, absent on the script surface
tilemap.tiles.new();

// A text property (Defold 1.13.2) round-trips through the untyped fallbacks. It
// is a script property, so it is addressed on the script (`"#"`), never on the
// game object (`"."`), whose only properties are its transform.
go.set("#", "player_name", "Player One");
const _goText: Extract<ReturnType<typeof go.get>, string> = "Player One";

// The script surface loads no `gui` namespace, so a gui address reads the wide
// value; `camera` declares its catalog here, so its address reads it.
declare const url: Url;
const uiMaterial = go.get("/menu#ui", "material");
const wideMaterial = go.get(url, "material");
const _uiMaterial: Equal<typeof uiMaterial, typeof wideMaterial> = true;
const fov = go.get("/menu#camera", "fov");
const _fov: Equal<typeof fov, number> = true;
void [_uiMaterial, _fov];
