/** @noSelfInFile */

import type { Opaque } from "./core-types";

declare global {
  namespace render {
    /**
     * The buffer keys `render.clear` accepts: the three `graphics.BUFFER_TYPE_*`
     * constants the reference names. Declare the clear table with this alias —
     * `LuaMap`'s iterator makes its key parameter invariant, so a
     * `LuaMap<number, ...>` is not assignable however its entries were set.
     *
     * @example
     * ```ts
     * const buffers = new LuaMap<render.ClearBufferKey, number | Vector4>();
     * buffers.set(graphics.BUFFER_TYPE_COLOR0_BIT, vmath.vector4(0, 0, 0, 0));
     * render.clear(buffers);
     * ```
     */
    type ClearBufferKey =
      | typeof graphics.BUFFER_TYPE_COLOR0_BIT
      | typeof graphics.BUFFER_TYPE_DEPTH_BIT
      | typeof graphics.BUFFER_TYPE_STENCIL_BIT;
    /**
     * Creates a new render target according to the supplied specification table.
     * The parameter table is keyed by buffer type, with one parameter table per
     * attachment; see the reference for the available keys and values.
     *
     * @param parameters - table of buffer parameters, see the description for available keys and values
     * @returns new render target
     */
    function render_target(parameters: Record<string | number, unknown>): Opaque<"render_target">;
    /**
     * Creates a new named render target according to the supplied specification
     * table. The name is used by the profiler and by render target lookups.
     *
     * @param name - render target name
     * @param parameters - table of buffer parameters, see the description for available keys and values
     * @returns new render target
     */
    function render_target(
      name: string,
      parameters: Record<string | number, unknown>,
    ): Opaque<"render_target">;
  }
}
