/** @noSelfInFile */
import type { Hash, Matrix4, Vector3, Vector4 } from "../src/core-types";

declare global {
  /**
   * Functions for interacting with materials.
   */
  namespace material {
    /**
     * Returns a table of all the shader constants in the material. This function will return all the shader constants
     * that are used in both the vertex and the fragment shaders.
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
     * const constants = material.get_constants(resource.material("/my_material.materialc"));
     * ```
     */
    function get_constants(path: Hash | string): { name: Hash; type: number; value: Vector4 | Matrix4 }[];
    /**
     * Returns a table of all the texture samplers in the material. This function will return all the texture samplers
     * that are used in both the vertex and the fragment shaders.
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
     * const samplers = material.get_samplers(resource.material("/my_material.materialc"));
     * ```
     */
    function get_samplers(path: Hash | string): { name: Hash; u_wrap: number; v_wrap: number; min_filter: number; mag_filter: number; max_anisotropy: number }[];
    /**
     * Returns a table of all the textures from the material.
     *
     * @param path - The path to the resource
     * @returns A table of tables, where each entry contains info about the material textures:
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
     * const textures = material.get_textures(resource.material("/my_material.materialc"));
     * ```
     */
    function get_textures(path: Hash | string): { path: Hash; handle: Hash; width: number; height: number; depth: number; mipmaps: number; type: number; flags: number }[];
    /**
     * Returns a table of all the vertex attributes in the material. This function will return all the vertex attributes
     * that are used in the vertex shader of the material.
     *
     * @param path - The path to the resource
     * @returns A table of tables, where each entry contains info about the vertex attributes:
     *
     * `name`
     * hash the hashed name of the vertex attribute
     * `value`
     * vmath.vector4 | vmath.vector3 | vmath.matrix4 | number | table the value of the vertex attribute. Matrix attributes that do not map to `vmath.matrix4` are returned as a table of numbers.
     * `normalize`
     * boolean whether the value is normalized when passed into the shader
     * `data_type`
     * number the data type of the vertex attribute. Supported values:
     *
     * - `graphics.DATA_TYPE_BYTE`
     *
     * - `graphics.DATA_TYPE_UNSIGNED_BYTE`
     *
     * - `graphics.DATA_TYPE_SHORT`
     *
     * - `graphics.DATA_TYPE_UNSIGNED_SHORT`
     *
     * - `graphics.DATA_TYPE_INT`
     *
     * - `graphics.DATA_TYPE_UNSIGNED_INT`
     *
     * - `graphics.DATA_TYPE_FLOAT`
     *
     * `coordinate_space`
     * number the coordinate space of the vertex attribute. Supported values:
     *
     * - `graphics.COORDINATE_SPACE_WORLD`
     *
     * - `graphics.COORDINATE_SPACE_LOCAL`
     *
     * `semantic_type`
     * number the semantic type of the vertex attribute. Supported values:
     *
     * - `graphics.SEMANTIC_TYPE_NONE`
     *
     * - `graphics.SEMANTIC_TYPE_POSITION`
     *
     * - `graphics.SEMANTIC_TYPE_TEXCOORD`
     *
     * - `graphics.SEMANTIC_TYPE_PAGE_INDEX`
     *
     * - `graphics.SEMANTIC_TYPE_COLOR`
     *
     * - `graphics.SEMANTIC_TYPE_NORMAL`
     *
     * - `graphics.SEMANTIC_TYPE_TANGENT`
     *
     * - `graphics.SEMANTIC_TYPE_WORLD_MATRIX`
     *
     * - `graphics.SEMANTIC_TYPE_NORMAL_MATRIX`
     *
     * - `graphics.SEMANTIC_TYPE_BONE_WEIGHTS`
     *
     * - `graphics.SEMANTIC_TYPE_BONE_INDICES`
     *
     * - `graphics.SEMANTIC_TYPE_TEXTURE_TRANSFORM_2D`
     * @example
     * ```ts
     * const vertex_attributes = material.get_vertex_attributes(resource.material("/my_material.materialc"));
     * ```
     */
    function get_vertex_attributes(path: Hash | string): { name: Hash; value: Vector4 | Vector3 | Matrix4 | number | number[]; normalize: boolean; data_type: number; coordinate_space: number; semantic_type: number }[];
    /**
     * Sets shader constants in a material, if the constants exist.
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
     * material.set_constants(resource.material("/my_material.materialc"), { tint: { value: vmath.vector4(1, 0, 0, 1) } });
     * ```
     */
    function set_constants(path: Hash | string, constants: Record<string, { type?: number; value?: Vector4 | Vector3 | Matrix4 | number | (Vector4 | Matrix4)[] }>): void;
    /**
     * Sets texture samplers in a material, if the samplers exist. Use this function to change the settings of texture samplers.
     * To set actual textures that should be bound to the samplers, use the `material.set_textures` function instead.
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
     * material.set_samplers(resource.material("/my_material.materialc"), { texture_sampler: { u_wrap: graphics.TEXTURE_WRAP_REPEAT, v_wrap: graphics.TEXTURE_WRAP_MIRRORED_REPEAT } });
     * ```
     */
    function set_samplers(path: Hash | string, samplers: Record<string, { u_wrap?: number; v_wrap?: number; min_filter?: number; mag_filter?: number; max_anisotropy?: number }>): void;
    /**
     * Sets textures in a material, if the samplers exist.
     *
     * @param path - The path to the resource
     * @param textures - A table keyed by sampler name with texture resources as values.
     * @example
     * ```ts
     * material.set_textures(resource.material("/my_material.materialc"), { my_texture: resource.texture() });
     * ```
     */
    function set_textures(path: Hash | string, textures: LuaMap<string, Hash>): void;
    /**
     * Sets vertex attributes in a material, if the vertex attributes exist.
     *
     * @param path - The path to the resource
     * @param attributes - A table keyed by vertex attribute name with args tables as values. Partial updates are supported. Supported entries:
     *
     * `value`
     * vmath.vector4 | vmath.vector3 | vmath.matrix4 | number | table the value of the vertex attribute. Use a table of numbers for matrix attributes that do not map to `vmath.matrix4`.
     * `normalize`
     * boolean whether the value is normalized when passed into the shader
     * `data_type`
     * number the data type of the vertex attribute. Supported values:
     *
     * - `graphics.DATA_TYPE_BYTE`
     *
     * - `graphics.DATA_TYPE_UNSIGNED_BYTE`
     *
     * - `graphics.DATA_TYPE_SHORT`
     *
     * - `graphics.DATA_TYPE_UNSIGNED_SHORT`
     *
     * - `graphics.DATA_TYPE_INT`
     *
     * - `graphics.DATA_TYPE_UNSIGNED_INT`
     *
     * - `graphics.DATA_TYPE_FLOAT`
     *
     * `coordinate_space`
     * number the coordinate space of the vertex attribute. Supported values:
     *
     * - `graphics.COORDINATE_SPACE_DEFAULT`
     *
     * - `graphics.COORDINATE_SPACE_WORLD`
     *
     * - `graphics.COORDINATE_SPACE_LOCAL`
     *
     * `semantic_type`
     * number the semantic type of the vertex attribute. Supported values:
     *
     * - `graphics.SEMANTIC_TYPE_NONE`
     *
     * - `graphics.SEMANTIC_TYPE_POSITION`
     *
     * - `graphics.SEMANTIC_TYPE_TEXCOORD`
     *
     * - `graphics.SEMANTIC_TYPE_PAGE_INDEX`
     *
     * - `graphics.SEMANTIC_TYPE_COLOR`
     *
     * - `graphics.SEMANTIC_TYPE_NORMAL`
     *
     * - `graphics.SEMANTIC_TYPE_TANGENT`
     *
     * - `graphics.SEMANTIC_TYPE_WORLD_MATRIX`
     *
     * - `graphics.SEMANTIC_TYPE_NORMAL_MATRIX`
     *
     * - `graphics.SEMANTIC_TYPE_BONE_WEIGHTS`
     *
     * - `graphics.SEMANTIC_TYPE_BONE_INDICES`
     *
     * - `graphics.SEMANTIC_TYPE_TEXTURE_TRANSFORM_2D`
     * @example
     * ```ts
     * material.set_vertex_attributes(resource.material("/my_material.materialc"), { tint_attribute: { value: vmath.vector4(1, 0, 0, 1), semantic_type: graphics.SEMANTIC_TYPE_COLOR } });
     * ```
     */
    function set_vertex_attributes(path: Hash | string, attributes: Record<string, { value?: Vector4 | Vector3 | Matrix4 | number | number[]; normalize?: boolean; data_type?: number; coordinate_space?: number; semantic_type?: number }>): void;
  }
}

export {};
