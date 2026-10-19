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
    interface ConstantInfo {
      /**
       * Constant name.
       */
      name: Hash;
      /**
       * Constant type.
       */
      type: material.ConstantType;
      /**
       * Constant value or values. Present for user constants.
       */
      value?: material.ConstantInfoValue;
    }
    type ConstantInfoValue = Vector4 | Matrix4 | Vector4[] | Matrix4[];
    /**
     * Shader constant update
     */
    interface ConstantOptions {
      /**
       * Constant type.
       */
      type?: material.ConstantType;
      /**
       * Constant value or values.
       */
      value?: material.ConstantValue;
    }
    type ConstantValue = number | Vector3 | Vector4 | Matrix4 | (number | Vector3 | Vector4 | Matrix4)[];
    /**
     * Named material vertex attribute update
     */
    interface NamedVertexAttributeOptions {
      /**
       * Attribute name.
       */
      name: string | Hash;
      /**
       * Attribute value.
       */
      value?: material.VertexAttributeValue;
      /**
       * Whether integer data is normalized.
       */
      normalize?: boolean;
      /**
       * Attribute data type.
       */
      data_type?: graphics.DataType;
      /**
       * Attribute coordinate space.
       */
      coordinate_space?: graphics.CoordinateSpace;
      /**
       * Attribute semantic.
       */
      semantic_type?: graphics.SemanticType;
    }
    /**
     * Texture sampler information
     */
    interface SamplerInfo {
      /**
       * Sampler name.
       */
      name: Hash;
      /**
       * Sampler texture type.
       */
      type: graphics.TextureType | 6 | 7 | 8 | 9 | 10;
      /**
       * Horizontal wrap mode.
       */
      u_wrap: graphics.TextureWrap;
      /**
       * Vertical wrap mode.
       */
      v_wrap: graphics.TextureWrap;
      /**
       * Depth wrap mode.
       */
      w_wrap: graphics.TextureWrap;
      /**
       * Minification filter.
       */
      min_filter: graphics.TextureFilter;
      /**
       * Magnification filter.
       */
      mag_filter: graphics.TextureFilter;
      /**
       * Maximum anisotropy.
       */
      max_anisotropy: number;
    }
    /**
     * Texture sampler update
     */
    interface SamplerOptions {
      /**
       * Horizontal wrap mode.
       */
      u_wrap?: graphics.TextureWrap;
      /**
       * Vertical wrap mode.
       */
      v_wrap?: graphics.TextureWrap;
      /**
       * Depth wrap mode.
       */
      w_wrap?: graphics.TextureWrap;
      /**
       * Minification filter.
       */
      min_filter?: graphics.TextureFilter;
      /**
       * Magnification filter.
       */
      mag_filter?: graphics.TextureFilter;
      /**
       * Maximum anisotropy.
       */
      max_anisotropy?: number;
    }
    /**
     * Texture information
     */
    interface TextureInfo {
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
      type: graphics.TextureType;
      /**
       * Texture usage flags.
       */
      flags: graphics.TextureUsageFlag | number;
    }
    /**
     * Material vertex attribute information
     */
    interface VertexAttributeInfo {
      /**
       * Attribute name.
       */
      name: Hash;
      /**
       * Attribute value.
       */
      value: material.VertexAttributeValue;
      /**
       * Whether integer data is normalized.
       */
      normalize: boolean;
      /**
       * Attribute data type.
       */
      data_type: graphics.DataType;
      /**
       * Attribute coordinate space.
       */
      coordinate_space: graphics.CoordinateSpace;
      /**
       * Attribute semantic.
       */
      semantic_type: graphics.SemanticType;
    }
    /**
     * Material vertex attribute update
     */
    interface VertexAttributeOptions {
      /**
       * Attribute value.
       */
      value?: material.VertexAttributeValue;
      /**
       * Whether integer data is normalized.
       */
      normalize?: boolean;
      /**
       * Attribute data type.
       */
      data_type?: graphics.DataType;
      /**
       * Attribute coordinate space.
       */
      coordinate_space?: graphics.CoordinateSpace;
      /**
       * Attribute semantic.
       */
      semantic_type?: graphics.SemanticType;
    }
    type VertexAttributeValue = number | Vector3 | Vector4 | Matrix4 | number[];
    type ConstantType = typeof material.CONSTANT_TYPE_USER | typeof material.CONSTANT_TYPE_USER_COLOR | typeof material.CONSTANT_TYPE_USER_MATRIX4 | typeof material.CONSTANT_TYPE_VIEWPROJ | typeof material.CONSTANT_TYPE_WORLD | typeof material.CONSTANT_TYPE_TEXTURE | typeof material.CONSTANT_TYPE_VIEW | typeof material.CONSTANT_TYPE_PROJECTION | typeof material.CONSTANT_TYPE_NORMAL | typeof material.CONSTANT_TYPE_WORLDVIEW | typeof material.CONSTANT_TYPE_WORLDVIEWPROJ | typeof material.CONSTANT_TYPE_TIME | typeof material.CONSTANT_TYPE_WORLD_INVERSE | typeof material.CONSTANT_TYPE_VIEW_INVERSE | typeof material.CONSTANT_TYPE_PROJECTION_INVERSE | typeof material.CONSTANT_TYPE_VIEWPROJ_INVERSE | typeof material.CONSTANT_TYPE_WORLDVIEW_INVERSE | typeof material.CONSTANT_TYPE_WORLDVIEWPROJ_INVERSE;
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
     * // Get the shader constants from a material specified as a resource property
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_material: resource.material() },
     *
     *   init(self) {
     *     const constants = material.get_constants(self.my_material);
     *   },
     * });
     * ```
     */
    function get_constants(path: Hash | string): material.ConstantInfo[];
    /**
     * Returns a table of all the texture samplers in the material. This function will return all the texture samplers
     * that are used in both the vertex and the fragment shaders.
     *
     * @param path - The path to the resource
     * @returns texture sampler information
     * @example
     * ```ts
     * // Get the texture samplers from a material specified as a resource property
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_material: resource.material() },
     *
     *   init(self) {
     *     const samplers = material.get_samplers(self.my_material);
     *   },
     * });
     * ```
     */
    function get_samplers(path: Hash | string): material.SamplerInfo[];
    /**
     * Returns a table of all the textures from the material.
     *
     * @param path - The path to the resource
     * @returns material texture information. Keyed by sampler slot from 1; a slot with no texture has no entry, so iterate with `for (const [slot, info] of textures)`.
     * @example
     * ```ts
     * // Get the textures from a material specified as a resource property
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_material: resource.material() },
     *
     *   init(self) {
     *     const textures = material.get_textures(self.my_material);
     *   },
     * });
     * ```
     */
    function get_textures(path: Hash | string): LuaMap<number, material.TextureInfo>;
    /**
     * Returns a table of all the vertex attributes in the material. This function will return all the vertex attributes
     * that are used in the vertex shader of the material.
     *
     * @param path - The path to the resource
     * @returns vertex attribute information
     * @example
     * ```ts
     * // Get the vertex attributes from a material specified as a resource property
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_material: resource.material() },
     *
     *   init(self) {
     *     const vertex_attributes = material.get_vertex_attributes(self.my_material);
     *   },
     * });
     * ```
     */
    function get_vertex_attributes(path: Hash | string): material.VertexAttributeInfo[];
    /**
     * Sets shader constants in a material, if the constants exist.
     *
     * @param path - The path to the resource
     * @param constants - Shader constant updates keyed by constant name. Partial updates are supported.
     * @example
     * ```ts
     * // Set a shader constant in a material specified as a resource property
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_material: resource.material() },
     *
     *   init() {
     *     return { my_view_proj: vmath.matrix4() };
     *   },
     *
     *   update(self) {
     *     // update the 'tint' constant
     *     material.set_constants(self.my_material, {
     *       tint: { value: vmath.vector4(1, 0, 0, 1) },
     *     });
     *     // change the type of the 'view_proj' constant to CONSTANT_TYPE_USER_MATRIX4 so the renderer can set our custom data
     *     material.set_constants(self.my_material, {
     *       view_proj: { value: self.my_view_proj, type: material.CONSTANT_TYPE_USER_MATRIX4 },
     *     });
     *   },
     * });
     * ```
     */
    function set_constants(path: Hash | string, constants: LuaMap<string | Hash, material.ConstantOptions> | Record<string, material.ConstantOptions>): void;
    /**
     * Sets texture samplers in a material, if the samplers exist. Use this function to change the settings of texture samplers.
     * To set actual textures that should be bound to the samplers, use the `material.set_textures` function instead.
     *
     * @param path - The path to the resource
     * @param samplers - Sampler updates keyed by sampler name. Partial updates are supported.
     * @example
     * ```ts
     * // Configures a sampler in a material specified as a resource property
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_material: resource.material() },
     *
     *   init(self) {
     *     material.set_samplers(self.my_material, {
     *       texture_sampler: { u_wrap: graphics.TEXTURE_WRAP_REPEAT, v_wrap: graphics.TEXTURE_WRAP_MIRRORED_REPEAT },
     *     });
     *   },
     * });
     * ```
     */
    function set_samplers(path: Hash | string, samplers: LuaMap<string | Hash, material.SamplerOptions> | Record<string, material.SamplerOptions>): void;
    /**
     * Sets textures in a material, if the samplers exist.
     *
     * @param path - The path to the resource
     * @param textures - A table keyed by sampler name with texture resources as values.
     * @example
     * ```ts
     * // Set a texture in a material from a resource
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registrations from this field, and only this field types them onto `self`.
     *   properties: { my_material: resource.material(), my_texture: resource.texture() },
     *
     *   init(self) {
     *     material.set_textures(self.my_material, {
     *       my_texture: self.my_texture,
     *     });
     *   },
     * });
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
     * // Configures a vertex attribute in a material specified as a resource property
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_material: resource.material() },
     *
     *   init(self) {
     *     material.set_vertex_attributes(self.my_material, {
     *       tint_attribute: { value: vmath.vector4(1, 0, 0, 1), semantic_type: graphics.SEMANTIC_TYPE_COLOR },
     *       weights: { value: vmath.vector4(0, 1, 0, 0), semantic_type: graphics.SEMANTIC_TYPE_NONE },
     *     });
     *   },
     * });
     * ```
     */
    function set_vertex_attributes(path: Hash | string, attributes: LuaMap<string | Hash, material.VertexAttributeOptions> | Record<string, material.VertexAttributeOptions> | material.NamedVertexAttributeOptions[]): void;
  }
}

export {};
