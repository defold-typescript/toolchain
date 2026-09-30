/** @noSelfInFile */
import type { Hash, Matrix4, Opaque, Vector3, Vector4 } from "../src/core-types";

declare global {
  /**
   * Functions for interacting with materials.
   */
  namespace material {
    /**
     * Shader constant information
     */
    interface constant_info {
      /**
       * Constant name.
       */
      name: Hash;
      /**
       * Constant type.
       */
      type: material.CONSTANT_TYPE;
      /**
       * Constant value or values. Present for user constants.
       */
      value?: material.constant_info_value;
    }
    type constant_info_value = Vector4 | Matrix4 | Vector4[] | Matrix4[];
    /**
     * Shader constant update
     */
    interface constant_options {
      /**
       * Constant type.
       */
      type?: material.CONSTANT_TYPE;
      /**
       * Constant value or values.
       */
      value?: material.constant_value;
    }
    type constant_value = number | Vector3 | Vector4 | Matrix4 | (number | Vector3 | Vector4 | Matrix4)[];
    /**
     * Named material vertex attribute update
     */
    interface named_vertex_attribute_options {
      /**
       * Attribute name.
       */
      name: string | Hash;
      /**
       * Attribute value.
       */
      value?: material.vertex_attribute_value;
      /**
       * Whether integer data is normalized.
       */
      normalize?: boolean;
      /**
       * Attribute data type.
       */
      data_type?: graphics.DATA_TYPE;
      /**
       * Attribute coordinate space.
       */
      coordinate_space?: graphics.COORDINATE_SPACE;
      /**
       * Attribute semantic.
       */
      semantic_type?: graphics.SEMANTIC_TYPE;
    }
    /**
     * Texture sampler information
     */
    interface sampler_info {
      /**
       * Sampler name.
       */
      name: Hash;
      /**
       * Sampler texture type.
       */
      type: graphics.TEXTURE_TYPE;
      /**
       * Horizontal wrap mode.
       */
      u_wrap: graphics.TEXTURE_WRAP;
      /**
       * Vertical wrap mode.
       */
      v_wrap: graphics.TEXTURE_WRAP;
      /**
       * Depth wrap mode.
       */
      w_wrap: graphics.TEXTURE_WRAP;
      /**
       * Minification filter.
       */
      min_filter: graphics.TEXTURE_FILTER;
      /**
       * Magnification filter.
       */
      mag_filter: graphics.TEXTURE_FILTER;
      /**
       * Maximum anisotropy.
       */
      max_anisotropy: number;
    }
    /**
     * Texture sampler update
     */
    interface sampler_options {
      /**
       * Horizontal wrap mode.
       */
      u_wrap?: graphics.TEXTURE_WRAP;
      /**
       * Vertical wrap mode.
       */
      v_wrap?: graphics.TEXTURE_WRAP;
      /**
       * Depth wrap mode.
       */
      w_wrap?: graphics.TEXTURE_WRAP;
      /**
       * Minification filter.
       */
      min_filter?: graphics.TEXTURE_FILTER;
      /**
       * Magnification filter.
       */
      mag_filter?: graphics.TEXTURE_FILTER;
      /**
       * Maximum anisotropy.
       */
      max_anisotropy?: number;
    }
    /**
     * Texture information
     */
    interface texture_info {
      /**
       * Texture resource path, if backed by a resource.
       */
      path?: Hash;
      /**
       * Runtime texture handle.
       */
      handle: Opaque<"texture">;
      /**
       * Texture width.
       */
      width: number;
      /**
       * Texture height.
       */
      height: number;
      /**
       * Texture depth or layer count.
       */
      depth: number;
      /**
       * Texture page count.
       */
      page_count: number;
      /**
       * Mipmap count.
       */
      mipmaps: number;
      /**
       * Texture type.
       */
      type: graphics.TEXTURE_TYPE;
      /**
       * Texture usage flags.
       */
      flags: graphics.TEXTURE_USAGE_FLAG | number;
    }
    /**
     * Material vertex attribute information
     */
    interface vertex_attribute_info {
      /**
       * Attribute name.
       */
      name: Hash;
      /**
       * Attribute value.
       */
      value: material.vertex_attribute_value;
      /**
       * Whether integer data is normalized.
       */
      normalize: boolean;
      /**
       * Attribute data type.
       */
      data_type: graphics.DATA_TYPE;
      /**
       * Attribute coordinate space.
       */
      coordinate_space: graphics.COORDINATE_SPACE;
      /**
       * Attribute semantic.
       */
      semantic_type: graphics.SEMANTIC_TYPE;
    }
    /**
     * Material vertex attribute update
     */
    interface vertex_attribute_options {
      /**
       * Attribute value.
       */
      value?: material.vertex_attribute_value;
      /**
       * Whether integer data is normalized.
       */
      normalize?: boolean;
      /**
       * Attribute data type.
       */
      data_type?: graphics.DATA_TYPE;
      /**
       * Attribute coordinate space.
       */
      coordinate_space?: graphics.COORDINATE_SPACE;
      /**
       * Attribute semantic.
       */
      semantic_type?: graphics.SEMANTIC_TYPE;
    }
    type vertex_attribute_value = number | Vector3 | Vector4 | Matrix4 | number[];
    type CONSTANT_TYPE = typeof material.CONSTANT_TYPE_USER | typeof material.CONSTANT_TYPE_USER_COLOR | typeof material.CONSTANT_TYPE_USER_MATRIX4 | typeof material.CONSTANT_TYPE_VIEWPROJ | typeof material.CONSTANT_TYPE_WORLD | typeof material.CONSTANT_TYPE_TEXTURE | typeof material.CONSTANT_TYPE_VIEW | typeof material.CONSTANT_TYPE_PROJECTION | typeof material.CONSTANT_TYPE_NORMAL | typeof material.CONSTANT_TYPE_WORLDVIEW | typeof material.CONSTANT_TYPE_WORLDVIEWPROJ | typeof material.CONSTANT_TYPE_TIME | typeof material.CONSTANT_TYPE_WORLD_INVERSE | typeof material.CONSTANT_TYPE_VIEW_INVERSE | typeof material.CONSTANT_TYPE_PROJECTION_INVERSE | typeof material.CONSTANT_TYPE_VIEWPROJ_INVERSE | typeof material.CONSTANT_TYPE_WORLDVIEW_INVERSE | typeof material.CONSTANT_TYPE_WORLDVIEWPROJ_INVERSE;
    /**
     * Normal matrix constant.
     */
    const CONSTANT_TYPE_NORMAL: number & { readonly __brand: "material.CONSTANT_TYPE_NORMAL" };
    /**
     * Projection matrix constant.
     */
    const CONSTANT_TYPE_PROJECTION: number & { readonly __brand: "material.CONSTANT_TYPE_PROJECTION" };
    /**
     * Inverse projection matrix constant.
     */
    const CONSTANT_TYPE_PROJECTION_INVERSE: number & { readonly __brand: "material.CONSTANT_TYPE_PROJECTION_INVERSE" };
    /**
     * Texture matrix constant.
     */
    const CONSTANT_TYPE_TEXTURE: number & { readonly __brand: "material.CONSTANT_TYPE_TEXTURE" };
    /**
     * Time constant.
     */
    const CONSTANT_TYPE_TIME: number & { readonly __brand: "material.CONSTANT_TYPE_TIME" };
    /**
     * User vector constant.
     */
    const CONSTANT_TYPE_USER: number & { readonly __brand: "material.CONSTANT_TYPE_USER" };
    /**
     * User color constant.
     */
    const CONSTANT_TYPE_USER_COLOR: number & { readonly __brand: "material.CONSTANT_TYPE_USER_COLOR" };
    /**
     * User matrix constant.
     */
    const CONSTANT_TYPE_USER_MATRIX4: number & { readonly __brand: "material.CONSTANT_TYPE_USER_MATRIX4" };
    /**
     * View matrix constant.
     */
    const CONSTANT_TYPE_VIEW: number & { readonly __brand: "material.CONSTANT_TYPE_VIEW" };
    /**
     * Inverse view matrix constant.
     */
    const CONSTANT_TYPE_VIEW_INVERSE: number & { readonly __brand: "material.CONSTANT_TYPE_VIEW_INVERSE" };
    /**
     * View-projection matrix constant.
     */
    const CONSTANT_TYPE_VIEWPROJ: number & { readonly __brand: "material.CONSTANT_TYPE_VIEWPROJ" };
    /**
     * Inverse view-projection matrix constant.
     */
    const CONSTANT_TYPE_VIEWPROJ_INVERSE: number & { readonly __brand: "material.CONSTANT_TYPE_VIEWPROJ_INVERSE" };
    /**
     * World matrix constant.
     */
    const CONSTANT_TYPE_WORLD: number & { readonly __brand: "material.CONSTANT_TYPE_WORLD" };
    /**
     * Inverse world matrix constant.
     */
    const CONSTANT_TYPE_WORLD_INVERSE: number & { readonly __brand: "material.CONSTANT_TYPE_WORLD_INVERSE" };
    /**
     * World-view matrix constant.
     */
    const CONSTANT_TYPE_WORLDVIEW: number & { readonly __brand: "material.CONSTANT_TYPE_WORLDVIEW" };
    /**
     * Inverse world-view matrix constant.
     */
    const CONSTANT_TYPE_WORLDVIEW_INVERSE: number & { readonly __brand: "material.CONSTANT_TYPE_WORLDVIEW_INVERSE" };
    /**
     * World-view-projection matrix constant.
     */
    const CONSTANT_TYPE_WORLDVIEWPROJ: number & { readonly __brand: "material.CONSTANT_TYPE_WORLDVIEWPROJ" };
    /**
     * Inverse world-view-projection matrix constant.
     */
    const CONSTANT_TYPE_WORLDVIEWPROJ_INVERSE: number & { readonly __brand: "material.CONSTANT_TYPE_WORLDVIEWPROJ_INVERSE" };
    /**
     * Returns a table of all the shader constants in the material. This function will return all the shader constants
     * that are used in both the vertex and the fragment shaders.
     *
     * @param path - The path to the resource
     * @returns Shader constant information.
     * @example
     * ```ts
     * const constants = material.get_constants(resource.material("/my_material.materialc"));
     * ```
     */
    function get_constants(path: Hash | string): material.constant_info[];
    /**
     * Returns a table of all the texture samplers in the material. This function will return all the texture samplers
     * that are used in both the vertex and the fragment shaders.
     *
     * @param path - The path to the resource
     * @returns texture sampler information
     * @example
     * ```ts
     * const samplers = material.get_samplers(resource.material("/my_material.materialc"));
     * ```
     */
    function get_samplers(path: Hash | string): material.sampler_info[];
    /**
     * Returns a table of all the textures from the material.
     *
     * @param path - The path to the resource
     * @returns material texture information
     * @example
     * ```ts
     * const textures = material.get_textures(resource.material("/my_material.materialc"));
     * ```
     */
    function get_textures(path: Hash | string): material.texture_info[];
    /**
     * Returns a table of all the vertex attributes in the material. This function will return all the vertex attributes
     * that are used in the vertex shader of the material.
     *
     * @param path - The path to the resource
     * @returns vertex attribute information
     * @example
     * ```ts
     * const vertex_attributes = material.get_vertex_attributes(resource.material("/my_material.materialc"));
     * ```
     */
    function get_vertex_attributes(path: Hash | string): material.vertex_attribute_info[];
    /**
     * Sets shader constants in a material, if the constants exist.
     *
     * @param path - The path to the resource
     * @param constants - Shader constant updates keyed by constant name. Partial updates are supported.
     * @example
     * ```ts
     * material.set_constants(resource.material("/my_material.materialc"), { tint: { value: vmath.vector4(1, 0, 0, 1) } });
     * ```
     */
    function set_constants(path: Hash | string, constants: LuaMap<string | Hash, material.constant_options> | Record<string, material.constant_options>): void;
    /**
     * Sets texture samplers in a material, if the samplers exist. Use this function to change the settings of texture samplers.
     * To set actual textures that should be bound to the samplers, use the `material.set_textures` function instead.
     *
     * @param path - The path to the resource
     * @param samplers - Sampler updates keyed by sampler name. Partial updates are supported.
     * @example
     * ```ts
     * material.set_samplers(resource.material("/my_material.materialc"), { texture_sampler: { u_wrap: graphics.TEXTURE_WRAP_REPEAT, v_wrap: graphics.TEXTURE_WRAP_MIRRORED_REPEAT } });
     * ```
     */
    function set_samplers(path: Hash | string, samplers: LuaMap<string | Hash, material.sampler_options> | Record<string, material.sampler_options>): void;
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
    function set_textures(path: Hash | string, textures: LuaMap<string | Hash, string | Hash> | Record<string, string | Hash>): void;
    /**
     * Sets vertex attributes in a material, if the vertex attributes exist.
     *
     * @param path - The path to the resource
     * @param attributes - Vertex attributes keyed by name, or an array with explicit `name` fields. Partial updates are supported.
     * @example
     * ```ts
     * material.set_vertex_attributes(resource.material("/my_material.materialc"), { tint_attribute: { value: vmath.vector4(1, 0, 0, 1), semantic_type: graphics.SEMANTIC_TYPE_COLOR } });
     * ```
     */
    function set_vertex_attributes(path: Hash | string, attributes: LuaMap<string | Hash, material.vertex_attribute_options> | Record<string, material.vertex_attribute_options> | material.named_vertex_attribute_options[]): void;
  }
}

export {};
