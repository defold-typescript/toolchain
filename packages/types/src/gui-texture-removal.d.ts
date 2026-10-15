/** @noSelfInFile */

import type { Hash, Url } from "./core-types";

// The nil branch of gui_script.cpp:LuaSet exists from Defold 1.13.1, so this
// arm rides only the surfaces whose import gate (`regen.ts`) admits it.
declare global {
  namespace gui {
    /**
     * Removes the runtime texture mapping the `key` option names from the gui
     * component itself. Needs Defold 1.13.1 or later.
     *
     * @param url - msg.url() to the gui itself
     * @param property - the textures property
     * @param value - nil, to remove the mapping
     * @param options - options table; `key` names the texture to remove
     * @example
     * Remove a named runtime texture resource mapping:
     * ```ts
     * const atlas_params = {
     *   texture: "/runtime.texturec",
     *   animations: [{ id: "runtime", width: 1, height: 1, frames: [1] }],
     *   geometries: [{ vertices: [0, 0, 0, 1, 1, 1, 1, 0], uvs: [0, 0, 0, 1, 1, 1, 1, 0], indices: [0, 1, 2, 0, 2, 3] }],
     * } satisfies Parameters<typeof resource.create_atlas>[1];
     * const atlas_id = resource.create_atlas("/runtime.texturesetc", atlas_params);
     * gui.set(msg.url(), "textures", atlas_id, { key: "runtime_texture" });
     * gui.set_texture(gui.get_node("box"), "runtime_texture");
     *
     * // Later, remove the GUI mapping before releasing the atlas resource.
     * gui.set(msg.url(), "textures", undefined, { key: "runtime_texture" });
     * resource.release(atlas_id);
     * ```
     */
    function set(
      url: Url,
      property: "textures",
      value: undefined,
      options: { key: string | Hash },
    ): void;
  }
}
