--[[
Generated using the Defold build pipeline

./scripts/build.py build_docs
]]

---@meta
---@diagnostic disable: lowercase-global
---@diagnostic disable: missing-return
---@diagnostic disable: args-after-dots

---@class defold_api.graphics
---Graphics functions and constants.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_EQUATION)
---@field BLEND_EQUATION_ADD graphics.BLEND_EQUATION
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_EQUATION)
---@field BLEND_EQUATION_MAX graphics.BLEND_EQUATION
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_EQUATION)
---@field BLEND_EQUATION_MIN graphics.BLEND_EQUATION
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_EQUATION)
---@field BLEND_EQUATION_REVERSE_SUBTRACT graphics.BLEND_EQUATION
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_EQUATION)
---@field BLEND_EQUATION_SUBTRACT graphics.BLEND_EQUATION
---constant blend alpha for every component
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_CONSTANT_ALPHA graphics.BLEND_FACTOR
---constant blend color
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_CONSTANT_COLOR graphics.BLEND_FACTOR
---destination alpha for every component
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_DST_ALPHA graphics.BLEND_FACTOR
---destination color
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_DST_COLOR graphics.BLEND_FACTOR
---one for every component
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_ONE graphics.BLEND_FACTOR
---one minus the constant blend alpha for every component
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_ONE_MINUS_CONSTANT_ALPHA graphics.BLEND_FACTOR
---one minus the constant blend color
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_ONE_MINUS_CONSTANT_COLOR graphics.BLEND_FACTOR
---one minus the destination alpha for every component
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_ONE_MINUS_DST_ALPHA graphics.BLEND_FACTOR
---one minus the destination color
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_ONE_MINUS_DST_COLOR graphics.BLEND_FACTOR
---one minus the source alpha for every component
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_ONE_MINUS_SRC_ALPHA graphics.BLEND_FACTOR
---one minus the source color
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_ONE_MINUS_SRC_COLOR graphics.BLEND_FACTOR
---source alpha for every component
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_SRC_ALPHA graphics.BLEND_FACTOR
---minimum of source alpha and one minus destination alpha for color, and one for alpha
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_SRC_ALPHA_SATURATE graphics.BLEND_FACTOR
---source color
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_SRC_COLOR graphics.BLEND_FACTOR
---zero for every component
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@field BLEND_FACTOR_ZERO graphics.BLEND_FACTOR
---first color attachment
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BUFFER_TYPE)
---@field BUFFER_TYPE_COLOR0_BIT graphics.BUFFER_TYPE
---second color attachment; may be nil if multiple render targets are unsupported
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BUFFER_TYPE)
---@field BUFFER_TYPE_COLOR1_BIT graphics.BUFFER_TYPE|nil
---third color attachment; may be nil if multiple render targets are unsupported
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BUFFER_TYPE)
---@field BUFFER_TYPE_COLOR2_BIT graphics.BUFFER_TYPE|nil
---fourth color attachment; may be nil if multiple render targets are unsupported
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BUFFER_TYPE)
---@field BUFFER_TYPE_COLOR3_BIT graphics.BUFFER_TYPE|nil
---depth attachment
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BUFFER_TYPE)
---@field BUFFER_TYPE_DEPTH_BIT graphics.BUFFER_TYPE
---stencil attachment
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BUFFER_TYPE)
---@field BUFFER_TYPE_STENCIL_BIT graphics.BUFFER_TYPE
---always passes
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPARE_FUNC)
---@field COMPARE_FUNC_ALWAYS graphics.COMPARE_FUNC
---passes when the values are equal
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPARE_FUNC)
---@field COMPARE_FUNC_EQUAL graphics.COMPARE_FUNC
---passes when the incoming value is greater than or equal to the stored value
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPARE_FUNC)
---@field COMPARE_FUNC_GEQUAL graphics.COMPARE_FUNC
---passes when the incoming value is greater than the stored value
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPARE_FUNC)
---@field COMPARE_FUNC_GREATER graphics.COMPARE_FUNC
---passes when the incoming value is less than or equal to the stored value
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPARE_FUNC)
---@field COMPARE_FUNC_LEQUAL graphics.COMPARE_FUNC
---passes when the incoming value is less than the stored value
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPARE_FUNC)
---@field COMPARE_FUNC_LESS graphics.COMPARE_FUNC
---never passes
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPARE_FUNC)
---@field COMPARE_FUNC_NEVER graphics.COMPARE_FUNC
---passes when the values are not equal
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPARE_FUNC)
---@field COMPARE_FUNC_NOTEQUAL graphics.COMPARE_FUNC
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPRESSION_TYPE)
---@field COMPRESSION_TYPE_BASIS_ETC1S graphics.COMPRESSION_TYPE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPRESSION_TYPE)
---@field COMPRESSION_TYPE_BASIS_UASTC graphics.COMPRESSION_TYPE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPRESSION_TYPE)
---@field COMPRESSION_TYPE_DEFAULT graphics.COMPRESSION_TYPE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPRESSION_TYPE)
---@field COMPRESSION_TYPE_WEBP graphics.COMPRESSION_TYPE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPRESSION_TYPE)
---@field COMPRESSION_TYPE_WEBP_LOSSY graphics.COMPRESSION_TYPE
---Context feature flag indicating support for 3D (volume) textures.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@field CONTEXT_FEATURE_3D_TEXTURES graphics.CONTEXT_FEATURE
---Context feature flag indicating support for ASTC compressed 2D array textures. Some WebGL/GLES drivers fail array texture ASTC uploads while 2D ASTC works.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@field CONTEXT_FEATURE_ASTC_ARRAY_TEXTURES graphics.CONTEXT_FEATURE
---Context feature flag indicating support for BC (S3TC/RGTC/BPTC) compressed 2D array and 3D textures. WebGL2 forbids these compressed families on array/3D targets while allowing them on 2D.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@field CONTEXT_FEATURE_BC_ARRAY_TEXTURES graphics.CONTEXT_FEATURE
---Context feature flag indicating support for min/max blend equations. Requires GLES3+ or EXT_blend_minmax.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@field CONTEXT_FEATURE_BLEND_EQUATION_MIN_MAX graphics.CONTEXT_FEATURE
---Context feature flag indicating support for compute shaders.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@field CONTEXT_FEATURE_COMPUTE_SHADER graphics.CONTEXT_FEATURE
---Context feature flag indicating support for hardware instancing.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@field CONTEXT_FEATURE_INSTANCING graphics.CONTEXT_FEATURE
---Context feature flag indicating support for rendering to multiple color targets simultaneously.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@field CONTEXT_FEATURE_MULTI_TARGET_RENDERING graphics.CONTEXT_FEATURE
---Context feature flag indicating support for storage buffers.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@field CONTEXT_FEATURE_STORAGE_BUFFER graphics.CONTEXT_FEATURE
---Context feature flag indicating support for texture arrays.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@field CONTEXT_FEATURE_TEXTURE_ARRAY graphics.CONTEXT_FEATURE
---Context feature flag indicating support for vertical sync (vsync).
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@field CONTEXT_FEATURE_VSYNC graphics.CONTEXT_FEATURE
---Default vertex attribute coordinate space.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COORDINATE_SPACE)
---@field COORDINATE_SPACE_DEFAULT graphics.COORDINATE_SPACE
---Local vertex attribute coordinate space.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COORDINATE_SPACE)
---@field COORDINATE_SPACE_LOCAL graphics.COORDINATE_SPACE
---World vertex attribute coordinate space.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COORDINATE_SPACE)
---@field COORDINATE_SPACE_WORLD graphics.COORDINATE_SPACE
---Signed 8-bit vertex attribute data.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.DATA_TYPE)
---@field DATA_TYPE_BYTE graphics.DATA_TYPE
---32-bit floating-point vertex attribute data.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.DATA_TYPE)
---@field DATA_TYPE_FLOAT graphics.DATA_TYPE
---Signed 32-bit vertex attribute data.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.DATA_TYPE)
---@field DATA_TYPE_INT graphics.DATA_TYPE
---Signed 16-bit vertex attribute data.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.DATA_TYPE)
---@field DATA_TYPE_SHORT graphics.DATA_TYPE
---Unsigned 8-bit vertex attribute data.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.DATA_TYPE)
---@field DATA_TYPE_UNSIGNED_BYTE graphics.DATA_TYPE
---Unsigned 32-bit vertex attribute data.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.DATA_TYPE)
---@field DATA_TYPE_UNSIGNED_INT graphics.DATA_TYPE
---Unsigned 16-bit vertex attribute data.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.DATA_TYPE)
---@field DATA_TYPE_UNSIGNED_SHORT graphics.DATA_TYPE
---back-facing polygons
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.FACE_TYPE)
---@field FACE_TYPE_BACK graphics.FACE_TYPE
---front-facing polygons
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.FACE_TYPE)
---@field FACE_TYPE_FRONT graphics.FACE_TYPE
---both front- and back-facing polygons
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.FACE_TYPE)
---@field FACE_TYPE_FRONT_AND_BACK graphics.FACE_TYPE
---Bone-index vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_BONE_INDICES graphics.SEMANTIC_TYPE
---Bone-weight vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_BONE_WEIGHTS graphics.SEMANTIC_TYPE
---Color vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_COLOR graphics.SEMANTIC_TYPE
---Morph-target-weight vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_MORPH_TARGET_WEIGHTS graphics.SEMANTIC_TYPE
---Vertex attribute without a predefined semantic.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_NONE graphics.SEMANTIC_TYPE
---Normal vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_NORMAL graphics.SEMANTIC_TYPE
---Normal-matrix vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_NORMAL_MATRIX graphics.SEMANTIC_TYPE
---Texture page-index vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_PAGE_INDEX graphics.SEMANTIC_TYPE
---Position vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_POSITION graphics.SEMANTIC_TYPE
---Tangent vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_TANGENT graphics.SEMANTIC_TYPE
---Texture-coordinate vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_TEXCOORD graphics.SEMANTIC_TYPE
---2D texture-transform vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_TEXTURE_TRANSFORM_2D graphics.SEMANTIC_TYPE
---World-matrix vertex attribute.
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@field SEMANTIC_TYPE_WORLD_MATRIX graphics.SEMANTIC_TYPE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STATE)
---@field STATE_ALPHA_TEST graphics.STATE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STATE)
---@field STATE_ALPHA_TEST_SUPPORTED graphics.STATE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STATE)
---@field STATE_BLEND graphics.STATE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STATE)
---@field STATE_CULL_FACE graphics.STATE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STATE)
---@field STATE_DEPTH_TEST graphics.STATE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STATE)
---@field STATE_POLYGON_OFFSET_FILL graphics.STATE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STATE)
---@field STATE_SCISSOR_TEST graphics.STATE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STATE)
---@field STATE_STENCIL_TEST graphics.STATE
---decrement and clamp at zero
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STENCIL_OP)
---@field STENCIL_OP_DECR graphics.STENCIL_OP
---decrement and wrap zero to the maximum unsigned value
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STENCIL_OP)
---@field STENCIL_OP_DECR_WRAP graphics.STENCIL_OP
---increment and clamp at the maximum unsigned value
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STENCIL_OP)
---@field STENCIL_OP_INCR graphics.STENCIL_OP
---increment and wrap the maximum unsigned value to zero
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STENCIL_OP)
---@field STENCIL_OP_INCR_WRAP graphics.STENCIL_OP
---bitwise invert
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STENCIL_OP)
---@field STENCIL_OP_INVERT graphics.STENCIL_OP
---keep the current value
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STENCIL_OP)
---@field STENCIL_OP_KEEP graphics.STENCIL_OP
---replace with the reference value from `render.set_stencil_func`
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STENCIL_OP)
---@field STENCIL_OP_REPLACE graphics.STENCIL_OP
---set to zero
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STENCIL_OP)
---@field STENCIL_OP_ZERO graphics.STENCIL_OP
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FILTER)
---@field TEXTURE_FILTER_DEFAULT graphics.TEXTURE_FILTER
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FILTER)
---@field TEXTURE_FILTER_LINEAR graphics.TEXTURE_FILTER
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FILTER)
---@field TEXTURE_FILTER_LINEAR_MIPMAP_LINEAR graphics.TEXTURE_FILTER
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FILTER)
---@field TEXTURE_FILTER_LINEAR_MIPMAP_NEAREST graphics.TEXTURE_FILTER
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FILTER)
---@field TEXTURE_FILTER_NEAREST graphics.TEXTURE_FILTER
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FILTER)
---@field TEXTURE_FILTER_NEAREST_MIPMAP_LINEAR graphics.TEXTURE_FILTER
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FILTER)
---@field TEXTURE_FILTER_NEAREST_MIPMAP_NEAREST graphics.TEXTURE_FILTER
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_BGRA8U graphics.TEXTURE_FORMAT|nil
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_DEPTH graphics.TEXTURE_FORMAT
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_LUMINANCE graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_LUMINANCE_ALPHA graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_R16F graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_R32F graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_R32UI graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RG16F graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RG32F graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGB graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGB16F graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGB32F graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA16F graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA32F graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA32UI graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA_16BPP graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA_ASTC_4X4 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA_BC3 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA_BC7 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA_ETC2 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGB_16BPP graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGB_BC1 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGB_ETC1 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGB_PVRTC_2BPPV1 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RGB_PVRTC_4BPPV1 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RG_BC5 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_RG_ETC2 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_R_BC4 graphics.TEXTURE_FORMAT|nil
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_R_ETC2 graphics.TEXTURE_FORMAT|nil
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@field TEXTURE_FORMAT_STENCIL graphics.TEXTURE_FORMAT
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_TYPE)
---@field TEXTURE_TYPE_2D graphics.TEXTURE_TYPE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_TYPE)
---@field TEXTURE_TYPE_2D_ARRAY graphics.TEXTURE_TYPE
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_TYPE)
---@field TEXTURE_TYPE_3D graphics.TEXTURE_TYPE|nil
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_TYPE)
---@field TEXTURE_TYPE_CUBE_MAP graphics.TEXTURE_TYPE
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_TYPE)
---@field TEXTURE_TYPE_IMAGE_2D graphics.TEXTURE_TYPE
---May be nil if the graphics driver doesn't support it
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_TYPE)
---@field TEXTURE_TYPE_IMAGE_3D graphics.TEXTURE_TYPE|nil
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_USAGE_FLAG)
---@field TEXTURE_USAGE_FLAG_COLOR graphics.TEXTURE_USAGE_FLAG
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_USAGE_FLAG)
---@field TEXTURE_USAGE_FLAG_INPUT graphics.TEXTURE_USAGE_FLAG
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_USAGE_FLAG)
---@field TEXTURE_USAGE_FLAG_MEMORYLESS graphics.TEXTURE_USAGE_FLAG
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_USAGE_FLAG)
---@field TEXTURE_USAGE_FLAG_SAMPLE graphics.TEXTURE_USAGE_FLAG
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_USAGE_FLAG)
---@field TEXTURE_USAGE_FLAG_STORAGE graphics.TEXTURE_USAGE_FLAG
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_WRAP)
---@field TEXTURE_WRAP_CLAMP_TO_BORDER graphics.TEXTURE_WRAP
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_WRAP)
---@field TEXTURE_WRAP_CLAMP_TO_EDGE graphics.TEXTURE_WRAP
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_WRAP)
---@field TEXTURE_WRAP_MIRRORED_REPEAT graphics.TEXTURE_WRAP
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_WRAP)
---@field TEXTURE_WRAP_REPEAT graphics.TEXTURE_WRAP
graphics = {}

---@enum defold_enum.graphics.BLEND_EQUATION: integer
local __defold_enum_graphics_BLEND_EQUATION = {
    BLEND_EQUATION_ADD = nil,
    BLEND_EQUATION_MAX = nil,
    BLEND_EQUATION_MIN = nil,
    BLEND_EQUATION_REVERSE_SUBTRACT = nil,
    BLEND_EQUATION_SUBTRACT = nil,
}

---Blend equations
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_EQUATION)
---@alias graphics.BLEND_EQUATION defold_enum.graphics.BLEND_EQUATION
---| `graphics.BLEND_EQUATION_ADD`
---| `graphics.BLEND_EQUATION_MAX`
---| `graphics.BLEND_EQUATION_MIN`
---| `graphics.BLEND_EQUATION_REVERSE_SUBTRACT`
---| `graphics.BLEND_EQUATION_SUBTRACT`

---@enum defold_enum.graphics.BLEND_FACTOR: integer
local __defold_enum_graphics_BLEND_FACTOR = {
    BLEND_FACTOR_CONSTANT_ALPHA = nil,
    BLEND_FACTOR_CONSTANT_COLOR = nil,
    BLEND_FACTOR_DST_ALPHA = nil,
    BLEND_FACTOR_DST_COLOR = nil,
    BLEND_FACTOR_ONE = nil,
    BLEND_FACTOR_ONE_MINUS_CONSTANT_ALPHA = nil,
    BLEND_FACTOR_ONE_MINUS_CONSTANT_COLOR = nil,
    BLEND_FACTOR_ONE_MINUS_DST_ALPHA = nil,
    BLEND_FACTOR_ONE_MINUS_DST_COLOR = nil,
    BLEND_FACTOR_ONE_MINUS_SRC_ALPHA = nil,
    BLEND_FACTOR_ONE_MINUS_SRC_COLOR = nil,
    BLEND_FACTOR_SRC_ALPHA = nil,
    BLEND_FACTOR_SRC_ALPHA_SATURATE = nil,
    BLEND_FACTOR_SRC_COLOR = nil,
    BLEND_FACTOR_ZERO = nil,
}

---Blend factors
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BLEND_FACTOR)
---@alias graphics.BLEND_FACTOR defold_enum.graphics.BLEND_FACTOR
---| `graphics.BLEND_FACTOR_CONSTANT_ALPHA`
---| `graphics.BLEND_FACTOR_CONSTANT_COLOR`
---| `graphics.BLEND_FACTOR_DST_ALPHA`
---| `graphics.BLEND_FACTOR_DST_COLOR`
---| `graphics.BLEND_FACTOR_ONE`
---| `graphics.BLEND_FACTOR_ONE_MINUS_CONSTANT_ALPHA`
---| `graphics.BLEND_FACTOR_ONE_MINUS_CONSTANT_COLOR`
---| `graphics.BLEND_FACTOR_ONE_MINUS_DST_ALPHA`
---| `graphics.BLEND_FACTOR_ONE_MINUS_DST_COLOR`
---| `graphics.BLEND_FACTOR_ONE_MINUS_SRC_ALPHA`
---| `graphics.BLEND_FACTOR_ONE_MINUS_SRC_COLOR`
---| `graphics.BLEND_FACTOR_SRC_ALPHA`
---| `graphics.BLEND_FACTOR_SRC_ALPHA_SATURATE`
---| `graphics.BLEND_FACTOR_SRC_COLOR`
---| `graphics.BLEND_FACTOR_ZERO`

---@enum defold_enum.graphics.BUFFER_TYPE: integer
local __defold_enum_graphics_BUFFER_TYPE = {
    BUFFER_TYPE_COLOR0_BIT = nil,
    BUFFER_TYPE_COLOR1_BIT = nil,
    BUFFER_TYPE_COLOR2_BIT = nil,
    BUFFER_TYPE_COLOR3_BIT = nil,
    BUFFER_TYPE_DEPTH_BIT = nil,
    BUFFER_TYPE_STENCIL_BIT = nil,
}

---Buffer types
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.BUFFER_TYPE)
---@alias graphics.BUFFER_TYPE defold_enum.graphics.BUFFER_TYPE
---| `graphics.BUFFER_TYPE_COLOR0_BIT`
---| `graphics.BUFFER_TYPE_COLOR1_BIT`
---| `graphics.BUFFER_TYPE_COLOR2_BIT`
---| `graphics.BUFFER_TYPE_COLOR3_BIT`
---| `graphics.BUFFER_TYPE_DEPTH_BIT`
---| `graphics.BUFFER_TYPE_STENCIL_BIT`

---@enum defold_enum.graphics.COMPARE_FUNC: integer
local __defold_enum_graphics_COMPARE_FUNC = {
    COMPARE_FUNC_ALWAYS = nil,
    COMPARE_FUNC_EQUAL = nil,
    COMPARE_FUNC_GEQUAL = nil,
    COMPARE_FUNC_GREATER = nil,
    COMPARE_FUNC_LEQUAL = nil,
    COMPARE_FUNC_LESS = nil,
    COMPARE_FUNC_NEVER = nil,
    COMPARE_FUNC_NOTEQUAL = nil,
}

---Comparison functions
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPARE_FUNC)
---@alias graphics.COMPARE_FUNC defold_enum.graphics.COMPARE_FUNC
---| `graphics.COMPARE_FUNC_ALWAYS`
---| `graphics.COMPARE_FUNC_EQUAL`
---| `graphics.COMPARE_FUNC_GEQUAL`
---| `graphics.COMPARE_FUNC_GREATER`
---| `graphics.COMPARE_FUNC_LEQUAL`
---| `graphics.COMPARE_FUNC_LESS`
---| `graphics.COMPARE_FUNC_NEVER`
---| `graphics.COMPARE_FUNC_NOTEQUAL`

---@enum defold_enum.graphics.COMPRESSION_TYPE: integer
local __defold_enum_graphics_COMPRESSION_TYPE = {
    COMPRESSION_TYPE_BASIS_ETC1S = nil,
    COMPRESSION_TYPE_BASIS_UASTC = nil,
    COMPRESSION_TYPE_DEFAULT = nil,
    COMPRESSION_TYPE_WEBP = nil,
    COMPRESSION_TYPE_WEBP_LOSSY = nil,
}

---Texture compression types
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COMPRESSION_TYPE)
---@alias graphics.COMPRESSION_TYPE defold_enum.graphics.COMPRESSION_TYPE
---| `graphics.COMPRESSION_TYPE_BASIS_ETC1S`
---| `graphics.COMPRESSION_TYPE_BASIS_UASTC`
---| `graphics.COMPRESSION_TYPE_DEFAULT`
---| `graphics.COMPRESSION_TYPE_WEBP`
---| `graphics.COMPRESSION_TYPE_WEBP_LOSSY`

---@enum defold_enum.graphics.CONTEXT_FEATURE: integer
local __defold_enum_graphics_CONTEXT_FEATURE = {
    CONTEXT_FEATURE_3D_TEXTURES = nil,
    CONTEXT_FEATURE_ASTC_ARRAY_TEXTURES = nil,
    CONTEXT_FEATURE_BC_ARRAY_TEXTURES = nil,
    CONTEXT_FEATURE_BLEND_EQUATION_MIN_MAX = nil,
    CONTEXT_FEATURE_COMPUTE_SHADER = nil,
    CONTEXT_FEATURE_INSTANCING = nil,
    CONTEXT_FEATURE_MULTI_TARGET_RENDERING = nil,
    CONTEXT_FEATURE_STORAGE_BUFFER = nil,
    CONTEXT_FEATURE_TEXTURE_ARRAY = nil,
    CONTEXT_FEATURE_VSYNC = nil,
}

---Optional graphics-context features
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.CONTEXT_FEATURE)
---@alias graphics.CONTEXT_FEATURE defold_enum.graphics.CONTEXT_FEATURE
---| `graphics.CONTEXT_FEATURE_3D_TEXTURES`
---| `graphics.CONTEXT_FEATURE_ASTC_ARRAY_TEXTURES`
---| `graphics.CONTEXT_FEATURE_BC_ARRAY_TEXTURES`
---| `graphics.CONTEXT_FEATURE_BLEND_EQUATION_MIN_MAX`
---| `graphics.CONTEXT_FEATURE_COMPUTE_SHADER`
---| `graphics.CONTEXT_FEATURE_INSTANCING`
---| `graphics.CONTEXT_FEATURE_MULTI_TARGET_RENDERING`
---| `graphics.CONTEXT_FEATURE_STORAGE_BUFFER`
---| `graphics.CONTEXT_FEATURE_TEXTURE_ARRAY`
---| `graphics.CONTEXT_FEATURE_VSYNC`

---@enum defold_enum.graphics.COORDINATE_SPACE: integer
local __defold_enum_graphics_COORDINATE_SPACE = {
    COORDINATE_SPACE_DEFAULT = nil,
    COORDINATE_SPACE_LOCAL = nil,
    COORDINATE_SPACE_WORLD = nil,
}

---Vertex attribute coordinate spaces
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.COORDINATE_SPACE)
---@alias graphics.COORDINATE_SPACE defold_enum.graphics.COORDINATE_SPACE
---| `graphics.COORDINATE_SPACE_DEFAULT`
---| `graphics.COORDINATE_SPACE_LOCAL`
---| `graphics.COORDINATE_SPACE_WORLD`

---@enum defold_enum.graphics.DATA_TYPE: integer
local __defold_enum_graphics_DATA_TYPE = {
    DATA_TYPE_BYTE = nil,
    DATA_TYPE_FLOAT = nil,
    DATA_TYPE_INT = nil,
    DATA_TYPE_SHORT = nil,
    DATA_TYPE_UNSIGNED_BYTE = nil,
    DATA_TYPE_UNSIGNED_INT = nil,
    DATA_TYPE_UNSIGNED_SHORT = nil,
}

---Vertex attribute data types
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.DATA_TYPE)
---@alias graphics.DATA_TYPE defold_enum.graphics.DATA_TYPE
---| `graphics.DATA_TYPE_BYTE`
---| `graphics.DATA_TYPE_FLOAT`
---| `graphics.DATA_TYPE_INT`
---| `graphics.DATA_TYPE_SHORT`
---| `graphics.DATA_TYPE_UNSIGNED_BYTE`
---| `graphics.DATA_TYPE_UNSIGNED_INT`
---| `graphics.DATA_TYPE_UNSIGNED_SHORT`

---@enum defold_enum.graphics.FACE_TYPE: integer
local __defold_enum_graphics_FACE_TYPE = {
    FACE_TYPE_BACK = nil,
    FACE_TYPE_FRONT = nil,
    FACE_TYPE_FRONT_AND_BACK = nil,
}

---Face types
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.FACE_TYPE)
---@alias graphics.FACE_TYPE defold_enum.graphics.FACE_TYPE
---| `graphics.FACE_TYPE_BACK`
---| `graphics.FACE_TYPE_FRONT`
---| `graphics.FACE_TYPE_FRONT_AND_BACK`

---@enum defold_enum.graphics.SEMANTIC_TYPE: integer
local __defold_enum_graphics_SEMANTIC_TYPE = {
    SEMANTIC_TYPE_BONE_INDICES = nil,
    SEMANTIC_TYPE_BONE_WEIGHTS = nil,
    SEMANTIC_TYPE_COLOR = nil,
    SEMANTIC_TYPE_MORPH_TARGET_WEIGHTS = nil,
    SEMANTIC_TYPE_NONE = nil,
    SEMANTIC_TYPE_NORMAL = nil,
    SEMANTIC_TYPE_NORMAL_MATRIX = nil,
    SEMANTIC_TYPE_PAGE_INDEX = nil,
    SEMANTIC_TYPE_POSITION = nil,
    SEMANTIC_TYPE_TANGENT = nil,
    SEMANTIC_TYPE_TEXCOORD = nil,
    SEMANTIC_TYPE_TEXTURE_TRANSFORM_2D = nil,
    SEMANTIC_TYPE_WORLD_MATRIX = nil,
}

---Vertex attribute semantic types
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.SEMANTIC_TYPE)
---@alias graphics.SEMANTIC_TYPE defold_enum.graphics.SEMANTIC_TYPE
---| `graphics.SEMANTIC_TYPE_BONE_INDICES`
---| `graphics.SEMANTIC_TYPE_BONE_WEIGHTS`
---| `graphics.SEMANTIC_TYPE_COLOR`
---| `graphics.SEMANTIC_TYPE_MORPH_TARGET_WEIGHTS`
---| `graphics.SEMANTIC_TYPE_NONE`
---| `graphics.SEMANTIC_TYPE_NORMAL`
---| `graphics.SEMANTIC_TYPE_NORMAL_MATRIX`
---| `graphics.SEMANTIC_TYPE_PAGE_INDEX`
---| `graphics.SEMANTIC_TYPE_POSITION`
---| `graphics.SEMANTIC_TYPE_TANGENT`
---| `graphics.SEMANTIC_TYPE_TEXCOORD`
---| `graphics.SEMANTIC_TYPE_TEXTURE_TRANSFORM_2D`
---| `graphics.SEMANTIC_TYPE_WORLD_MATRIX`

---@enum defold_enum.graphics.STATE: integer
local __defold_enum_graphics_STATE = {
    STATE_ALPHA_TEST = nil,
    STATE_ALPHA_TEST_SUPPORTED = nil,
    STATE_BLEND = nil,
    STATE_CULL_FACE = nil,
    STATE_DEPTH_TEST = nil,
    STATE_POLYGON_OFFSET_FILL = nil,
    STATE_SCISSOR_TEST = nil,
    STATE_STENCIL_TEST = nil,
}

---Graphics states
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STATE)
---@alias graphics.STATE defold_enum.graphics.STATE
---| `graphics.STATE_ALPHA_TEST`
---| `graphics.STATE_ALPHA_TEST_SUPPORTED`
---| `graphics.STATE_BLEND`
---| `graphics.STATE_CULL_FACE`
---| `graphics.STATE_DEPTH_TEST`
---| `graphics.STATE_POLYGON_OFFSET_FILL`
---| `graphics.STATE_SCISSOR_TEST`
---| `graphics.STATE_STENCIL_TEST`

---@enum defold_enum.graphics.STENCIL_OP: integer
local __defold_enum_graphics_STENCIL_OP = {
    STENCIL_OP_DECR = nil,
    STENCIL_OP_DECR_WRAP = nil,
    STENCIL_OP_INCR = nil,
    STENCIL_OP_INCR_WRAP = nil,
    STENCIL_OP_INVERT = nil,
    STENCIL_OP_KEEP = nil,
    STENCIL_OP_REPLACE = nil,
    STENCIL_OP_ZERO = nil,
}

---Stencil operations
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.STENCIL_OP)
---@alias graphics.STENCIL_OP defold_enum.graphics.STENCIL_OP
---| `graphics.STENCIL_OP_DECR`
---| `graphics.STENCIL_OP_DECR_WRAP`
---| `graphics.STENCIL_OP_INCR`
---| `graphics.STENCIL_OP_INCR_WRAP`
---| `graphics.STENCIL_OP_INVERT`
---| `graphics.STENCIL_OP_KEEP`
---| `graphics.STENCIL_OP_REPLACE`
---| `graphics.STENCIL_OP_ZERO`

---@enum defold_enum.graphics.TEXTURE_FILTER: integer
local __defold_enum_graphics_TEXTURE_FILTER = {
    TEXTURE_FILTER_DEFAULT = nil,
    TEXTURE_FILTER_LINEAR = nil,
    TEXTURE_FILTER_LINEAR_MIPMAP_LINEAR = nil,
    TEXTURE_FILTER_LINEAR_MIPMAP_NEAREST = nil,
    TEXTURE_FILTER_NEAREST = nil,
    TEXTURE_FILTER_NEAREST_MIPMAP_LINEAR = nil,
    TEXTURE_FILTER_NEAREST_MIPMAP_NEAREST = nil,
}

---Texture filters
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FILTER)
---@alias graphics.TEXTURE_FILTER defold_enum.graphics.TEXTURE_FILTER
---| `graphics.TEXTURE_FILTER_DEFAULT`
---| `graphics.TEXTURE_FILTER_LINEAR`
---| `graphics.TEXTURE_FILTER_LINEAR_MIPMAP_LINEAR`
---| `graphics.TEXTURE_FILTER_LINEAR_MIPMAP_NEAREST`
---| `graphics.TEXTURE_FILTER_NEAREST`
---| `graphics.TEXTURE_FILTER_NEAREST_MIPMAP_LINEAR`
---| `graphics.TEXTURE_FILTER_NEAREST_MIPMAP_NEAREST`

---@enum defold_enum.graphics.TEXTURE_FORMAT: integer
local __defold_enum_graphics_TEXTURE_FORMAT = {
    TEXTURE_FORMAT_BGRA8U = nil,
    TEXTURE_FORMAT_DEPTH = nil,
    TEXTURE_FORMAT_LUMINANCE = nil,
    TEXTURE_FORMAT_LUMINANCE_ALPHA = nil,
    TEXTURE_FORMAT_R16F = nil,
    TEXTURE_FORMAT_R32F = nil,
    TEXTURE_FORMAT_R32UI = nil,
    TEXTURE_FORMAT_RG16F = nil,
    TEXTURE_FORMAT_RG32F = nil,
    TEXTURE_FORMAT_RGB = nil,
    TEXTURE_FORMAT_RGB16F = nil,
    TEXTURE_FORMAT_RGB32F = nil,
    TEXTURE_FORMAT_RGBA = nil,
    TEXTURE_FORMAT_RGBA16F = nil,
    TEXTURE_FORMAT_RGBA32F = nil,
    TEXTURE_FORMAT_RGBA32UI = nil,
    TEXTURE_FORMAT_RGBA_16BPP = nil,
    TEXTURE_FORMAT_RGBA_ASTC_4X4 = nil,
    TEXTURE_FORMAT_RGBA_BC3 = nil,
    TEXTURE_FORMAT_RGBA_BC7 = nil,
    TEXTURE_FORMAT_RGBA_ETC2 = nil,
    TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1 = nil,
    TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1 = nil,
    TEXTURE_FORMAT_RGB_16BPP = nil,
    TEXTURE_FORMAT_RGB_BC1 = nil,
    TEXTURE_FORMAT_RGB_ETC1 = nil,
    TEXTURE_FORMAT_RGB_PVRTC_2BPPV1 = nil,
    TEXTURE_FORMAT_RGB_PVRTC_4BPPV1 = nil,
    TEXTURE_FORMAT_RG_BC5 = nil,
    TEXTURE_FORMAT_RG_ETC2 = nil,
    TEXTURE_FORMAT_R_BC4 = nil,
    TEXTURE_FORMAT_R_ETC2 = nil,
    TEXTURE_FORMAT_STENCIL = nil,
}

---Texture formats
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_FORMAT)
---@alias graphics.TEXTURE_FORMAT defold_enum.graphics.TEXTURE_FORMAT
---| `graphics.TEXTURE_FORMAT_BGRA8U`
---| `graphics.TEXTURE_FORMAT_DEPTH`
---| `graphics.TEXTURE_FORMAT_LUMINANCE`
---| `graphics.TEXTURE_FORMAT_LUMINANCE_ALPHA`
---| `graphics.TEXTURE_FORMAT_R16F`
---| `graphics.TEXTURE_FORMAT_R32F`
---| `graphics.TEXTURE_FORMAT_R32UI`
---| `graphics.TEXTURE_FORMAT_RG16F`
---| `graphics.TEXTURE_FORMAT_RG32F`
---| `graphics.TEXTURE_FORMAT_RGB`
---| `graphics.TEXTURE_FORMAT_RGB16F`
---| `graphics.TEXTURE_FORMAT_RGB32F`
---| `graphics.TEXTURE_FORMAT_RGBA`
---| `graphics.TEXTURE_FORMAT_RGBA16F`
---| `graphics.TEXTURE_FORMAT_RGBA32F`
---| `graphics.TEXTURE_FORMAT_RGBA32UI`
---| `graphics.TEXTURE_FORMAT_RGBA_16BPP`
---| `graphics.TEXTURE_FORMAT_RGBA_ASTC_4X4`
---| `graphics.TEXTURE_FORMAT_RGBA_BC3`
---| `graphics.TEXTURE_FORMAT_RGBA_BC7`
---| `graphics.TEXTURE_FORMAT_RGBA_ETC2`
---| `graphics.TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1`
---| `graphics.TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1`
---| `graphics.TEXTURE_FORMAT_RGB_16BPP`
---| `graphics.TEXTURE_FORMAT_RGB_BC1`
---| `graphics.TEXTURE_FORMAT_RGB_ETC1`
---| `graphics.TEXTURE_FORMAT_RGB_PVRTC_2BPPV1`
---| `graphics.TEXTURE_FORMAT_RGB_PVRTC_4BPPV1`
---| `graphics.TEXTURE_FORMAT_RG_BC5`
---| `graphics.TEXTURE_FORMAT_RG_ETC2`
---| `graphics.TEXTURE_FORMAT_R_BC4`
---| `graphics.TEXTURE_FORMAT_R_ETC2`
---| `graphics.TEXTURE_FORMAT_STENCIL`

---@enum defold_enum.graphics.TEXTURE_TYPE: integer
local __defold_enum_graphics_TEXTURE_TYPE = {
    TEXTURE_TYPE_2D = nil,
    TEXTURE_TYPE_2D_ARRAY = nil,
    TEXTURE_TYPE_3D = nil,
    TEXTURE_TYPE_CUBE_MAP = nil,
    TEXTURE_TYPE_IMAGE_2D = nil,
    TEXTURE_TYPE_IMAGE_3D = nil,
}

---Texture types
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_TYPE)
---@alias graphics.TEXTURE_TYPE defold_enum.graphics.TEXTURE_TYPE
---| `graphics.TEXTURE_TYPE_2D`
---| `graphics.TEXTURE_TYPE_2D_ARRAY`
---| `graphics.TEXTURE_TYPE_3D`
---| `graphics.TEXTURE_TYPE_CUBE_MAP`
---| `graphics.TEXTURE_TYPE_IMAGE_2D`
---| `graphics.TEXTURE_TYPE_IMAGE_3D`

---@enum defold_enum.graphics.TEXTURE_USAGE_FLAG: integer
local __defold_enum_graphics_TEXTURE_USAGE_FLAG = {
    TEXTURE_USAGE_FLAG_COLOR = nil,
    TEXTURE_USAGE_FLAG_INPUT = nil,
    TEXTURE_USAGE_FLAG_MEMORYLESS = nil,
    TEXTURE_USAGE_FLAG_SAMPLE = nil,
    TEXTURE_USAGE_FLAG_STORAGE = nil,
}

---Texture usage flags
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_USAGE_FLAG)
---@alias graphics.TEXTURE_USAGE_FLAG defold_enum.graphics.TEXTURE_USAGE_FLAG
---| `graphics.TEXTURE_USAGE_FLAG_COLOR`
---| `graphics.TEXTURE_USAGE_FLAG_INPUT`
---| `graphics.TEXTURE_USAGE_FLAG_MEMORYLESS`
---| `graphics.TEXTURE_USAGE_FLAG_SAMPLE`
---| `graphics.TEXTURE_USAGE_FLAG_STORAGE`

---@enum defold_enum.graphics.TEXTURE_WRAP: integer
local __defold_enum_graphics_TEXTURE_WRAP = {
    TEXTURE_WRAP_CLAMP_TO_BORDER = nil,
    TEXTURE_WRAP_CLAMP_TO_EDGE = nil,
    TEXTURE_WRAP_MIRRORED_REPEAT = nil,
    TEXTURE_WRAP_REPEAT = nil,
}

---Texture wrapping modes
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.TEXTURE_WRAP)
---@alias graphics.TEXTURE_WRAP defold_enum.graphics.TEXTURE_WRAP
---| `graphics.TEXTURE_WRAP_CLAMP_TO_BORDER`
---| `graphics.TEXTURE_WRAP_CLAMP_TO_EDGE`
---| `graphics.TEXTURE_WRAP_MIRRORED_REPEAT`
---| `graphics.TEXTURE_WRAP_REPEAT`

---Returns a table describing the active graphics context: the adapter family,
---its hardware limits, the list of driver-reported extensions, and the set of
---optional context features supported by the backend.
---@return graphics.adapter_info info information about the active graphics adapter and context
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.get_adapter_info:)
function graphics.get_adapter_info() end

---get the list of graphics adapters that have been registered with the engine
---@return string[] adapters array of adapter family name strings (e.g. "opengl", "vulkan", "webgpu")
---
---[Open in Browser](https://defold.com/ref/graphics-lua#graphics.get_engine_adapters:)
function graphics.get_engine_adapters() end
