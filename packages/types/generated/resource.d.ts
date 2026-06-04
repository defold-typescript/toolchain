/** @noSelfInFile */
import type { Hash, Opaque } from "../src/core-types";

declare global {
  namespace resource {
    /**
     * Constructor-like function with two purposes:
     * - Load the specified resource as part of loading the script
     * - Return a hash to the run-time version of the resource
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a path hash to the binary version of the resource
     */
    function atlas(path?: string): Hash;
    /**
     * Constructor-like function with two purposes:
     * - Load the specified resource as part of loading the script
     * - Return a hash to the run-time version of the resource
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a path hash to the binary version of the resource
     */
    function buffer(path?: string): Hash;
    /**
     * This function creates a new atlas resource that can be used in the same way as any atlas created during build time.
     * The path used for creating the atlas must be unique, trying to create a resource at a path that is already
     * registered will trigger an error. If the intention is to instead modify an existing atlas, use the resource.set_atlas
     * function. Also note that the path to the new atlas resource must have a '.texturesetc' extension,
     * meaning "/path/my_atlas" is not a valid path but "/path/my_atlas.texturesetc" is.
     * When creating the atlas, at least one geometry and one animation is required, and an error will be
     * raised if these requirements are not met. A reference to the resource will be held by the collection
     * that created the resource and will automatically be released when that collection is destroyed.
     * Note that releasing a resource essentially means decreasing the reference count of that resource,
     * and not necessarily that it will be deleted.
     *
     * @param path - The path to the resource.
     * @param table - A table containing info about how to create the atlas. Supported entries:
  -
  `texture`
  string | hash the path to the texture resource, e.g "/main/my_texture.texturec"
  -
  `animations`
  table a list of the animations in the atlas. Supports the following fields:
  -
  `id`
  string the id of the animation, used in e.g sprite.play_animation
  -
  `width`
  number the width of the animation
  -
  `height`
  number the height of the animation
  -
  `frame_start`
  number index to the first geometry of the animation. Indices are lua based and must be in the range of 1 .. in atlas.
  -
  `frame_end`
  number index to the last geometry of the animation (non-inclusive). Indices are lua based and must be in the range of 1 .. in atlas.
  -
  `playback`
  constant optional playback mode of the animation, the default value is go.PLAYBACK_ONCE_FORWARD
  -
  `fps`
  number optional fps of the animation, the default value is 30
  -
  `flip_vertical`
  boolean optional flip the animation vertically, the default value is false
  -
  `flip_horizontal`
  boolean optional flip the animation horizontally, the default value is false
  -
  `geometries`
  table A list of the geometries that should map to the texture data. Supports the following fields:
  -
  `id`
  string The name of the geometry. Used when matching animations between multiple atlases
  -
  `width`
  number The width of the image the sprite geometry represents
  -
  `height`
  number The height of the image the sprite geometry represents
  -
  `pivot_x`
  number The pivot x value of the image in unit coords. (0,0) is upper left corner, (1,1) is bottom right. Default is 0.5.
  -
  `pivot_y`
  number The pivot y value of the image in unit coords. (0,0) is upper left corner, (1,1) is bottom right. Default is 0.5.
  -
  `rotated`
  boolean Whether the image is rotated 90 degrees counter-clockwise in the atlas. This affects UV coordinate generation for proper rendering. Default is false.
  -
  `vertices`
  table a list of the vertices in image space of the geometry in the form {px0, py0, px1, py1, ..., pxn, pyn}
  -
  `uvs`
  table a list of the uv coordinates in image space of the geometry in the form of {u0, v0, u1, v1, ..., un, vn}.
  -
  `indices`
  table a list of the indices of the geometry in the form {i0, i1, i2, ..., in}. Each tripe in the list represents a triangle.
     * @returns Returns the atlas resource path
     */
    function create_atlas(path: string, table: { texture?: string | Hash; animations?: { id?: string; width?: number; height?: number; frame_start?: number; frame_end?: number; playback?: Opaque<"constant">; fps?: number; flip_vertical?: boolean; flip_horizontal?: boolean }[]; geometries?: { id?: string; width?: number; height?: number; pivot_x?: number; pivot_y?: number; rotated?: boolean }[]; vertices?: number[]; uvs?: number[]; indices?: number[] }): Hash;
    /**
     * This function creates a new buffer resource that can be used in the same way as any buffer created during build time.
     * The function requires a valid buffer created from either buffer.create or another pre-existing buffer resource.
     * By default, the new resource will take ownership of the buffer lua reference, meaning the buffer will not automatically be removed
     * when the lua reference to the buffer is garbage collected. This behaviour can be overruled by specifying 'transfer_ownership = false'
     * in the argument table. If the new buffer resource is created from a buffer object that is created by another resource,
     * the buffer object will be copied and the new resource will effectively own a copy of the buffer instead.
     * Note that the path to the new resource must have the '.bufferc' extension, "/path/my_buffer" is not a valid path but "/path/my_buffer.bufferc" is.
     * The path must also be unique, attempting to create a buffer with the same name as an existing resource will raise an error.
     *
     * @param path - The path to the resource.
     * @param table - A table containing info about how to create the buffer. Supported entries:
  -
  `buffer`
  buffer the buffer to bind to this resource
  -
  `transfer_ownership`
  boolean optional flag to determine wether or not the resource should take over ownership of the buffer object (default true)
     * @returns Returns the buffer resource path
     */
    function create_buffer(path: string, table?: { buffer?: Opaque<"buffer">; transfer_ownership?: boolean }): Hash;
    /**
     * Creates a sound data resource
     * Supported formats are .oggc, .opusc and .wavc
     *
     * @param path - the path to the resource. Must not already exist.
     * @param options - A table containing parameters for the text. Supported entries:
  `data`
  string The raw data of the file. May be partial, but must include the header of the file
  `filesize`
  number If the file is partial, it must also specify the full size of the complete file.
  `partial`
  boolean Is the data not representing the full file, but just the initial chunk?
     * @returns the resulting path hash to the resource
     */
    function create_sound_data(path: string, options?: { data?: string; filesize?: number; partial?: boolean }): Hash;
    /**
     * Creates a new texture resource that can be used in the same way as any texture created during build time.
     * The path used for creating the texture must be unique, trying to create a resource at a path that is already
     * registered will trigger an error. If the intention is to instead modify an existing texture, use the resource.set_texture
     * function. Also note that the path to the new texture resource must have a '.texturec' extension,
     * meaning "/path/my_texture" is not a valid path but "/path/my_texture.texturec" is.
     * If the texture is created without a buffer, the pixel data will be blank.
     *
     * @param path - The path to the resource.
     * @param table - A table containing info about how to create the texture. Supported entries:
  `type`
  number The texture type. Supported values:
  - `graphics.TEXTURE_TYPE_2D`
  - `graphics.TEXTURE_TYPE_IMAGE_2D`
  - `graphics.TEXTURE_TYPE_3D`
  - `graphics.TEXTURE_TYPE_IMAGE_3D`
  - `graphics.TEXTURE_TYPE_CUBE_MAP`
  `width`
  number The width of the texture (in pixels). Must be larger than 0.
  `height`
  number The width of the texture (in pixels). Must be larger than 0.
  `depth`
  number The depth of the texture (in pixels). Must be larger than 0. Only used when `type` is `graphics.TEXTURE_TYPE_3D` or `graphics.TEXTURE_TYPE_IMAGE_3D`.
  `format`
  number The texture format, note that some of these formats might not be supported by the running device. Supported values:
  - `graphics.TEXTURE_FORMAT_LUMINANCE`
  - `graphics.TEXTURE_FORMAT_RGB`
  - `graphics.TEXTURE_FORMAT_RGBA`
  These constants might not be available on the device:
  - `graphics.TEXTURE_FORMAT_RGB_PVRTC_2BPPV1`
  - `graphics.TEXTURE_FORMAT_RGB_PVRTC_4BPPV1`
  - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1`
  - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1`
  - `graphics.TEXTURE_FORMAT_RGB_ETC1`
  - `graphics.TEXTURE_FORMAT_RGBA_ETC2`
  - `graphics.TEXTURE_FORMAT_RGBA_ASTC_4X4`
  - `graphics.TEXTURE_FORMAT_RGB_BC1`
  - `graphics.TEXTURE_FORMAT_RGBA_BC3`
  - `graphics.TEXTURE_FORMAT_R_BC4`
  - `graphics.TEXTURE_FORMAT_RG_BC5`
  - `graphics.TEXTURE_FORMAT_RGBA_BC7`
  - `graphics.TEXTURE_FORMAT_RGB16F`
  - `graphics.TEXTURE_FORMAT_RGB32F`
  - `graphics.TEXTURE_FORMAT_RGBA16F`
  - `graphics.TEXTURE_FORMAT_RGBA32F`
  - `graphics.TEXTURE_FORMAT_R16F`
  - `graphics.TEXTURE_FORMAT_RG16F`
  - `graphics.TEXTURE_FORMAT_R32F`
  - `graphics.TEXTURE_FORMAT_RG32F`
  You can test if the device supports these values by checking if a specific enum is nil or not:
  `if graphics.TEXTURE_FORMAT_RGBA16F ~= nil then
  -- it is safe to use this format
  end
  `
  `flags`
  number Texture creation flags that can be used to dictate how the texture is created. The default value is graphics.TEXTURE_USAGE_FLAG_SAMPLE, which means that the texture can be sampled from a shader.
  These flags may or may not be supported on the running device and/or the underlying graphics API and is simply used internally as a 'hint' when creating the texture. There is no guarantee that any of these will have any effect. Supported values:
  - `graphics.TEXTURE_USAGE_FLAG_SAMPLE` - The texture can be sampled from a shader (default)
  - `graphics.TEXTURE_USAGE_FLAG_MEMORYLESS` - The texture can be used as a memoryless texture, i.e only transient memory for the texture is used during rendering
  - `graphics.TEXTURE_USAGE_FLAG_STORAGE` - The texture can be used as a storage texture, which is required for a shader to write to the texture
  `max_mipmaps`
  number optional max number of mipmaps. Defaults to zero, i.e no mipmap support
  `compression_type`
  number optional specify the compression type for the data in the buffer object that holds the texture data. Will only be used when a compressed buffer has been passed into the function.
  Creating an empty texture with no buffer data is not supported as a core feature. Defaults to graphics.COMPRESSION_TYPE_DEFAULT, i.e no compression. Supported values:
  - `COMPRESSION_TYPE_DEFAULT`
  - `COMPRESSION_TYPE_BASIS_UASTC`
     * @param buffer - optional buffer of precreated pixel data
     * @returns The path to the resource.
  3D Textures are currently only supported on OpenGL and Vulkan adapters. To check if your device supports 3D textures, use:
  ```lua
  if graphics.TEXTURE_TYPE_3D ~= nil then
  -- Device and graphics adapter support 3D textures
  end
     */
    function create_texture(path: string, table: { type?: number; width?: number; height?: number; depth?: number; format?: number; flags?: number; max_mipmaps?: number; compression_type?: number }, buffer: Opaque<"buffer">): Hash;
    /**
     * Creates a new texture resource that can be used in the same way as any texture created during build time.
     * The path used for creating the texture must be unique, trying to create a resource at a path that is already
     * registered will trigger an error. If the intention is to instead modify an existing texture, use the resource.set_texture
     * function. Also note that the path to the new texture resource must have a '.texturec' extension,
     * meaning "/path/my_texture" is not a valid path but "/path/my_texture.texturec" is.
     * If the texture is created without a buffer, the pixel data will be blank.
     * The difference between the async version and resource.create_texture is that the texture data will be uploaded
     * in a graphics worker thread. The function will return a resource immediately that contains a 1x1 blank texture which can be used
     * immediately after the function call. When the new texture has been uploaded, the initial blank texture will be deleted and replaced with the
     * new texture. Be careful when using the initial texture handle handle as it will not be valid after the upload has finished.
     *
     * @param path - The path to the resource.
     * @param table - A table containing info about how to create the texture. Supported entries:
  `type`
  number The texture type. Supported values:
  - `graphics.TEXTURE_TYPE_2D`
  - `graphics.TEXTURE_TYPE_IMAGE_2D`
  - `graphics.TEXTURE_TYPE_3D`
  - `graphics.TEXTURE_TYPE_IMAGE_3D`
  - `graphics.TEXTURE_TYPE_CUBE_MAP`
  `width`
  number The width of the texture (in pixels). Must be larger than 0.
  `height`
  number The width of the texture (in pixels). Must be larger than 0.
  `depth`
  number The depth of the texture (in pixels). Must be larger than 0. Only used when `type` is `graphics.TEXTURE_TYPE_3D` or `graphics.TEXTURE_TYPE_IMAGE_3D`.
  `format`
  number The texture format, note that some of these formats might not be supported by the running device. Supported values:
  - `graphics.TEXTURE_FORMAT_LUMINANCE`
  - `graphics.TEXTURE_FORMAT_RGB`
  - `graphics.TEXTURE_FORMAT_RGBA`
  These constants might not be available on the device:
  - `graphics.TEXTURE_FORMAT_RGB_PVRTC_2BPPV1`
  - `graphics.TEXTURE_FORMAT_RGB_PVRTC_4BPPV1`
  - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1`
  - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1`
  - `graphics.TEXTURE_FORMAT_RGB_ETC1`
  - `graphics.TEXTURE_FORMAT_RGBA_ETC2`
  - `graphics.TEXTURE_FORMAT_RGBA_ASTC_4X4`
  - `graphics.TEXTURE_FORMAT_RGB_BC1`
  - `graphics.TEXTURE_FORMAT_RGBA_BC3`
  - `graphics.TEXTURE_FORMAT_R_BC4`
  - `graphics.TEXTURE_FORMAT_RG_BC5`
  - `graphics.TEXTURE_FORMAT_RGBA_BC7`
  - `graphics.TEXTURE_FORMAT_RGB16F`
  - `graphics.TEXTURE_FORMAT_RGB32F`
  - `graphics.TEXTURE_FORMAT_RGBA16F`
  - `graphics.TEXTURE_FORMAT_RGBA32F`
  - `graphics.TEXTURE_FORMAT_R16F`
  - `graphics.TEXTURE_FORMAT_RG16F`
  - `graphics.TEXTURE_FORMAT_R32F`
  - `graphics.TEXTURE_FORMAT_RG32F`
  You can test if the device supports these values by checking if a specific enum is nil or not:
  `if graphics.TEXTURE_FORMAT_RGBA16F ~= nil then
  -- it is safe to use this format
  end
  `
  `flags`
  number Texture creation flags that can be used to dictate how the texture is created. Supported values:
  - `graphics.TEXTURE_USAGE_FLAG_SAMPLE` - The texture can be sampled from a shader (default)
  - `graphics.TEXTURE_USAGE_FLAG_MEMORYLESS` - The texture can be used as a memoryless texture, i.e only transient memory for the texture is used during rendering
  - `graphics.TEXTURE_USAGE_FLAG_STORAGE` - The texture can be used as a storage texture, which is required for a shader to write to the texture
  `max_mipmaps`
  number optional max number of mipmaps. Defaults to zero, i.e no mipmap support
  `compression_type`
  number optional specify the compression type for the data in the buffer object that holds the texture data. Will only be used when a compressed buffer has been passed into the function.
  Creating an empty texture with no buffer data is not supported as a core feature. Defaults to graphics.COMPRESSION_TYPE_DEFAULT, i.e no compression. Supported values:
  - `COMPRESSION_TYPE_DEFAULT`
  - `COMPRESSION_TYPE_BASIS_UASTC`
     * @param buffer - optional buffer of precreated pixel data
     * @param callback - callback function when texture is created (self, request_id, resource)
     */
    function create_texture_async(path: string | Hash, table: { type?: number; width?: number; height?: number; depth?: number; format?: number; flags?: number; max_mipmaps?: number; compression_type?: number }, buffer: Opaque<"buffer">, callback: (...args: unknown[]) => unknown): LuaMultiReturn<[Hash, number]>;
    /**
     * Constructor-like function with two purposes:
     * - Load the specified resource as part of loading the script
     * - Return a hash to the run-time version of the resource
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a path hash to the binary version of the resource
     */
    function font(path?: string): Hash;
    /**
     * Returns the atlas data for an atlas
     *
     * @param path - The path to the atlas resource
     * @returns A table with the following entries:
  - texture
  - geometries
  - animations
  Each animation entry also contains a `frames` table with indices into
  `geometries`, preserving the frame-to-geometry mapping used by the atlas.
  See resource.set_atlas for a detailed description of each field
     */
    function get_atlas(path: Hash | string): { texture: string | Hash; animations: { id: string; width: number; height: number; frame_start: number; frame_end: number; playback: Opaque<"constant">; fps: number; flip_vertical: boolean; flip_horizontal: boolean }[]; geometries: Record<string | number, unknown> };
    /**
     * gets the buffer from a resource
     *
     * @param path - The path to the resource
     * @returns The resource buffer
     */
    function get_buffer(path: Hash | string): Opaque<"buffer">;
    /**
     * Gets render target info from a render target resource path or a render target handle
     *
     * @param path - The path to the resource or a render target handle
     * @returns A table containing info about the render target:
  `handle`
  number the opaque handle to the texture resource
  'attachments'
  table a table of attachments, where each attachment contains the following entries:
  `width`
  number width of the texture
  `height`
  number height of the texture
  `depth`
  number depth of the texture (i.e 1 for a 2D texture and 6 for a cube map)
  `mipmaps`
  number number of mipmaps of the texture
  `type`
  number The texture type. Supported values:
  - `graphics.TEXTURE_TYPE_2D`
  - `graphics.TEXTURE_TYPE_CUBE_MAP`
  - `graphics.TEXTURE_TYPE_2D_ARRAY`
  `buffer_type`
  number The attachment buffer type. Supported values:
  - `resource.BUFFER_TYPE_COLOR0`
  - `resource.BUFFER_TYPE_COLOR1`
  - `resource.BUFFER_TYPE_COLOR2`
  - `resource.BUFFER_TYPE_COLOR3`
  - `resource.BUFFER_TYPE_DEPTH`
  -
  `resource.BUFFER_TYPE_STENCIL`
  -
  `texture`
  hash The hashed path to the attachment texture resource. This field is only available if the render target passed in is a resource.
     */
    function get_render_target_info(path: Hash | string | number): { handle: number; width: number; height: number; depth: number; mipmaps: number; type: number; buffer_type: number; texture: Hash };
    /**
     * Gets the text metrics from a font
     *
     * @param url - the font to get the (unscaled) metrics from
     * @param text - text to measure
     * @param options - A table containing parameters for the text. Supported entries:
  `width`
  number The width of the text field. Not used if `line_break` is false.
  `leading`
  number The leading (default 1.0)
  `tracking`
  number The tracking (default 0.0)
  `line_break`
  boolean If the calculation should consider line breaks (default false)
     * @returns a table with the following fields:
  - width
  - height
  - max_ascent
  - max_descent
     */
    function get_text_metrics(url: Hash, text: string, options?: { width?: number; leading?: number; tracking?: number; line_break?: boolean }): Record<string | number, unknown>;
    /**
     * Gets texture info from a texture resource path or a texture handle
     *
     * @param path - The path to the resource or a texture handle
     * @returns A table containing info about the texture:
  `handle`
  number the opaque handle to the texture resource
  `width`
  number width of the texture
  `height`
  number height of the texture
  `depth`
  number depth of the texture (i.e 1 for a 2D texture, 6 for a cube map, the actual depth of a 3D texture)
  `page_count`
  number number of pages of the texture array. For 2D texture value is 1. For cube map - 6
  `mipmaps`
  number number of mipmaps of the texture
  `flags`
  number usage hints of the texture.
  `type`
  number The texture type. Supported values:
  - `graphics.TEXTURE_TYPE_2D`
  - `graphics.TEXTURE_TYPE_2D_ARRAY`
  - `graphics.TEXTURE_TYPE_IMAGE_2D`
  - `graphics.TEXTURE_TYPE_3D`
  - `graphics.TEXTURE_TYPE_IMAGE_3D`
  - `graphics.TEXTURE_TYPE_CUBE_MAP`
     */
    function get_texture_info(path: Hash | string | number): { handle: number; width: number; height: number; depth: number; page_count: number; mipmaps: number; flags: number; type: number };
    /**
     * Loads the resource data for a specific resource.
     *
     * @param path - The path to the resource
     * @returns Returns the buffer stored on disc
     */
    function load(path: string): Opaque<"buffer">;
    /**
     * Constructor-like function with two purposes:
     * - Load the specified resource as part of loading the script
     * - Return a hash to the run-time version of the resource
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a path hash to the binary version of the resource
     */
    function material(path?: string): Hash;
    /**
     * Release a resource.
     * This is a potentially dangerous operation, releasing resources currently being used can cause unexpected behaviour.
     *
     * @param path - The path to the resource.
     */
    function release(path: Hash | string): void;
    /**
     * Constructor-like function with two purposes:
     * - Load the specified resource as part of loading the script
     * - Return a hash to the run-time version of the resource
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a path hash to the binary version of the resource
     */
    function render_target(path?: string): Hash;
    /**
     * Sets the resource data for a specific resource
     *
     * @param path - The path to the resource
     * @param buffer - The buffer of precreated data, suitable for the intended resource type
     */
    function set(path: string | Hash, buffer: Opaque<"buffer">): void;
    /**
     * Sets the data for a specific atlas resource. Setting new atlas data is specified by passing in
     * a texture path for the backing texture of the atlas, a list of geometries and a list of animations
     * that map to the entries in the geometry list. The geometry entries are represented by three lists:
     * vertices, uvs and indices that together represent triangles that are used in other parts of the
     * engine to produce render objects from.
     * Vertex and uv coordinates for the geometries are expected to be
     * in pixel coordinates where 0,0 is the top left corner of the texture.
     * There is no automatic padding or margin support when setting custom data,
     * which could potentially cause filtering artifacts if used with a material sampler that has linear filtering.
     * If that is an issue, you need to calculate padding and margins manually before passing in the geometry data to
     * this function.
     *
     * @param path - The path to the atlas resource
     * @param table - A table containing info about the atlas. Supported entries:
  -
  `texture`
  string | hash the path to the texture resource, e.g "/main/my_texture.texturec"
  -
  `animations`
  table a list of the animations in the atlas. Supports the following fields:
  -
  `id`
  string the id of the animation, used in e.g sprite.play_animation
  -
  `width`
  number the width of the animation
  -
  `height`
  number the height of the animation
  -
  `frame_start`
  number index to the first geometry of the animation. Indices are lua based and must be in the range of 1 .. in atlas.
  -
  `frame_end`
  number index to the last geometry of the animation (non-inclusive). Indices are lua based and must be in the range of 1 .. in atlas.
  -
  `playback`
  constant optional playback mode of the animation, the default value is go.PLAYBACK_ONCE_FORWARD
  -
  `fps`
  number optional fps of the animation, the default value is 30
  -
  `flip_vertical`
  boolean optional flip the animation vertically, the default value is false
  -
  `flip_horizontal`
  boolean optional flip the animation horizontally, the default value is false
  -
  `geometries`
  table A list of the geometries that should map to the texture data. Supports the following fields:
  -
  `vertices`
  table a list of the vertices in texture space of the geometry in the form {px0, py0, px1, py1, ..., pxn, pyn}
  -
  `uvs`
  table a list of the uv coordinates in texture space of the geometry in the form of {u0, v0, u1, v1, ..., un, vn}
  -
  `indices`
  table a list of the indices of the geometry in the form {i0, i1, i2, ..., in}. Each tripe in the list represents a triangle.
     */
    function set_atlas(path: Hash | string, table: { texture?: string | Hash; animations?: { id?: string; width?: number; height?: number; frame_start?: number; frame_end?: number; playback?: Opaque<"constant">; fps?: number; flip_vertical?: boolean; flip_horizontal?: boolean }[]; geometries?: Record<string | number, unknown>; vertices?: number[]; uvs?: number[]; indices?: number[] }): void;
    /**
     * Sets the buffer of a resource. By default, setting the resource buffer will either copy the data from the incoming buffer object
     * to the buffer stored in the destination resource, or make a new buffer object if the sizes between the source buffer and the destination buffer
     * stored in the resource differs. In some cases, e.g performance reasons, it might be beneficial to just set the buffer object on the resource without copying or cloning.
     * To achieve this, set the `transfer_ownership` flag to true in the argument table. Transferring ownership from a lua buffer to a resource with this function
     * works exactly the same as resource.create_buffer: the destination resource will take ownership of the buffer held by the lua reference, i.e the buffer will not automatically be removed
     * when the lua reference to the buffer is garbage collected.
     * Note: When setting a buffer with `transfer_ownership = true`, the currently bound buffer in the resource will be destroyed.
     *
     * @param path - The path to the resource
     * @param buffer - The resource buffer
     * @param table - A table containing info about how to set the buffer. Supported entries:
  -
  `transfer_ownership`
  boolean optional flag to determine wether or not the resource should take over ownership of the buffer object (default false)
     */
    function set_buffer(path: Hash | string, buffer: Opaque<"buffer">, table?: { transfer_ownership?: boolean }): void;
    /**
     * Update internal sound resource (wavc/oggc/opusc) with new data
     *
     * @param path - The path to the resource
     * @param buffer - A lua string containing the binary sound data
     */
    function set_sound(path: Hash | string, buffer: string): void;
    /**
     * Sets the pixel data for a specific texture.
     *
     * @param path - The path to the resource
     * @param table - A table containing info about the texture. Supported entries:
  `type`
  number The texture type. Supported values:
  - `graphics.TEXTURE_TYPE_2D`
  - `graphics.TEXTURE_TYPE_IMAGE_2D`
  - `graphics.TEXTURE_TYPE_3D`
  - `graphics.TEXTURE_TYPE_IMAGE_3D`
  - `graphics.TEXTURE_TYPE_CUBE_MAP`
  `width`
  number The width of the texture (in pixels)
  `height`
  number The width of the texture (in pixels)
  `format`
  number The texture format, note that some of these formats are platform specific. Supported values:
  - `graphics.TEXTURE_FORMAT_LUMINANCE`
  - `graphics.TEXTURE_FORMAT_RGB`
  - `graphics.TEXTURE_FORMAT_RGBA`
  These constants might not be available on the device:
  - `graphics.TEXTURE_FORMAT_RGB_PVRTC_2BPPV1`
  - `graphics.TEXTURE_FORMAT_RGB_PVRTC_4BPPV1`
  - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1`
  - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1`
  - `graphics.TEXTURE_FORMAT_RGB_ETC1`
  - `graphics.TEXTURE_FORMAT_RGBA_ETC2`
  - `graphics.TEXTURE_FORMAT_RGBA_ASTC_4X4`
  - `graphics.TEXTURE_FORMAT_RGB_BC1`
  - `graphics.TEXTURE_FORMAT_RGBA_BC3`
  - `graphics.TEXTURE_FORMAT_R_BC4`
  - `graphics.TEXTURE_FORMAT_RG_BC5`
  - `graphics.TEXTURE_FORMAT_RGBA_BC7`
  - `graphics.TEXTURE_FORMAT_RGB16F`
  - `graphics.TEXTURE_FORMAT_RGB32F`
  - `graphics.TEXTURE_FORMAT_RGBA16F`
  - `graphics.TEXTURE_FORMAT_RGBA32F`
  - `graphics.TEXTURE_FORMAT_R16F`
  - `graphics.TEXTURE_FORMAT_RG16F`
  - `graphics.TEXTURE_FORMAT_R32F`
  - `graphics.TEXTURE_FORMAT_RG32F`
  You can test if the device supports these values by checking if a specific enum is nil or not:
  `if graphics.TEXTURE_FORMAT_RGBA16F ~= nil then
  -- it is safe to use this format
  end
  `
  `x`
  number optional x offset of the texture (in pixels)
  `y`
  number optional y offset of the texture (in pixels)
  `z`
  number optional z offset of the texture (in pixels). Only applies to 3D textures
  `page`
  number optional slice of the array texture. Only applies to 2D texture arrays. Zero-based
  `mipmap`
  number optional mipmap to upload the data to
  `compression_type`
  number optional specify the compression type for the data in the buffer object that holds the texture data. Defaults to graphics.COMPRESSION_TYPE_DEFAULT, i.e no compression. Supported values:
  - `COMPRESSION_TYPE_DEFAULT`
  - `COMPRESSION_TYPE_BASIS_UASTC`
     * @param buffer - The buffer of precreated pixel data
  To update a cube map texture you need to pass in six times the amount of data via the buffer, since a cube map has six sides!
  3D Textures are currently only supported on OpenGL and Vulkan adapters. To check if your device supports 3D textures, use:
  ```lua
  if graphics.TEXTURE_TYPE_3D ~= nil then
  -- Device and graphics adapter support 3D textures
  end
     */
    function set_texture(path: Hash | string, table: { type?: number; width?: number; height?: number; format?: number; x?: number; y?: number; z?: number; page?: number; mipmap?: number; compression_type?: number }, buffer: Opaque<"buffer">): void;
    /**
     * Constructor-like function with two purposes:
     * - Load the specified resource as part of loading the script
     * - Return a hash to the run-time version of the resource
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a path hash to the binary version of the resource
     */
    function texture(path?: string): Hash;
    /**
     * Constructor-like function with two purposes:
     * - Load the specified resource as part of loading the script
     * - Return a hash to the run-time version of the resource
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a path hash to the binary version of the resource
     */
    function tile_source(path?: string): Hash;
  }
}

export {};
