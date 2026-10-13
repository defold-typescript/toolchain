/** @noSelfInFile */
declare global {
  /**
   * Graphics functions and constants.
   */
  namespace graphics {
    /**
     * Graphics adapter information
     */
    interface adapter_info {
      /**
       * Adapter family name.
       */
      family: string;
      /**
       * Adapter API major version.
       */
      version_major: number;
      /**
       * Adapter API minor version.
       */
      version_minor: number;
      /**
       * Hardware and driver limits.
       */
      limits: graphics.adapter_limits;
      /**
       * Driver-reported extension names.
       */
      extensions: string[];
      /**
       * Supported optional context features.
       */
      features: graphics.CONTEXT_FEATURE[];
    }
    /**
     * Graphics context limits
     */
    interface adapter_limits {
      /**
       * Maximum 2D texture dimension in texels.
       */
      max_texture_size_2d: number;
      /**
       * Maximum 3D texture dimension in texels.
       */
      max_texture_size_3d: number;
      /**
       * Maximum cube-map face dimension in texels.
       */
      max_texture_size_cube: number;
      /**
       * Maximum number of array texture layers.
       */
      max_texture_array_layers: number;
      /**
       * Maximum framebuffer width in pixels.
       */
      max_framebuffer_width: number;
      /**
       * Maximum framebuffer height in pixels.
       */
      max_framebuffer_height: number;
      /**
       * Maximum number of simultaneous color attachments.
       */
      max_color_attachments: number;
      /**
       * Maximum number of texture samplers per shader stage.
       */
      max_samplers_per_stage: number;
      /**
       * Maximum number of sampled textures per shader stage.
       */
      max_textures_per_stage: number;
      /**
       * Maximum number of vertex attributes.
       */
      max_vertex_attributes: number;
      /**
       * Maximum number of vertex-buffer bindings.
       */
      max_vertex_buffers: number;
      /**
       * Maximum compute workgroup size on the X axis.
       */
      max_compute_workgroup_size_x: number;
      /**
       * Maximum compute workgroup size on the Y axis.
       */
      max_compute_workgroup_size_y: number;
      /**
       * Maximum compute workgroup size on the Z axis.
       */
      max_compute_workgroup_size_z: number;
      /**
       * Maximum invocations per compute workgroup.
       */
      max_compute_workgroup_invocations: number;
      /**
       * Maximum shared memory per compute workgroup in bytes.
       */
      max_compute_shared_memory_size: number;
      /**
       * Maximum bindable uniform-buffer range in bytes.
       */
      max_uniform_buffer_range: number;
      /**
       * Maximum bindable storage-buffer range in bytes.
       */
      max_storage_buffer_range: number;
    }
    type BufferType = typeof graphics.BUFFER_TYPE_COLOR0_BIT | typeof graphics.BUFFER_TYPE_COLOR1_BIT | typeof graphics.BUFFER_TYPE_COLOR2_BIT | typeof graphics.BUFFER_TYPE_COLOR3_BIT | typeof graphics.BUFFER_TYPE_DEPTH_BIT | typeof graphics.BUFFER_TYPE_STENCIL_BIT;
    type State = typeof graphics.STATE_DEPTH_TEST | typeof graphics.STATE_STENCIL_TEST | typeof graphics.STATE_BLEND | typeof graphics.STATE_ALPHA_TEST | typeof graphics.STATE_CULL_FACE | typeof graphics.STATE_POLYGON_OFFSET_FILL;
    type BLEND_EQUATION = typeof graphics.BLEND_EQUATION_ADD | typeof graphics.BLEND_EQUATION_MAX | typeof graphics.BLEND_EQUATION_MIN | typeof graphics.BLEND_EQUATION_REVERSE_SUBTRACT | typeof graphics.BLEND_EQUATION_SUBTRACT;
    type BLEND_FACTOR = typeof graphics.BLEND_FACTOR_CONSTANT_ALPHA | typeof graphics.BLEND_FACTOR_CONSTANT_COLOR | typeof graphics.BLEND_FACTOR_DST_ALPHA | typeof graphics.BLEND_FACTOR_DST_COLOR | typeof graphics.BLEND_FACTOR_ONE | typeof graphics.BLEND_FACTOR_ONE_MINUS_CONSTANT_ALPHA | typeof graphics.BLEND_FACTOR_ONE_MINUS_CONSTANT_COLOR | typeof graphics.BLEND_FACTOR_ONE_MINUS_DST_ALPHA | typeof graphics.BLEND_FACTOR_ONE_MINUS_DST_COLOR | typeof graphics.BLEND_FACTOR_ONE_MINUS_SRC_ALPHA | typeof graphics.BLEND_FACTOR_ONE_MINUS_SRC_COLOR | typeof graphics.BLEND_FACTOR_SRC_ALPHA | typeof graphics.BLEND_FACTOR_SRC_ALPHA_SATURATE | typeof graphics.BLEND_FACTOR_SRC_COLOR | typeof graphics.BLEND_FACTOR_ZERO;
    type BUFFER_TYPE = typeof graphics.BUFFER_TYPE_COLOR0_BIT | NonNullable<typeof graphics.BUFFER_TYPE_COLOR1_BIT> | NonNullable<typeof graphics.BUFFER_TYPE_COLOR2_BIT> | NonNullable<typeof graphics.BUFFER_TYPE_COLOR3_BIT> | typeof graphics.BUFFER_TYPE_DEPTH_BIT | typeof graphics.BUFFER_TYPE_STENCIL_BIT;
    type COMPARE_FUNC = typeof graphics.COMPARE_FUNC_ALWAYS | typeof graphics.COMPARE_FUNC_EQUAL | typeof graphics.COMPARE_FUNC_GEQUAL | typeof graphics.COMPARE_FUNC_GREATER | typeof graphics.COMPARE_FUNC_LEQUAL | typeof graphics.COMPARE_FUNC_LESS | typeof graphics.COMPARE_FUNC_NEVER | typeof graphics.COMPARE_FUNC_NOTEQUAL;
    type COMPRESSION_TYPE = typeof graphics.COMPRESSION_TYPE_BASIS_ETC1S | typeof graphics.COMPRESSION_TYPE_BASIS_UASTC | typeof graphics.COMPRESSION_TYPE_DEFAULT | typeof graphics.COMPRESSION_TYPE_WEBP | typeof graphics.COMPRESSION_TYPE_WEBP_LOSSY;
    type CONTEXT_FEATURE = typeof graphics.CONTEXT_FEATURE_3D_TEXTURES | typeof graphics.CONTEXT_FEATURE_ASTC_ARRAY_TEXTURES | typeof graphics.CONTEXT_FEATURE_BC_ARRAY_TEXTURES | typeof graphics.CONTEXT_FEATURE_BLEND_EQUATION_MIN_MAX | typeof graphics.CONTEXT_FEATURE_COMPUTE_SHADER | typeof graphics.CONTEXT_FEATURE_INSTANCING | typeof graphics.CONTEXT_FEATURE_MULTI_TARGET_RENDERING | typeof graphics.CONTEXT_FEATURE_STORAGE_BUFFER | typeof graphics.CONTEXT_FEATURE_TEXTURE_ARRAY | typeof graphics.CONTEXT_FEATURE_VSYNC;
    type COORDINATE_SPACE = typeof graphics.COORDINATE_SPACE_DEFAULT | typeof graphics.COORDINATE_SPACE_LOCAL | typeof graphics.COORDINATE_SPACE_WORLD;
    type DATA_TYPE = typeof graphics.DATA_TYPE_BYTE | typeof graphics.DATA_TYPE_FLOAT | typeof graphics.DATA_TYPE_INT | typeof graphics.DATA_TYPE_SHORT | typeof graphics.DATA_TYPE_UNSIGNED_BYTE | typeof graphics.DATA_TYPE_UNSIGNED_INT | typeof graphics.DATA_TYPE_UNSIGNED_SHORT;
    type FACE_TYPE = typeof graphics.FACE_TYPE_BACK | typeof graphics.FACE_TYPE_FRONT | typeof graphics.FACE_TYPE_FRONT_AND_BACK;
    type SEMANTIC_TYPE = typeof graphics.SEMANTIC_TYPE_BONE_INDICES | typeof graphics.SEMANTIC_TYPE_BONE_WEIGHTS | typeof graphics.SEMANTIC_TYPE_COLOR | typeof graphics.SEMANTIC_TYPE_MORPH_TARGET_WEIGHTS | typeof graphics.SEMANTIC_TYPE_NONE | typeof graphics.SEMANTIC_TYPE_NORMAL | typeof graphics.SEMANTIC_TYPE_NORMAL_MATRIX | typeof graphics.SEMANTIC_TYPE_PAGE_INDEX | typeof graphics.SEMANTIC_TYPE_POSITION | typeof graphics.SEMANTIC_TYPE_TANGENT | typeof graphics.SEMANTIC_TYPE_TEXCOORD | typeof graphics.SEMANTIC_TYPE_TEXTURE_TRANSFORM_2D | typeof graphics.SEMANTIC_TYPE_WORLD_MATRIX;
    type STATE = typeof graphics.STATE_ALPHA_TEST | typeof graphics.STATE_ALPHA_TEST_SUPPORTED | typeof graphics.STATE_BLEND | typeof graphics.STATE_CULL_FACE | typeof graphics.STATE_DEPTH_TEST | typeof graphics.STATE_POLYGON_OFFSET_FILL | typeof graphics.STATE_SCISSOR_TEST | typeof graphics.STATE_STENCIL_TEST;
    type STENCIL_OP = typeof graphics.STENCIL_OP_DECR | typeof graphics.STENCIL_OP_DECR_WRAP | typeof graphics.STENCIL_OP_INCR | typeof graphics.STENCIL_OP_INCR_WRAP | typeof graphics.STENCIL_OP_INVERT | typeof graphics.STENCIL_OP_KEEP | typeof graphics.STENCIL_OP_REPLACE | typeof graphics.STENCIL_OP_ZERO;
    type TEXTURE_FILTER = typeof graphics.TEXTURE_FILTER_DEFAULT | typeof graphics.TEXTURE_FILTER_LINEAR | typeof graphics.TEXTURE_FILTER_LINEAR_MIPMAP_LINEAR | typeof graphics.TEXTURE_FILTER_LINEAR_MIPMAP_NEAREST | typeof graphics.TEXTURE_FILTER_NEAREST | typeof graphics.TEXTURE_FILTER_NEAREST_MIPMAP_LINEAR | typeof graphics.TEXTURE_FILTER_NEAREST_MIPMAP_NEAREST;
    type TEXTURE_FORMAT = NonNullable<typeof graphics.TEXTURE_FORMAT_BGRA8U> | typeof graphics.TEXTURE_FORMAT_DEPTH | NonNullable<typeof graphics.TEXTURE_FORMAT_LUMINANCE> | NonNullable<typeof graphics.TEXTURE_FORMAT_LUMINANCE_ALPHA> | NonNullable<typeof graphics.TEXTURE_FORMAT_R16F> | NonNullable<typeof graphics.TEXTURE_FORMAT_R32F> | NonNullable<typeof graphics.TEXTURE_FORMAT_R32UI> | NonNullable<typeof graphics.TEXTURE_FORMAT_RG16F> | NonNullable<typeof graphics.TEXTURE_FORMAT_RG32F> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGB> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGB16F> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGB32F> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA16F> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA32F> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA32UI> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA_16BPP> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA_ASTC_4X4> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA_BC3> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA_BC7> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA_ETC2> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGB_16BPP> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGB_BC1> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGB_ETC1> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGB_PVRTC_2BPPV1> | NonNullable<typeof graphics.TEXTURE_FORMAT_RGB_PVRTC_4BPPV1> | NonNullable<typeof graphics.TEXTURE_FORMAT_RG_BC5> | NonNullable<typeof graphics.TEXTURE_FORMAT_RG_ETC2> | NonNullable<typeof graphics.TEXTURE_FORMAT_R_BC4> | NonNullable<typeof graphics.TEXTURE_FORMAT_R_ETC2> | typeof graphics.TEXTURE_FORMAT_STENCIL;
    type TEXTURE_TYPE = typeof graphics.TEXTURE_TYPE_2D | typeof graphics.TEXTURE_TYPE_2D_ARRAY | NonNullable<typeof graphics.TEXTURE_TYPE_3D> | typeof graphics.TEXTURE_TYPE_CUBE_MAP | typeof graphics.TEXTURE_TYPE_IMAGE_2D | NonNullable<typeof graphics.TEXTURE_TYPE_IMAGE_3D>;
    type TEXTURE_USAGE_FLAG = typeof graphics.TEXTURE_USAGE_FLAG_COLOR | typeof graphics.TEXTURE_USAGE_FLAG_INPUT | typeof graphics.TEXTURE_USAGE_FLAG_MEMORYLESS | typeof graphics.TEXTURE_USAGE_FLAG_SAMPLE | typeof graphics.TEXTURE_USAGE_FLAG_STORAGE;
    type TEXTURE_WRAP = typeof graphics.TEXTURE_WRAP_CLAMP_TO_BORDER | typeof graphics.TEXTURE_WRAP_CLAMP_TO_EDGE | typeof graphics.TEXTURE_WRAP_MIRRORED_REPEAT | typeof graphics.TEXTURE_WRAP_REPEAT;
    const BLEND_EQUATION_ADD: number & { readonly __brand: "graphics.BLEND_EQUATION_ADD" };
    const BLEND_EQUATION_MAX: number & { readonly __brand: "graphics.BLEND_EQUATION_MAX" };
    const BLEND_EQUATION_MIN: number & { readonly __brand: "graphics.BLEND_EQUATION_MIN" };
    const BLEND_EQUATION_REVERSE_SUBTRACT: number & { readonly __brand: "graphics.BLEND_EQUATION_REVERSE_SUBTRACT" };
    const BLEND_EQUATION_SUBTRACT: number & { readonly __brand: "graphics.BLEND_EQUATION_SUBTRACT" };
    /**
     * constant blend alpha for every component
     */
    const BLEND_FACTOR_CONSTANT_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_CONSTANT_ALPHA" };
    /**
     * constant blend color
     */
    const BLEND_FACTOR_CONSTANT_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_CONSTANT_COLOR" };
    /**
     * destination alpha for every component
     */
    const BLEND_FACTOR_DST_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_DST_ALPHA" };
    /**
     * destination color
     */
    const BLEND_FACTOR_DST_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_DST_COLOR" };
    /**
     * one for every component
     */
    const BLEND_FACTOR_ONE: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE" };
    /**
     * one minus the constant blend alpha for every component
     */
    const BLEND_FACTOR_ONE_MINUS_CONSTANT_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_CONSTANT_ALPHA" };
    /**
     * one minus the constant blend color
     */
    const BLEND_FACTOR_ONE_MINUS_CONSTANT_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_CONSTANT_COLOR" };
    /**
     * one minus the destination alpha for every component
     */
    const BLEND_FACTOR_ONE_MINUS_DST_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_DST_ALPHA" };
    /**
     * one minus the destination color
     */
    const BLEND_FACTOR_ONE_MINUS_DST_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_DST_COLOR" };
    /**
     * one minus the source alpha for every component
     */
    const BLEND_FACTOR_ONE_MINUS_SRC_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_SRC_ALPHA" };
    /**
     * one minus the source color
     */
    const BLEND_FACTOR_ONE_MINUS_SRC_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_ONE_MINUS_SRC_COLOR" };
    /**
     * source alpha for every component
     */
    const BLEND_FACTOR_SRC_ALPHA: number & { readonly __brand: "graphics.BLEND_FACTOR_SRC_ALPHA" };
    /**
     * minimum of source alpha and one minus destination alpha for color, and one for alpha
     */
    const BLEND_FACTOR_SRC_ALPHA_SATURATE: number & { readonly __brand: "graphics.BLEND_FACTOR_SRC_ALPHA_SATURATE" };
    /**
     * source color
     */
    const BLEND_FACTOR_SRC_COLOR: number & { readonly __brand: "graphics.BLEND_FACTOR_SRC_COLOR" };
    /**
     * zero for every component
     */
    const BLEND_FACTOR_ZERO: number & { readonly __brand: "graphics.BLEND_FACTOR_ZERO" };
    /**
     * first color attachment
     */
    const BUFFER_TYPE_COLOR0_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR0_BIT" };
    /**
     * second color attachment; may be nil if multiple render targets are unsupported
     */
    const BUFFER_TYPE_COLOR1_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR1_BIT" } | undefined;
    /**
     * third color attachment; may be nil if multiple render targets are unsupported
     */
    const BUFFER_TYPE_COLOR2_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR2_BIT" } | undefined;
    /**
     * fourth color attachment; may be nil if multiple render targets are unsupported
     */
    const BUFFER_TYPE_COLOR3_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR3_BIT" } | undefined;
    /**
     * depth attachment
     */
    const BUFFER_TYPE_DEPTH_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_DEPTH_BIT" };
    /**
     * stencil attachment
     */
    const BUFFER_TYPE_STENCIL_BIT: number & { readonly __brand: "graphics.BUFFER_TYPE_STENCIL_BIT" };
    /**
     * always passes
     */
    const COMPARE_FUNC_ALWAYS: number & { readonly __brand: "graphics.COMPARE_FUNC_ALWAYS" };
    /**
     * passes when the values are equal
     */
    const COMPARE_FUNC_EQUAL: number & { readonly __brand: "graphics.COMPARE_FUNC_EQUAL" };
    /**
     * passes when the incoming value is greater than or equal to the stored value
     */
    const COMPARE_FUNC_GEQUAL: number & { readonly __brand: "graphics.COMPARE_FUNC_GEQUAL" };
    /**
     * passes when the incoming value is greater than the stored value
     */
    const COMPARE_FUNC_GREATER: number & { readonly __brand: "graphics.COMPARE_FUNC_GREATER" };
    /**
     * passes when the incoming value is less than or equal to the stored value
     */
    const COMPARE_FUNC_LEQUAL: number & { readonly __brand: "graphics.COMPARE_FUNC_LEQUAL" };
    /**
     * passes when the incoming value is less than the stored value
     */
    const COMPARE_FUNC_LESS: number & { readonly __brand: "graphics.COMPARE_FUNC_LESS" };
    /**
     * never passes
     */
    const COMPARE_FUNC_NEVER: number & { readonly __brand: "graphics.COMPARE_FUNC_NEVER" };
    /**
     * passes when the values are not equal
     */
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
     * Context feature flag indicating support for ASTC compressed 2D array textures. Some WebGL/GLES drivers fail array texture ASTC uploads while 2D ASTC works.
     */
    const CONTEXT_FEATURE_ASTC_ARRAY_TEXTURES: number & { readonly __brand: "graphics.CONTEXT_FEATURE_ASTC_ARRAY_TEXTURES" };
    /**
     * Context feature flag indicating support for BC (S3TC/RGTC/BPTC) compressed 2D array and 3D textures. WebGL2 forbids these compressed families on array/3D targets while allowing them on 2D.
     */
    const CONTEXT_FEATURE_BC_ARRAY_TEXTURES: number & { readonly __brand: "graphics.CONTEXT_FEATURE_BC_ARRAY_TEXTURES" };
    /**
     * Context feature flag indicating support for min/max blend equations. Requires GLES3+ or EXT_blend_minmax.
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
    /**
     * Default vertex attribute coordinate space.
     */
    const COORDINATE_SPACE_DEFAULT: number & { readonly __brand: "graphics.COORDINATE_SPACE_DEFAULT" };
    /**
     * Local vertex attribute coordinate space.
     */
    const COORDINATE_SPACE_LOCAL: number & { readonly __brand: "graphics.COORDINATE_SPACE_LOCAL" };
    /**
     * World vertex attribute coordinate space.
     */
    const COORDINATE_SPACE_WORLD: number & { readonly __brand: "graphics.COORDINATE_SPACE_WORLD" };
    /**
     * Signed 8-bit vertex attribute data.
     */
    const DATA_TYPE_BYTE: number & { readonly __brand: "graphics.DATA_TYPE_BYTE" };
    /**
     * 32-bit floating-point vertex attribute data.
     */
    const DATA_TYPE_FLOAT: number & { readonly __brand: "graphics.DATA_TYPE_FLOAT" };
    /**
     * Signed 32-bit vertex attribute data.
     */
    const DATA_TYPE_INT: number & { readonly __brand: "graphics.DATA_TYPE_INT" };
    /**
     * Signed 16-bit vertex attribute data.
     */
    const DATA_TYPE_SHORT: number & { readonly __brand: "graphics.DATA_TYPE_SHORT" };
    /**
     * Unsigned 8-bit vertex attribute data.
     */
    const DATA_TYPE_UNSIGNED_BYTE: number & { readonly __brand: "graphics.DATA_TYPE_UNSIGNED_BYTE" };
    /**
     * Unsigned 32-bit vertex attribute data.
     */
    const DATA_TYPE_UNSIGNED_INT: number & { readonly __brand: "graphics.DATA_TYPE_UNSIGNED_INT" };
    /**
     * Unsigned 16-bit vertex attribute data.
     */
    const DATA_TYPE_UNSIGNED_SHORT: number & { readonly __brand: "graphics.DATA_TYPE_UNSIGNED_SHORT" };
    /**
     * back-facing polygons
     */
    const FACE_TYPE_BACK: number & { readonly __brand: "graphics.FACE_TYPE_BACK" };
    /**
     * front-facing polygons
     */
    const FACE_TYPE_FRONT: number & { readonly __brand: "graphics.FACE_TYPE_FRONT" };
    /**
     * both front- and back-facing polygons
     */
    const FACE_TYPE_FRONT_AND_BACK: number & { readonly __brand: "graphics.FACE_TYPE_FRONT_AND_BACK" };
    /**
     * Bone-index vertex attribute.
     */
    const SEMANTIC_TYPE_BONE_INDICES: number & { readonly __brand: "graphics.SEMANTIC_TYPE_BONE_INDICES" };
    /**
     * Bone-weight vertex attribute.
     */
    const SEMANTIC_TYPE_BONE_WEIGHTS: number & { readonly __brand: "graphics.SEMANTIC_TYPE_BONE_WEIGHTS" };
    /**
     * Color vertex attribute.
     */
    const SEMANTIC_TYPE_COLOR: number & { readonly __brand: "graphics.SEMANTIC_TYPE_COLOR" };
    /**
     * Morph-target-weight vertex attribute.
     */
    const SEMANTIC_TYPE_MORPH_TARGET_WEIGHTS: number & { readonly __brand: "graphics.SEMANTIC_TYPE_MORPH_TARGET_WEIGHTS" };
    /**
     * Vertex attribute without a predefined semantic.
     */
    const SEMANTIC_TYPE_NONE: number & { readonly __brand: "graphics.SEMANTIC_TYPE_NONE" };
    /**
     * Normal vertex attribute.
     */
    const SEMANTIC_TYPE_NORMAL: number & { readonly __brand: "graphics.SEMANTIC_TYPE_NORMAL" };
    /**
     * Normal-matrix vertex attribute.
     */
    const SEMANTIC_TYPE_NORMAL_MATRIX: number & { readonly __brand: "graphics.SEMANTIC_TYPE_NORMAL_MATRIX" };
    /**
     * Texture page-index vertex attribute.
     */
    const SEMANTIC_TYPE_PAGE_INDEX: number & { readonly __brand: "graphics.SEMANTIC_TYPE_PAGE_INDEX" };
    /**
     * Position vertex attribute.
     */
    const SEMANTIC_TYPE_POSITION: number & { readonly __brand: "graphics.SEMANTIC_TYPE_POSITION" };
    /**
     * Tangent vertex attribute.
     */
    const SEMANTIC_TYPE_TANGENT: number & { readonly __brand: "graphics.SEMANTIC_TYPE_TANGENT" };
    /**
     * Texture-coordinate vertex attribute.
     */
    const SEMANTIC_TYPE_TEXCOORD: number & { readonly __brand: "graphics.SEMANTIC_TYPE_TEXCOORD" };
    /**
     * 2D texture-transform vertex attribute.
     */
    const SEMANTIC_TYPE_TEXTURE_TRANSFORM_2D: number & { readonly __brand: "graphics.SEMANTIC_TYPE_TEXTURE_TRANSFORM_2D" };
    /**
     * World-matrix vertex attribute.
     */
    const SEMANTIC_TYPE_WORLD_MATRIX: number & { readonly __brand: "graphics.SEMANTIC_TYPE_WORLD_MATRIX" };
    const STATE_ALPHA_TEST: number & { readonly __brand: "graphics.STATE_ALPHA_TEST" };
    const STATE_ALPHA_TEST_SUPPORTED: number & { readonly __brand: "graphics.STATE_ALPHA_TEST_SUPPORTED" };
    const STATE_BLEND: number & { readonly __brand: "graphics.STATE_BLEND" };
    const STATE_CULL_FACE: number & { readonly __brand: "graphics.STATE_CULL_FACE" };
    const STATE_DEPTH_TEST: number & { readonly __brand: "graphics.STATE_DEPTH_TEST" };
    const STATE_POLYGON_OFFSET_FILL: number & { readonly __brand: "graphics.STATE_POLYGON_OFFSET_FILL" };
    const STATE_SCISSOR_TEST: number & { readonly __brand: "graphics.STATE_SCISSOR_TEST" };
    const STATE_STENCIL_TEST: number & { readonly __brand: "graphics.STATE_STENCIL_TEST" };
    /**
     * decrement and clamp at zero
     */
    const STENCIL_OP_DECR: number & { readonly __brand: "graphics.STENCIL_OP_DECR" };
    /**
     * decrement and wrap zero to the maximum unsigned value
     */
    const STENCIL_OP_DECR_WRAP: number & { readonly __brand: "graphics.STENCIL_OP_DECR_WRAP" };
    /**
     * increment and clamp at the maximum unsigned value
     */
    const STENCIL_OP_INCR: number & { readonly __brand: "graphics.STENCIL_OP_INCR" };
    /**
     * increment and wrap the maximum unsigned value to zero
     */
    const STENCIL_OP_INCR_WRAP: number & { readonly __brand: "graphics.STENCIL_OP_INCR_WRAP" };
    /**
     * bitwise invert
     */
    const STENCIL_OP_INVERT: number & { readonly __brand: "graphics.STENCIL_OP_INVERT" };
    /**
     * keep the current value
     */
    const STENCIL_OP_KEEP: number & { readonly __brand: "graphics.STENCIL_OP_KEEP" };
    /**
     * replace with the reference value from render.set_stencil_func
     */
    const STENCIL_OP_REPLACE: number & { readonly __brand: "graphics.STENCIL_OP_REPLACE" };
    /**
     * set to zero
     */
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
    const TEXTURE_FORMAT_BGRA8U: number & { readonly __brand: "graphics.TEXTURE_FORMAT_BGRA8U" } | undefined;
    const TEXTURE_FORMAT_DEPTH: number & { readonly __brand: "graphics.TEXTURE_FORMAT_DEPTH" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_LUMINANCE: number & { readonly __brand: "graphics.TEXTURE_FORMAT_LUMINANCE" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_LUMINANCE_ALPHA: number & { readonly __brand: "graphics.TEXTURE_FORMAT_LUMINANCE_ALPHA" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_R_BC4: number & { readonly __brand: "graphics.TEXTURE_FORMAT_R_BC4" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_R_ETC2: number & { readonly __brand: "graphics.TEXTURE_FORMAT_R_ETC2" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_R16F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_R16F" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_R32F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_R32F" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_R32UI: number & { readonly __brand: "graphics.TEXTURE_FORMAT_R32UI" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RG_BC5: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RG_BC5" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RG_ETC2: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RG_ETC2" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RG16F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RG16F" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RG32F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RG32F" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB_16BPP: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB_16BPP" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB_BC1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB_BC1" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB_ETC1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB_ETC1" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB_PVRTC_2BPPV1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB_PVRTC_2BPPV1" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB_PVRTC_4BPPV1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB_PVRTC_4BPPV1" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB16F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB16F" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGB32F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGB32F" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_16BPP: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_16BPP" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_ASTC_4X4: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_ASTC_4X4" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_BC3: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_BC3" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_BC7: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_BC7" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_ETC2: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_ETC2" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA16F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA16F" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA32F: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA32F" } | undefined;
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_FORMAT_RGBA32UI: number & { readonly __brand: "graphics.TEXTURE_FORMAT_RGBA32UI" } | undefined;
    const TEXTURE_FORMAT_STENCIL: number & { readonly __brand: "graphics.TEXTURE_FORMAT_STENCIL" };
    const TEXTURE_TYPE_2D: number & { readonly __brand: "graphics.TEXTURE_TYPE_2D" };
    const TEXTURE_TYPE_2D_ARRAY: number & { readonly __brand: "graphics.TEXTURE_TYPE_2D_ARRAY" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_TYPE_3D: number & { readonly __brand: "graphics.TEXTURE_TYPE_3D" } | undefined;
    const TEXTURE_TYPE_CUBE_MAP: number & { readonly __brand: "graphics.TEXTURE_TYPE_CUBE_MAP" };
    const TEXTURE_TYPE_IMAGE_2D: number & { readonly __brand: "graphics.TEXTURE_TYPE_IMAGE_2D" };
    /**
     * May be nil if the graphics driver doesn't support it
     */
    const TEXTURE_TYPE_IMAGE_3D: number & { readonly __brand: "graphics.TEXTURE_TYPE_IMAGE_3D" } | undefined;
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
     * @returns information about the active graphics adapter and context
     */
    function get_adapter_info(): graphics.adapter_info;
    /**
     * get the list of graphics adapters that have been registered with the engine
     *
     * @returns array of adapter family name strings (e.g. "opengl", "vulkan", "webgpu")
     */
    function get_engine_adapters(): string[];
  }
}

export {};
