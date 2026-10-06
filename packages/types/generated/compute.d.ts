/** @noSelfInFile */
import type { Hash } from "../src/core-types";

declare global {
  /**
   * Functions for interacting with compute programs.
   */
  namespace compute {
    /**
     * Returns a table of all the shader constants in the compute program.
     *
     * @param path - The path to the resource
     * @returns Information about the shader constants.
     * @example
     * ```ts
     * const constants = compute.get_constants("/my_compute.computec");
     * ```
     */
    function get_constants(path: Hash | string): material.constant_info[];
    /**
     * Returns a table of all the texture samplers in the compute program. This function will return all the texture samplers
     * that are available, even the ones that have not been specified in the compute resource.
     *
     * @param path - The path to the resource
     * @returns Information about the texture samplers.
     * @example
     * ```ts
     * const samplers = compute.get_samplers("/my_compute.computec");
     * ```
     */
    function get_samplers(path: Hash | string): material.sampler_info[];
    /**
     * Returns a table of all the textures from the compute program.
     *
     * @param path - The path to the resource
     * @returns Information about the compute textures.
     * @example
     * ```ts
     * const textures = compute.get_textures("/my_compute.computec");
     * ```
     */
    function get_textures(path: Hash | string): material.texture_info[];
    /**
     * Sets shader constants in a compute program, if the constants exist.
     *
     * @param path - The path to the resource
     * @param constants - Constant options keyed by constant name. Partial updates are supported.
     * @example
     * ```ts
     * // Set a shader constant in a compute program
     * export default defineScript({
     *   init() {
     *     return { my_view_proj: vmath.matrix4() };
     *   },
     *
     *   update(self) {
     *     // update the 'tint' constant
     *     compute.set_constants("/my_compute.computec", {
     *       tint: { value: vmath.vector4(1, 0, 0, 1) },
     *     });
     *     // change the type of the 'view_proj' constant to CONSTANT_TYPE_USER_MATRIX4 so the renderer can set our custom data
     *     compute.set_constants("/my_compute.computec", {
     *       view_proj: { value: self.my_view_proj, type: material.CONSTANT_TYPE_USER_MATRIX4 },
     *     });
     *   },
     * });
     * ```
     */
    function set_constants(path: Hash | string, constants: LuaMap<string | Hash, material.constant_options> | Record<string, material.constant_options>): void;
    /**
     * Sets texture samplers in a compute program, if the samplers exist. Use this function to change the settings of texture samplers.
     * To set actual textures that should be bound to the samplers, use the `compute.set_textures` function instead.
     *
     * @param path - The path to the resource
     * @param samplers - Sampler options keyed by sampler name. Partial updates are supported.
     * @example
     * ```ts
     * compute.set_samplers("/my_compute.computec", { texture_sampler: { u_wrap: graphics.TEXTURE_WRAP_REPEAT, v_wrap: graphics.TEXTURE_WRAP_MIRRORED_REPEAT } });
     * ```
     */
    function set_samplers(path: Hash | string, samplers: LuaMap<string | Hash, material.sampler_options> | Record<string, material.sampler_options>): void;
    /**
     * Sets textures in a compute program, if the samplers exist.
     *
     * @param path - The path to the resource
     * @param textures - A table keyed by sampler name with texture resources as values.
     * @example
     * ```ts
     * // Set a texture in a compute program from a resource
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_texture: resource.texture() },
     *
     *   init(self) {
     *     compute.set_textures("/my_compute.computec", {
     *       my_texture: self.my_texture,
     *     });
     *   },
     * });
     * ```
     */
    function set_textures(path: Hash | string, textures: LuaMap<string | Hash, string | Hash> | Record<string, string | Hash>): void;
  }
}

export {};
