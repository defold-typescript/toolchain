/** @noSelfInFile */
import type { Hash, Matrix4, Vector3, Vector4 } from "../src/core-types";

declare global {
  /**
   * Functions for interacting with compute programs.
   */
  namespace compute {
    /**
     * Returns a table of all the shader constants in the compute program.
     *
     * @param path - The path to the resource
     * @returns A table of tables, where each entry contains info about the shader constants:
     *
     * `name`
     * hash the hashed name of the constant
     * `type`
     * number the type of the constant. Supported values:
     *
     * - `material.CONSTANT_TYPE_USER`
     *
     * - `material.CONSTANT_TYPE_USER_MATRIX4`
     *
     * - `material.CONSTANT_TYPE_VIEWPROJ`
     *
     * - `material.CONSTANT_TYPE_WORLD`
     *
     * - `material.CONSTANT_TYPE_TEXTURE`
     *
     * - `material.CONSTANT_TYPE_VIEW`
     *
     * - `material.CONSTANT_TYPE_PROJECTION`
     *
     * - `material.CONSTANT_TYPE_NORMAL`
     *
     * - `material.CONSTANT_TYPE_WORLDVIEW`
     *
     * - `material.CONSTANT_TYPE_WORLDVIEWPROJ`
     *
     * - `material.CONSTANT_TYPE_TIME`
     *
     * - `material.CONSTANT_TYPE_WORLD_INVERSE`
     *
     * - `material.CONSTANT_TYPE_VIEW_INVERSE`
     *
     * - `material.CONSTANT_TYPE_PROJECTION_INVERSE`
     *
     * - `material.CONSTANT_TYPE_VIEWPROJ_INVERSE`
     *
     * - `material.CONSTANT_TYPE_WORLDVIEW_INVERSE`
     *
     * - `material.CONSTANT_TYPE_WORLDVIEWPROJ_INVERSE`
     *
     * `value`
     * vmath.vector4 | vmath.matrix4 the value(s) of the constant. If the constant is an array, the value will be a table of vmath.vector4 or vmath.matrix4 if the type is `material.CONSTANT_TYPE_USER_MATRIX4`.
     * @example
     * ```ts
     * const constants = compute.get_constants("/my_compute.computec");
     * ```
     */
    function get_constants(path: Hash | string): { name: Hash; type: number; value: Vector4 | Matrix4 };
    /**
     * Returns a table of all the texture samplers in the compute program. This function will return all the texture samplers
     * that are available, even the ones that have not been specified in the compute resource.
     *
     * @param path - The path to the resource
     * @returns A table of tables, where each entry contains info about the texture samplers:
     *
     * `name`
     * hash the hashed name of the texture sampler
     * `u_wrap`
     * number the u wrap mode of the texture sampler. Supported values:
     *
     * - `graphics.TEXTURE_WRAP_CLAMP_TO_BORDER`
     *
     * - `graphics.TEXTURE_WRAP_CLAMP_TO_EDGE`
     *
     * - `graphics.TEXTURE_WRAP_MIRRORED_REPEAT`
     *
     * - `graphics.TEXTURE_WRAP_REPEAT`
     *
     * `v_wrap`
     * number the v wrap mode of the texture sampler. Supported values:
     *
     * - `graphics.TEXTURE_WRAP_CLAMP_TO_BORDER`
     *
     * - `graphics.TEXTURE_WRAP_CLAMP_TO_EDGE`
     *
     * - `graphics.TEXTURE_WRAP_MIRRORED_REPEAT`
     *
     * - `graphics.TEXTURE_WRAP_REPEAT`
     *
     * `min_filter`
     * number the min filter mode of the texture sampler. Supported values:
     *
     * - `graphics.TEXTURE_FILTER_DEFAULT`
     *
     * - `graphics.TEXTURE_FILTER_NEAREST`
     *
     * - `graphics.TEXTURE_FILTER_LINEAR`
     *
     * - `graphics.TEXTURE_FILTER_NEAREST_MIPMAP_NEAREST`
     *
     * - `graphics.TEXTURE_FILTER_NEAREST_MIPMAP_LINEAR`
     *
     * - `graphics.TEXTURE_FILTER_LINEAR_MIPMAP_NEAREST`
     *
     * - `graphics.TEXTURE_FILTER_LINEAR_MIPMAP_LINEAR`
     *
     * `mag_filter`
     * number the mag filter mode of the texture sampler
     *
     * - `graphics.TEXTURE_FILTER_DEFAULT`
     *
     * - `graphics.TEXTURE_FILTER_NEAREST`
     *
     * - `graphics.TEXTURE_FILTER_LINEAR`
     *
     * `max_anisotropy`
     * number the max anisotropy of the texture sampler
     * @example
     * ```ts
     * const samplers = compute.get_samplers("/my_compute.computec");
     * ```
     */
    function get_samplers(path: Hash | string): { name: Hash; u_wrap: number; v_wrap: number; min_filter: number; mag_filter: number; max_anisotropy: number };
    /**
     * Returns a table of all the textures from the compute program.
     *
     * @param path - The path to the resource
     * @returns A table of tables, where each entry contains info about the compute textures:
     *
     * `path`
     * hash the resource path of the texture. Only available if the texture is a resource.
     * `handle`
     * hash the runtime handle of the texture.
     * `width`
     * number the width of the texture
     * `height`
     * number the height of the texture
     * `depth`
     * number the depth of the texture. Corresponds to the number of layers in an array texture.
     * `mipmaps`
     * number the number of mipmaps in the texture
     * `type`
     * number the type of the texture. Supported values:
     *
     * - `graphics.TEXTURE_TYPE_2D`
     *
     * - `graphics.TEXTURE_TYPE_2D_ARRAY`
     *
     * - `graphics.TEXTURE_TYPE_CUBE_MAP`
     *
     * - `graphics.TEXTURE_TYPE_IMAGE_2D`
     *
     * - `graphics.TEXTURE_TYPE_3D`
     *
     * - `graphics.TEXTURE_TYPE_IMAGE_3D`
     *
     * `flags`
     * number the flags of the texture. This field is a bit mask of these supported flags:
     *
     * - `graphics.TEXTURE_USAGE_FLAG_SAMPLE`
     *
     * - `graphics.TEXTURE_USAGE_FLAG_MEMORYLESS`
     *
     * - `graphics.TEXTURE_USAGE_FLAG_STORAGE`
     *
     * - `graphics.TEXTURE_USAGE_FLAG_INPUT`
     *
     * - `graphics.TEXTURE_USAGE_FLAG_COLOR`
     * @example
     * ```ts
     * const textures = compute.get_textures("/my_compute.computec");
     * ```
     */
    function get_textures(path: Hash | string): { path: Hash; handle: Hash; width: number; height: number; depth: number; mipmaps: number; type: number; flags: number };
    /**
     * Sets shader constants in a compute program, if the constants exist.
     *
     * @param path - The path to the resource
     * @param constants - A table keyed by constant name with args tables as values. Constants can be partially updated. Supported entries:
     *
     * `type`
     * number the type of the constant. Supported values:
     *
     * - `material.CONSTANT_TYPE_USER`
     *
     * - `material.CONSTANT_TYPE_USER_MATRIX4`
     *
     * - `material.CONSTANT_TYPE_VIEWPROJ`
     *
     * - `material.CONSTANT_TYPE_WORLD`
     *
     * - `material.CONSTANT_TYPE_TEXTURE`
     *
     * - `material.CONSTANT_TYPE_VIEW`
     *
     * - `material.CONSTANT_TYPE_PROJECTION`
     *
     * - `material.CONSTANT_TYPE_NORMAL`
     *
     * - `material.CONSTANT_TYPE_WORLDVIEW`
     *
     * - `material.CONSTANT_TYPE_WORLDVIEWPROJ`
     *
     * - `material.CONSTANT_TYPE_TIME`
     *
     * - `material.CONSTANT_TYPE_WORLD_INVERSE`
     *
     * - `material.CONSTANT_TYPE_VIEW_INVERSE`
     *
     * - `material.CONSTANT_TYPE_PROJECTION_INVERSE`
     *
     * - `material.CONSTANT_TYPE_VIEWPROJ_INVERSE`
     *
     * - `material.CONSTANT_TYPE_WORLDVIEW_INVERSE`
     *
     * - `material.CONSTANT_TYPE_WORLDVIEWPROJ_INVERSE`
     *
     * `value`
     * vmath.vector4 | vmath.vector3 | vmath.matrix4 | number | table the value(s) of the constant. If the shader constant is an array, the amount of values to update depends on how many values that are passed in the 'value' field.
     * @example
     * ```ts
     * compute.set_constants("/my_compute.computec", { tint: { value: vmath.vector4(1, 0, 0, 1) } });
     * ```
     */
    function set_constants(path: Hash | string, constants: { type?: number; value?: Vector4 | Vector3 | Matrix4 | number | Record<string | number, unknown> }): void;
    /**
     * Sets texture samplers in a compute program, if the samplers exist. Use this function to change the settings of texture samplers.
     * To set actual textures that should be bound to the samplers, use the `compute.set_textures` function instead.
     *
     * @param path - The path to the resource
     * @param samplers - A table keyed by sampler name with args tables as values. Partial updates are supported. Supported entries:
     *
     * `u_wrap`
     * number the u wrap mode of the texture sampler. Supported values:
     *
     * - `graphics.TEXTURE_WRAP_CLAMP_TO_BORDER`
     *
     * - `graphics.TEXTURE_WRAP_CLAMP_TO_EDGE`
     *
     * - `graphics.TEXTURE_WRAP_MIRRORED_REPEAT`
     *
     * - `graphics.TEXTURE_WRAP_REPEAT`
     *
     * `v_wrap`
     * number the v wrap mode of the texture sampler. Supported values:
     *
     * - `graphics.TEXTURE_WRAP_CLAMP_TO_BORDER`
     *
     * - `graphics.TEXTURE_WRAP_CLAMP_TO_EDGE`
     *
     * - `graphics.TEXTURE_WRAP_MIRRORED_REPEAT`
     *
     * - `graphics.TEXTURE_WRAP_REPEAT`
     *
     * `min_filter`
     * number the min filter mode of the texture sampler. Supported values:
     *
     * - `graphics.TEXTURE_FILTER_DEFAULT`
     *
     * - `graphics.TEXTURE_FILTER_NEAREST`
     *
     * - `graphics.TEXTURE_FILTER_LINEAR`
     *
     * - `graphics.TEXTURE_FILTER_NEAREST_MIPMAP_NEAREST`
     *
     * - `graphics.TEXTURE_FILTER_NEAREST_MIPMAP_LINEAR`
     *
     * - `graphics.TEXTURE_FILTER_LINEAR_MIPMAP_NEAREST`
     *
     * - `graphics.TEXTURE_FILTER_LINEAR_MIPMAP_LINEAR`
     *
     * `mag_filter`
     * number the mag filter mode of the texture sampler
     *
     * - `graphics.TEXTURE_FILTER_DEFAULT`
     *
     * - `graphics.TEXTURE_FILTER_NEAREST`
     *
     * - `graphics.TEXTURE_FILTER_LINEAR`
     *
     * `max_anisotropy`
     * number the max anisotropy of the texture sampler
     * @example
     * ```ts
     * compute.set_samplers("/my_compute.computec", { texture_sampler: { u_wrap: graphics.TEXTURE_WRAP_REPEAT, v_wrap: graphics.TEXTURE_WRAP_MIRRORED_REPEAT } });
     * ```
     */
    function set_samplers(path: Hash | string, samplers: { u_wrap?: number; v_wrap?: number; min_filter?: number; mag_filter?: number; max_anisotropy?: number }): void;
    /**
     * Sets textures in a compute program, if the samplers exist.
     *
     * @param path - The path to the resource
     * @param textures - A table keyed by sampler name with texture resources as values.
     * @example
     * ```ts
     * compute.set_textures("/my_compute.computec", { my_texture: resource.texture() });
     * ```
     */
    function set_textures(path: Hash | string, textures: Record<string | number, unknown>): void;
  }
}

export {};
