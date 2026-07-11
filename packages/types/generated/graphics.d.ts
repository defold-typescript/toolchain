/** @noSelfInFile */
declare global {
  /**
   * Graphics functions and constants.
   */
  namespace graphics {
    const BLEND_EQUATION_ADD: number & { readonly __brand: "graphics.BLEND_EQUATION_ADD" };
    const BLEND_EQUATION_MAX: number & { readonly __brand: "graphics.BLEND_EQUATION_MAX" };
    const BLEND_EQUATION_MIN: number & { readonly __brand: "graphics.BLEND_EQUATION_MIN" };
    const BLEND_EQUATION_REVERSE_SUBTRACT: number & { readonly __brand: "graphics.BLEND_EQUATION_REVERSE_SUBTRACT" };
    const BLEND_EQUATION_SUBTRACT: number & { readonly __brand: "graphics.BLEND_EQUATION_SUBTRACT" };
    const BLEND_FACTOR_CONSTANT_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_CONSTANT_ALPHA" };
    const BLEND_FACTOR_CONSTANT_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_CONSTANT_COLOR" };
    const BLEND_FACTOR_DST_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_DST_ALPHA" };
    const BLEND_FACTOR_DST_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_DST_COLOR" };
    const BLEND_FACTOR_ONE: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE" };
    const BLEND_FACTOR_ONE_MINUS_CONSTANT_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_CONSTANT_ALPHA" };
    const BLEND_FACTOR_ONE_MINUS_CONSTANT_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_CONSTANT_COLOR" };
    const BLEND_FACTOR_ONE_MINUS_DST_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_DST_ALPHA" };
    const BLEND_FACTOR_ONE_MINUS_DST_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_DST_COLOR" };
    const BLEND_FACTOR_ONE_MINUS_SRC_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_SRC_ALPHA" };
    const BLEND_FACTOR_ONE_MINUS_SRC_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_SRC_COLOR" };
    const BLEND_FACTOR_SRC_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_SRC_ALPHA" };
    const BLEND_FACTOR_SRC_ALPHA_SATURATE: number & { readonly __brand: "graphics.BLEND_FACTOR_SRC_ALPHA_SATURATE" };
    const BLEND_FACTOR_SRC_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_SRC_COLOR" };
    const BLEND_FACTOR_ZERO: number & { readonly __brand: "graphics.BLEND_FACTOR_ZERO" };
    const BUFFER_TYPE_COLOR0_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR0_BIT" };
    /**
     * May be nil if multitarget rendering isn't supported
     */
    const BUFFER_TYPE_COLOR1_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR1_BIT" };
    /**
     * May be nil if multitarget rendering isn't supported
     */
    const BUFFER_TYPE_COLOR2_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR2_BIT" };
    /**
     * May be nil if multitarget rendering isn't supported
     */
    const BUFFER_TYPE_COLOR3_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR3_BIT" };
    const BUFFER_TYPE_DEPTH_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_DEPTH_BIT" };
    const BUFFER_TYPE_STENCIL_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_STENCIL_BIT" };
    const COMPARE_FUNC_ALWAYS: number & { readonly __brand: "graphics.COMPARE_FUNC_ALWAYS" };
    const COMPARE_FUNC_EQUAL: number & { readonly __brand: "graphics.COMPARE_FUNC_EQUAL" };
    const COMPARE_FUNC_GEQUAL: number & { readonly __brand: "graphics.COMPARE_FUNC_GEQUAL" };
    const COMPARE_FUNC_GREATER: number & { readonly __brand: "graphics.COMPARE_FUNC_GREATER" };
    const COMPARE_FUNC_LEQUAL: number & { readonly __brand: "graphics.COMPARE_FUNC_LEQUAL" };
    const COMPARE_FUNC_LESS: number & { readonly __brand: "graphics.COMPARE_FUNC_LESS" };
    const COMPARE_FUNC_NEVER: number & { readonly __brand: "graphics.COMPARE_FUNC_NEVER" };
    const COMPARE_FUNC_NOTEQUAL: number & { readonly __brand: "graphics.COMPARE_FUNC_NOTEQUAL" };
    const COMPRESSION_TYPE_BASIS_ETC1S: number & { readonly __brand: "graphics.COMPRESSION_TYPE_BASIS_ETC1S" };
    const COMPRESSION_TYPE_BASIS_UASTC: number & { readonly __brand: "graphics.COMPRESSION_TYPE_BASIS_UASTC" };
    const COMPRESSION_TYPE_DEFAULT: number & { readonly __brand: "graphics.COMPRESSION_TYPE_DEFAULT" };
    const COMPRESSION_TYPE_WEBP: number & { readonly __brand: "graphics.COMPRESSION_TYPE_WEBP" };
    const COMPRESSION_TYPE_WEBP_LOSSY: number & { readonly __brand: "graphics.COMPRESSION_TYPE_WEBP_LOSSY" };
    /**
     * Context feature flag indicating support for 3D (volume) textures.
     */
    const CONTEXT_FEATURE_3D_TEXTURES: number & { readonly __brand: "graphics.CONTEXT_FEATURE_3D_TEXTURES" };
    /**
     * Context feature flag indicating support for ASTC compressed 2D array textures.
     * Some WebGL/GLES drivers fail array texture ASTC uploads while 2D ASTC works.
     */
    const CONTEXT_FEATURE_ASTC_ARRAY_TEXTURES: number & { readonly __brand: "graphics.CONTEXT_FEATURE_ASTC_ARRAY_TEXTURES" };
    /**
     * Context feature flag indicating support for min/max blend equations.
     * Requires GLES3+ or EXT_blend_minmax.
     */
    const CONTEXT_FEATURE_BLEND_EQUATION_MIN_MAX: number & { readonly __brand: "graphics.CONTEXT_FEATURE_BLEND_EQUATION_MIN_MAX" };
    /**
     * Context feature flag indicating support for compute shaders.
     */
    const CONTEXT_FEATURE_COMPUTE_SHADER: number & { readonly __brand: "graphics.CONTEXT_FEATURE_COMPUTE_SHADER" };
    /**
     * Context feature flag indicating support for hardware instancing.
     */
    const CONTEXT_FEATURE_INSTANCING: number & { readonly __brand: "graphics.CONTEXT_FEATURE_INSTANCING" };
    /**
     * Context feature flag indicating support for rendering to multiple color targets simultaneously.
     */
    const CONTEXT_FEATURE_MULTI_TARGET_RENDERING: number & { readonly __brand: "graphics.CONTEXT_FEATURE_MULTI_TARGET_RENDERING" };
    /**
     * Context feature flag indicating support for storage buffers.
     */
    const CONTEXT_FEATURE_STORAGE_BUFFER: number & { readonly __brand: "graphics.CONTEXT_FEATURE_STORAGE_BUFFER" };
    /**
     * Context feature flag indicating support for texture arrays.
     */
    const CONTEXT_FEATURE_TEXTURE_ARRAY: number & { readonly __brand: "graphics.CONTEXT_FEATURE_TEXTURE_ARRAY" };
    /**
     * Context feature flag indicating support for vertical sync (vsync).
     */
    const CONTEXT_FEATURE_VSYNC: number & { readonly __brand: "graphics.CONTEXT_FEATURE_VSYNC" };
    const FACE_TYPE_BACK: number & { readonly __brand: "graphics.FACE_TYPE_BACK" };
    const FACE_TYPE_FRONT: number & { readonly __brand: "graphics.FACE_TYPE_FRONT" };
    const FACE_TYPE_FRONT_AND_BACK: number & { readonly __brand: "graphics.FACE_TYPE_FRONT_AND_BACK" };
    const STATE_ALPHA_TEST: number & { readonly __brand: "graphics.STATE_ALPHA_TEST" };
    const STATE_ALPHA_TEST_SUPPORTED: number & { readonly __brand: "graphics.STATE_ALPHA_TEST_SUPPORTED" };
    const STATE_BLEND: number & { readonly __brand: "graphics.STATE_BLEND" };
    const STATE_CULL_FACE: number & { readonly __brand: "graphics.STATE_CULL_FACE" };
    const STATE_DEPTH_TEST: number & { readonly __brand: "graphics.STATE_DEPTH_TEST" };
    const STATE_POLYGON_OFFSET_FILL: number & { readonly __brand: "graphics.STATE_POLYGON_OFFSET_FILL" };
    const STATE_SCISSOR_TEST: number & { readonly __brand: "graphics.STATE_SCISSOR_TEST" };
    const STATE_STENCIL_TEST: number & { readonly __brand: "graphics.STATE_STENCIL_TEST" };
    const STENCIL_OP_DECR: number & { readonly __brand: "graphics.STENCIL_OP_DECR" };
    const STENCIL_OP_DECR_WRAP: number & { readonly __brand: "graphics.STENCIL_OP_DECR_WRAP" };
    const STENCIL_OP_INCR: number & { readonly __brand: "graphics.STENCIL_OP_INCR" };
    const STENCIL_OP_INCR_WRAP: number & { readonly __brand: "graphics.STENCIL_OP_INCR_WRAP" };
    const STENCIL_OP_INVERT: number & { readonly __brand: "graphics.STENCIL_OP_INVERT" };
    const STENCIL_OP_KEEP: number & { readonly __brand: "graphics.STENCIL_OP_KEEP" };
    const STENCIL_OP_REPLACE: number & { readonly __brand: "graphics.STENCIL_OP_REPLACE" };
    const STENCIL_OP_ZERO: number & { readonly __brand: "graphics.STENCIL_OP_ZERO" };
    const TEXTURE_FILTER_DEFAULT: number & { readonly __brand: "graphics.TEXTURE_FILTER_DEFAULT" };
    const TEXTURE_FILTER_LINEAR: number & { readonly __brand: "graphics.TEXTURE_FILTER_LINEAR" };
    const TEXTURE_FILTER_LINEAR_MIPMAP_LINEAR: number & { readonly __brand: "graphics.TEXTURE_FILTER_LINEAR_MIPMAP_LINEAR" };
    const TEXTURE_FILTER_LINEAR_MIPMAP_NEAREST: number & { readonly __brand: "graphics.TEXTURE_FILTER_LINEAR_MIPMAP_NEAREST" };
    const TEXTURE_FILTER_NEAREST: number & { readonly __brand: "graphics.TEXTURE_FILTER_NEAREST" };
    const TEXTURE_FILTER_NEAREST_MIPMAP_LINEAR: number & { readonly __brand: "graphics.TEXTURE_FILTER_NEAREST_MIPMAP_LINEAR" };
    const TEXTURE_FILTER_NEAREST_MIPMAP_NEAREST: number & { readonly __brand: "graphics.TEXTURE_FILTER_NEAREST_MIPMAP_NEAREST" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_BGRA8U: number & { readonly __brand: "graphics.TEXTURE_FORMAT_BGRA8U" };
    const TEXTURE_FORMAT_DEPTH: number & { readonly __brand: "graphics.TEXTURE_FORMAT_DEPTH" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_LUMINANCE: number & { readonly __brand: "graphics.TEXTURE_FORMAT_LUMINANCE" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_LUMINANCE_ALPHA: number & { readonly __brand: "graphics.TEXTURE_FORMAT_LUMINANCE_ALPHA" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_R_BC4: number & { readonly __brand: "graphics.TEXTURE_FORMAT_R_BC4" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_R_ETC2: number & { readonly __brand: "graphics.TEXTURE_FORMAT_R_ETC2" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_R16F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_R16F" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_R32F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_R32F" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_R32UI: number & { readonly __brand: "graphics.TEXTURE_FORMAT_R32UI" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RG_BC5: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RG_BC5" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RG_ETC2: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RG_ETC2" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RG16F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RG16F" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RG32F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RG32F" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB_16BPP: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB_16BPP" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB_BC1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB_BC1" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB_ETC1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB_ETC1" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB_PVRTC_2BPPV1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB_PVRTC_2BPPV1" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB_PVRTC_4BPPV1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB_PVRTC_4BPPV1" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB16F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB16F" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB32F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB32F" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_16BPP: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_16BPP" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_ASTC_4X4: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_ASTC_4X4" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_BC3: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_BC3" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_BC7: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_BC7" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_ETC2: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_ETC2" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA16F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA16F" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA32F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA32F" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA32UI: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA32UI" };
    const TEXTURE_FORMAT_STENCIL: number & { readonly __brand: "graphics.TEXTURE_FORMAT_STENCIL" };
    const TEXTURE_TYPE_2D: number & { readonly __brand: "graphics.TEXTURE_TYPE_2D" };
    const TEXTURE_TYPE_2D_ARRAY: number & { readonly __brand: "graphics.TEXTURE_TYPE_2D_ARRAY" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_TYPE_3D: number & { readonly __brand: "graphics.TEXTURE_TYPE_3D" };
    const TEXTURE_TYPE_CUBE_MAP: number & { readonly __brand: "graphics.TEXTURE_TYPE_CUBE_MAP" };
    const TEXTURE_TYPE_IMAGE_2D: number & { readonly __brand: "graphics.TEXTURE_TYPE_IMAGE_2D" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_TYPE_IMAGE_3D: number & { readonly __brand: "graphics.TEXTURE_TYPE_IMAGE_3D" };
    const TEXTURE_USAGE_FLAG_COLOR: number & { readonly __brand: "graphics.TEXTURE_USAGE_FLAG_COLOR" };
    const TEXTURE_USAGE_FLAG_INPUT: number & { readonly __brand: "graphics.TEXTURE_USAGE_FLAG_INPUT" };
    const TEXTURE_USAGE_FLAG_MEMORYLESS: number & { readonly __brand: "graphics.TEXTURE_USAGE_FLAG_MEMORYLESS" };
    const TEXTURE_USAGE_FLAG_SAMPLE: number & { readonly __brand: "graphics.TEXTURE_USAGE_FLAG_SAMPLE" };
    const TEXTURE_USAGE_FLAG_STORAGE: number & { readonly __brand: "graphics.TEXTURE_USAGE_FLAG_STORAGE" };
    const TEXTURE_WRAP_CLAMP_TO_BORDER: number & { readonly __brand: "graphics.TEXTURE_WRAP_CLAMP_TO_BORDER" };
    const TEXTURE_WRAP_CLAMP_TO_EDGE: number & { readonly __brand: "graphics.TEXTURE_WRAP_CLAMP_TO_EDGE" };
    const TEXTURE_WRAP_MIRRORED_REPEAT: number & { readonly __brand: "graphics.TEXTURE_WRAP_MIRRORED_REPEAT" };
    const TEXTURE_WRAP_REPEAT: number & { readonly __brand: "graphics.TEXTURE_WRAP_REPEAT" };
    /**
     * Returns a table describing the active graphics context: the adapter family,
     * its hardware limits, the list of driver-reported extensions, and the set of
     * optional context features supported by the backend.
     *
     * @returns table with the following fields:
     * `family` string adapter family name (e.g. "opengl", "vulkan")
     * `version_major` number adapter API major version (e.g. 1 for Vulkan 1.4)
     * `version_minor` number adapter API minor version (e.g. 4 for Vulkan 1.4)
     * `limits` table hardware/driver limits:
     *
     * ``max_texture_size_2d` [type:number] max 2D texture dimension in texels
     * `max_texture_size_3d` [type:number] max 3D (volume) texture dimension in texels
     * `max_texture_size_cube` [type:number] max cube map face dimension in texels
     * `max_texture_array_layers` [type:number] max layers in an array texture
     * `max_framebuffer_width` [type:number] max framebuffer width in pixels
     * `max_framebuffer_height` [type:number] max framebuffer height in pixels
     * `max_color_attachments` [type:number] max simultaneous color attachments
     * `max_samplers_per_stage` [type:number] max texture samplers per shader stage
     * `max_textures_per_stage` [type:number] max sampled textures per shader stage
     * `max_vertex_attributes` [type:number] max vertex attributes
     * `max_vertex_buffers` [type:number] max vertex buffer bindings
     * `max_compute_workgroup_size_x` [type:number] max compute workgroup size (X)
     * `max_compute_workgroup_size_y` [type:number] max compute workgroup size (Y)
     * `max_compute_workgroup_size_z` [type:number] max compute workgroup size (Z)
     * `max_compute_workgroup_invocations` [type:number] max invocations per compute workgroup
     * `max_compute_shared_memory_size` [type:number] max shared memory per compute workgroup (bytes)
     * `max_uniform_buffer_range` [type:number] max bindable uniform buffer range (bytes)
     * `max_storage_buffer_range` [type:number] max bindable storage buffer range (bytes)
     * `
     *
     * `extensions` table array of driver-reported extension name strings
     * `features` table array of supported context feature ids:
     *
     * ``graphics.CONTEXT_FEATURE_MULTI_TARGET_RENDERING` multi-target rendering
     * `graphics.CONTEXT_FEATURE_TEXTURE_ARRAY` texture arrays
     * `graphics.CONTEXT_FEATURE_COMPUTE_SHADER` compute shaders
     * `graphics.CONTEXT_FEATURE_STORAGE_BUFFER` storage buffers
     * `graphics.CONTEXT_FEATURE_VSYNC` vertical sync
     * `graphics.CONTEXT_FEATURE_INSTANCING` hardware instancing
     * `graphics.CONTEXT_FEATURE_3D_TEXTURES` 3D (volume) textures
     * `graphics.CONTEXT_FEATURE_ASTC_ARRAY_TEXTURES` ASTC compressed 2D array textures
     * `graphics.CONTEXT_FEATURE_BLEND_EQUATION_MIN_MAX` min/max blend equations
     * `
     */
    function get_adapter_info(): Record<string | number, unknown>;
    /**
     * get the list of graphics adapters that have been registered with the engine
     *
     * @returns array of adapter family name strings (e.g. "opengl", "vulkan", "webgpu")
     */
    function get_engine_adapters(): Record<string | number, unknown>;
  }
}

export {};
