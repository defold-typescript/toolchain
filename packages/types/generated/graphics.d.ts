/** @noSelfInFile */
declare global {
  namespace graphics {
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
  }
}

export {};
