/** @noSelfInFile */

import type { Opaque } from "./core-types";

declare global {
  namespace render {
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
