/** @noSelfInFile */
import type { Hash, Opaque } from "../src/core-types";

declare global {
  /**
   * Functions and constants to access resources.
   */
  namespace resource {
    /**
     * Constructor-like function with two purposes:
     * - Load the specified resource as part of loading the script
     * - Return a hash to the run-time version of the resource
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a path hash to the binary version of the resource
     * @example
     * ```ts
     * // Load an atlas and set it to a sprite:
     * go.property("my_atlas", resource.atlas("/atlas.atlas"));
     *
     * export default defineScript({
     *   init(self) {
     *     go.set("#sprite", "image", self.my_atlas);
     *   },
     * });
     *
     * // Load an atlas and set it to a gui:
     * go.property("my_atlas", resource.atlas("/atlas.atlas"));
     *
     * export default defineScript({
     *   init(self) {
     *     go.set("#gui", "textures", self.my_atlas, { key: "my_atlas" });
     *   },
     * });
     * ```
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
     * @example
     * ```ts
     * // Set a unique buffer it to a sprite:
     * go.property("my_buffer", resource.buffer("/cube.buffer"));
     *
     * export default defineScript({
     *   init(self) {
     *     go.set("#mesh", "vertices", self.my_buffer);
     *   },
     * });
     * ```
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
     * -
     * `texture`
     * string | hash the path to the texture resource, e.g "/main/my_texture.texturec"
     * -
     * `animations`
     * table a list of the animations in the atlas. Supports the following fields:
     * -
     * `id`
     * string the id of the animation, used in e.g sprite.play_animation
     * -
     * `width`
     * number the width of the animation
     * -
     * `height`
     * number the height of the animation
     * -
     * `frame_start`
     * number index to the first geometry of the animation. Indices are lua based and must be in the range of 1 .. in atlas.
     * -
     * `frame_end`
     * number index to the last geometry of the animation (non-inclusive). Indices are lua based and must be in the range of 1 .. in atlas.
     * -
     * `playback`
     * constant optional playback mode of the animation, the default value is go.PLAYBACK_ONCE_FORWARD
     * -
     * `fps`
     * number optional fps of the animation, the default value is 30
     * -
     * `flip_vertical`
     * boolean optional flip the animation vertically, the default value is false
     * -
     * `flip_horizontal`
     * boolean optional flip the animation horizontally, the default value is false
     * -
     * `geometries`
     * table A list of the geometries that should map to the texture data. Supports the following fields:
     * -
     * `id`
     * string The name of the geometry. Used when matching animations between multiple atlases
     * -
     * `width`
     * number The width of the image the sprite geometry represents
     * -
     * `height`
     * number The height of the image the sprite geometry represents
     * -
     * `pivot_x`
     * number The pivot x value of the image in unit coords. (0,0) is upper left corner, (1,1) is bottom right. Default is 0.5.
     * -
     * `pivot_y`
     * number The pivot y value of the image in unit coords. (0,0) is upper left corner, (1,1) is bottom right. Default is 0.5.
     * -
     * `rotated`
     * boolean Whether the image is rotated 90 degrees counter-clockwise in the atlas. This affects UV coordinate generation for proper rendering. Default is false.
     * -
     * `vertices`
     * table a list of the vertices in image space of the geometry in the form {px0, py0, px1, py1, ..., pxn, pyn}
     * -
     * `uvs`
     * table a list of the uv coordinates in image space of the geometry in the form of {u0, v0, u1, v1, ..., un, vn}.
     * -
     * `indices`
     * table a list of the indices of the geometry in the form {i0, i1, i2, ..., in}. Each tripe in the list represents a triangle.
     * @returns Returns the atlas resource path
     * @example
     * ```ts
     * // Create a backing texture and an atlas
     * export default defineScript({
     *   init() {
     *     // create an empty texture
     *     const tparams = {
     *       width: 128,
     *       height: 128,
     *       type: graphics.TEXTURE_TYPE_2D,
     *       format: graphics.TEXTURE_FORMAT_RGBA,
     *     };
     *     const my_texture_id = resource.create_texture("/my_texture.texturec", tparams);
     *
     *     // optionally use resource.set_texture to upload data to texture
     *
     *     // create an atlas with one animation and one square geometry
     *     // note that the function doesn't support hashes for the texture,
     *     // you need to use a string for the texture path here aswell
     *     const aparams = {
     *       texture: "/my_texture.texturec",
     *       animations: [
     *         {
     *           id: "my_animation",
     *           width: 128,
     *           height: 128,
     *           frames: [1],
     *         },
     *       ],
     *       geometries: [
     *         {
     *           id: "idle0",
     *           width: 128,
     *           height: 128,
     *           pivot_x: 0.5,
     *           pivot_y: 0.5,
     *           vertices: [0, 0, 0, 128, 128, 128, 128, 0],
     *           uvs: [0, 0, 0, 128, 128, 128, 128, 0],
     *           indices: [0, 1, 2, 0, 2, 3],
     *         },
     *       ],
     *     };
     *     const my_atlas_id = resource.create_atlas("/my_atlas.texturesetc", aparams);
     *
     *     // assign the atlas to the 'sprite' component on the same go
     *     go.set("#sprite", "image", my_atlas_id);
     *   },
     * });
     * ```
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
     * -
     * `buffer`
     * buffer the buffer to bind to this resource
     * -
     * `transfer_ownership`
     * boolean optional flag to determine wether or not the resource should take over ownership of the buffer object (default true)
     * @returns Returns the buffer resource path
     * @example
     * ```ts
     * // Create a buffer object and bind it to a buffer resource
     * export default defineScript({
     *   init() {
     *     const size = 1;
     *     const positions = [
     *       // triangle 1
     *       size, size, 0,
     *       -size, -size, 0,
     *       size, -size, 0,
     *       // triangle 2
     *       size, size, 0,
     *       -size, size, 0,
     *       -size, -size, 0,
     *     ];
     *
     *     const buffer_handle = buffer.create(positions.length, [
     *       {
     *         name: hash("position"),
     *         type: buffer.VALUE_TYPE_FLOAT32,
     *         count: 3,
     *       },
     *     ]);
     *
     *     const stream = buffer.get_stream(buffer_handle, hash("position"));
     *
     *     // transfer vertex data to buffer
     *     for (let k = 0; k < positions.length; k++) {
     *       stream[k] = positions[k];
     *     }
     *
     *     const my_buffer = resource.create_buffer("/my_buffer.bufferc", { buffer: buffer_handle });
     *     go.set("/go#mesh", "vertices", my_buffer);
     *   },
     * });
     *
     * // Create a buffer resource from existing resource
     * export default defineScript({
     *   init() {
     *     const res = resource.get_buffer("/my_buffer_path.bufferc");
     *     // create a cloned buffer resource from another resource buffer
     *     const buf = resource.create_buffer("/my_cloned_buffer.bufferc", { buffer: res });
     *     // assign cloned buffer to a mesh component
     *     go.set("/go#mesh", "vertices", buf);
     *   },
     * });
     * ```
     */
    function create_buffer(path: string, table?: { buffer?: Opaque<"buffer">; transfer_ownership?: boolean }): Hash;
    /**
     * Creates a sound data resource
     * Supported formats are .oggc, .opusc and .wavc
     *
     * @param path - the path to the resource. Must not already exist.
     * @param options - A table containing parameters for the text. Supported entries:
     * `data`
     * string The raw data of the file. May be partial, but must include the header of the file
     * `filesize`
     * number If the file is partial, it must also specify the full size of the complete file.
     * `partial`
     * boolean Is the data not representing the full file, but just the initial chunk?
     * @returns the resulting path hash to the resource
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     // create a new sound resource, given the initial chunk of the file
     *     const relative_path = "/a/unique/resource/name.oggc";
     *     const hash = resource.create_sound_data(relative_path, { data, filesize, partial: true });
     *     go.set("#music", "sound", hash); // override the previous sound resource
     *     sound.play("#music"); // start the playing
     *   },
     * });
     * ```
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
     * `type`
     * number The texture type. Supported values:
     * - `graphics.TEXTURE_TYPE_2D`
     * - `graphics.TEXTURE_TYPE_IMAGE_2D`
     * - `graphics.TEXTURE_TYPE_3D`
     * - `graphics.TEXTURE_TYPE_IMAGE_3D`
     * - `graphics.TEXTURE_TYPE_CUBE_MAP`
     * `width`
     * number The width of the texture (in pixels). Must be larger than 0.
     * `height`
     * number The width of the texture (in pixels). Must be larger than 0.
     * `depth`
     * number The depth of the texture (in pixels). Must be larger than 0. Only used when `type` is `graphics.TEXTURE_TYPE_3D` or `graphics.TEXTURE_TYPE_IMAGE_3D`.
     * `format`
     * number The texture format, note that some of these formats might not be supported by the running device. Supported values:
     * - `graphics.TEXTURE_FORMAT_LUMINANCE`
     * - `graphics.TEXTURE_FORMAT_RGB`
     * - `graphics.TEXTURE_FORMAT_RGBA`
     * These constants might not be available on the device:
     * - `graphics.TEXTURE_FORMAT_RGB_PVRTC_2BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGB_PVRTC_4BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGB_ETC1`
     * - `graphics.TEXTURE_FORMAT_RGBA_ETC2`
     * - `graphics.TEXTURE_FORMAT_RGBA_ASTC_4X4`
     * - `graphics.TEXTURE_FORMAT_RGB_BC1`
     * - `graphics.TEXTURE_FORMAT_RGBA_BC3`
     * - `graphics.TEXTURE_FORMAT_R_BC4`
     * - `graphics.TEXTURE_FORMAT_RG_BC5`
     * - `graphics.TEXTURE_FORMAT_RGBA_BC7`
     * - `graphics.TEXTURE_FORMAT_RGB16F`
     * - `graphics.TEXTURE_FORMAT_RGB32F`
     * - `graphics.TEXTURE_FORMAT_RGBA16F`
     * - `graphics.TEXTURE_FORMAT_RGBA32F`
     * - `graphics.TEXTURE_FORMAT_R16F`
     * - `graphics.TEXTURE_FORMAT_RG16F`
     * - `graphics.TEXTURE_FORMAT_R32F`
     * - `graphics.TEXTURE_FORMAT_RG32F`
     * You can test if the device supports these values by checking if a specific enum is nil or not:
     * `if graphics.TEXTURE_FORMAT_RGBA16F ~= nil then
     * -- it is safe to use this format
     * end
     * `
     * `flags`
     * number Texture creation flags that can be used to dictate how the texture is created. The default value is graphics.TEXTURE_USAGE_FLAG_SAMPLE, which means that the texture can be sampled from a shader.
     * These flags may or may not be supported on the running device and/or the underlying graphics API and is simply used internally as a 'hint' when creating the texture. There is no guarantee that any of these will have any effect. Supported values:
     * - `graphics.TEXTURE_USAGE_FLAG_SAMPLE` - The texture can be sampled from a shader (default)
     * - `graphics.TEXTURE_USAGE_FLAG_MEMORYLESS` - The texture can be used as a memoryless texture, i.e only transient memory for the texture is used during rendering
     * - `graphics.TEXTURE_USAGE_FLAG_STORAGE` - The texture can be used as a storage texture, which is required for a shader to write to the texture
     * `max_mipmaps`
     * number optional max number of mipmaps. Defaults to zero, i.e no mipmap support
     * `compression_type`
     * number optional specify the compression type for the data in the buffer object that holds the texture data. Will only be used when a compressed buffer has been passed into the function.
     * Creating an empty texture with no buffer data is not supported as a core feature. Defaults to graphics.COMPRESSION_TYPE_DEFAULT, i.e no compression. Supported values:
     * - `COMPRESSION_TYPE_DEFAULT`
     * - `COMPRESSION_TYPE_BASIS_UASTC`
     * @param buffer - optional buffer of precreated pixel data
     * @returns The path to the resource.
     * 3D Textures are currently only supported on OpenGL and Vulkan adapters. To check if your device supports 3D textures, use:
     * ```lua
     * if graphics.TEXTURE_TYPE_3D ~= nil then
     * -- Device and graphics adapter support 3D textures
     * end
     * @example
     * ```ts
     * // How to create an 128x128 RGBA texture resource and assign it to a model
     * export default defineScript({
     *   init() {
     *     const tparams = {
     *       width: 128,
     *       height: 128,
     *       type: graphics.TEXTURE_TYPE_2D,
     *       format: graphics.TEXTURE_FORMAT_RGBA,
     *     };
     *     const my_texture_id = resource.create_texture("/my_custom_texture.texturec", tparams);
     *     go.set("#model", "texture0", my_texture_id);
     *   },
     * });
     *
     * // How to create an 128x128 floating point texture (RGBA32F) resource from a buffer object
     * export default defineScript({
     *   init() {
     *     // Create a new buffer with 4 components and FLOAT32 type
     *     const tbuffer = buffer.create(128 * 128, [{ name: hash("rgba"), type: buffer.VALUE_TYPE_FLOAT32, count: 4 }]);
     *     const tstream = buffer.get_stream(tbuffer, hash("rgba"));
     *
     *     // Fill the buffer stream with some float values
     *     for (let y = 0; y < 128; y++) {
     *       for (let x = 0; x < 128; x++) {
     *         const index = y * 128 * 4 + x * 4;
     *         tstream[index + 0] = 999.0;
     *         tstream[index + 1] = -1.0;
     *         tstream[index + 2] = 0.5;
     *         tstream[index + 3] = 1.0;
     *       }
     *     }
     *
     *     // Create a 2D Texture with a RGBA23F format
     *     const tparams = {
     *       width: 128,
     *       height: 128,
     *       type: graphics.TEXTURE_TYPE_2D,
     *       format: graphics.TEXTURE_FORMAT_RGBA32F,
     *     };
     *
     *     // Note that we pass the buffer as the last argument here!
     *     const my_texture_id = resource.create_texture("/my_custom_texture.texturec", tparams, tbuffer);
     *
     *     // assign the texture to a model
     *     go.set("#model", "texture0", my_texture_id);
     *   },
     * });
     *
     * // How to create a 32x32x32 floating point 3D texture that can be used to generate volumetric data in a compute shader
     * export default defineScript({
     *   init() {
     *     const t_volume = resource.create_texture("/my_backing_texture.texturec", {
     *       type: graphics.TEXTURE_TYPE_IMAGE_3D,
     *       width: 32,
     *       height: 32,
     *       depth: 32,
     *       format: resource.TEXTURE_FORMAT_RGBA32F,
     *       flags: resource.TEXTURE_USAGE_FLAG_STORAGE + resource.TEXTURE_USAGE_FLAG_SAMPLE,
     *     });
     *
     *     // pass the backing texture to the render script
     *     msg.post("@render:", "add_textures", [t_volume]);
     *   },
     * });
     *
     * // How to create 512x512 texture array with 5 pages.
     * const new_tex = resource.create_texture("/runtime/example_array.texturec", {
     *   type: graphics.TEXTURE_TYPE_2D_ARRAY,
     *   width: 512,
     *   height: 512,
     *   page_count: 5,
     *   format: graphics.TEXTURE_FORMAT_RGB,
     * });
     * ```
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
     * `type`
     * number The texture type. Supported values:
     * - `graphics.TEXTURE_TYPE_2D`
     * - `graphics.TEXTURE_TYPE_IMAGE_2D`
     * - `graphics.TEXTURE_TYPE_3D`
     * - `graphics.TEXTURE_TYPE_IMAGE_3D`
     * - `graphics.TEXTURE_TYPE_CUBE_MAP`
     * `width`
     * number The width of the texture (in pixels). Must be larger than 0.
     * `height`
     * number The width of the texture (in pixels). Must be larger than 0.
     * `depth`
     * number The depth of the texture (in pixels). Must be larger than 0. Only used when `type` is `graphics.TEXTURE_TYPE_3D` or `graphics.TEXTURE_TYPE_IMAGE_3D`.
     * `format`
     * number The texture format, note that some of these formats might not be supported by the running device. Supported values:
     * - `graphics.TEXTURE_FORMAT_LUMINANCE`
     * - `graphics.TEXTURE_FORMAT_RGB`
     * - `graphics.TEXTURE_FORMAT_RGBA`
     * These constants might not be available on the device:
     * - `graphics.TEXTURE_FORMAT_RGB_PVRTC_2BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGB_PVRTC_4BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGB_ETC1`
     * - `graphics.TEXTURE_FORMAT_RGBA_ETC2`
     * - `graphics.TEXTURE_FORMAT_RGBA_ASTC_4X4`
     * - `graphics.TEXTURE_FORMAT_RGB_BC1`
     * - `graphics.TEXTURE_FORMAT_RGBA_BC3`
     * - `graphics.TEXTURE_FORMAT_R_BC4`
     * - `graphics.TEXTURE_FORMAT_RG_BC5`
     * - `graphics.TEXTURE_FORMAT_RGBA_BC7`
     * - `graphics.TEXTURE_FORMAT_RGB16F`
     * - `graphics.TEXTURE_FORMAT_RGB32F`
     * - `graphics.TEXTURE_FORMAT_RGBA16F`
     * - `graphics.TEXTURE_FORMAT_RGBA32F`
     * - `graphics.TEXTURE_FORMAT_R16F`
     * - `graphics.TEXTURE_FORMAT_RG16F`
     * - `graphics.TEXTURE_FORMAT_R32F`
     * - `graphics.TEXTURE_FORMAT_RG32F`
     * You can test if the device supports these values by checking if a specific enum is nil or not:
     * `if graphics.TEXTURE_FORMAT_RGBA16F ~= nil then
     * -- it is safe to use this format
     * end
     * `
     * `flags`
     * number Texture creation flags that can be used to dictate how the texture is created. Supported values:
     * - `graphics.TEXTURE_USAGE_FLAG_SAMPLE` - The texture can be sampled from a shader (default)
     * - `graphics.TEXTURE_USAGE_FLAG_MEMORYLESS` - The texture can be used as a memoryless texture, i.e only transient memory for the texture is used during rendering
     * - `graphics.TEXTURE_USAGE_FLAG_STORAGE` - The texture can be used as a storage texture, which is required for a shader to write to the texture
     * `max_mipmaps`
     * number optional max number of mipmaps. Defaults to zero, i.e no mipmap support
     * `compression_type`
     * number optional specify the compression type for the data in the buffer object that holds the texture data. Will only be used when a compressed buffer has been passed into the function.
     * Creating an empty texture with no buffer data is not supported as a core feature. Defaults to graphics.COMPRESSION_TYPE_DEFAULT, i.e no compression. Supported values:
     * - `COMPRESSION_TYPE_DEFAULT`
     * - `COMPRESSION_TYPE_BASIS_UASTC`
     * @param buffer - optional buffer of precreated pixel data
     * @param callback - callback function when texture is created (self, request_id, resource)
     * @example
     * ```ts
     * // Create a texture resource asyncronously with a buffer and a callback
     * function callback(self, request_id, resource) {
     *   // The resource has been updated with a new texture,
     *   // so we can update other systems with the new handle,
     *   // or update components to use the resource if we want
     *   const tinfo = resource.get_texture_info(resource);
     *   msg.post("@render:", "set_backing_texture", tinfo.handle);
     * }
     *
     * export default defineScript({
     *   init() {
     *     // Create a texture resource async
     *     const tparams = {
     *       width: 128,
     *       height: 128,
     *       type: graphics.TEXTURE_TYPE_2D,
     *       format: graphics.TEXTURE_FORMAT_RGBA,
     *     };
     *
     *     // Create a new buffer with 4 components
     *     const tbuffer = buffer.create(tparams.width * tparams.height, [{ name: hash("rgba"), type: buffer.VALUE_TYPE_UINT8, count: 4 }]);
     *     const tstream = buffer.get_stream(tbuffer, hash("rgba"));
     *
     *     // Fill the buffer stream with some float values
     *     for (let y = 0; y < tparams.width; y++) {
     *       for (let x = 0; x < tparams.height; x++) {
     *         const index = y * 128 * 4 + x * 4;
     *         tstream[index + 0] = 255;
     *         tstream[index + 1] = 0;
     *         tstream[index + 2] = 255;
     *         tstream[index + 3] = 255;
     *       }
     *     }
     *     // create the texture
     *     const [tpath, request_id] = resource.create_texture_async("/my_texture.texturec", tparams, tbuffer, callback);
     *     // at this point you can use the resource as-is, but note that the texture will be a blank 1x1 texture
     *     // that will be removed once the new texture has been updated
     *     go.set("#model", "texture0", tpath);
     *   },
     * });
     *
     * // Create a texture resource asyncronously without a callback
     * export default defineScript({
     *   init() {
     *     // Create a texture resource async
     *     const tparams = {
     *       width: 128,
     *       height: 128,
     *       type: graphics.TEXTURE_TYPE_2D,
     *       format: graphics.TEXTURE_FORMAT_RGBA,
     *     };
     *
     *     // Create a new buffer with 4 components
     *     const tbuffer = buffer.create(tparams.width * tparams.height, [{ name: hash("rgba"), type: buffer.VALUE_TYPE_UINT8, count: 4 }]);
     *     const tstream = buffer.get_stream(tbuffer, hash("rgba"));
     *
     *     // Fill the buffer stream with some float values
     *     for (let y = 0; y < tparams.width; y++) {
     *       for (let x = 0; x < tparams.height; x++) {
     *         const index = y * 128 * 4 + x * 4;
     *         tstream[index + 0] = 255;
     *         tstream[index + 1] = 0;
     *         tstream[index + 2] = 255;
     *         tstream[index + 3] = 255;
     *       }
     *     }
     *     // create the texture
     *     const [tpath, request_id] = resource.create_texture_async("/my_texture.texturec", tparams, tbuffer);
     *     // at this point you can use the resource as-is, but note that the texture will be a blank 1x1 texture
     *     // that will be removed once the new texture has been updated
     *     go.set("#model", "texture0", tpath);
     *   },
     * });
     * ```
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
     * @example
     * ```ts
     * // Load a font and set it to a label:
     * go.property("my_font", resource.font("/font.font"));
     *
     * export default defineScript({
     *   init(self) {
     *     go.set("#label", "font", self.my_font);
     *   },
     * });
     *
     * // Load a font and set it to a gui:
     * go.property("my_font", resource.font("/font.font"));
     *
     * export default defineScript({
     *   init(self) {
     *     go.set("#gui", "fonts", self.my_font, { key: "my_font" });
     *   },
     * });
     * ```
     */
    function font(path?: string): Hash;
    /**
     * Returns the atlas data for an atlas
     *
     * @param path - The path to the atlas resource
     * @returns A table with the following entries:
     * - texture
     * - geometries
     * - animations
     * Each animation entry also contains a `frames` table with indices into
     * `geometries`, preserving the frame-to-geometry mapping used by the atlas.
     * See resource.set_atlas for a detailed description of each field
     */
    function get_atlas(path: Hash | string): { texture: string | Hash; animations: { id: string; width: number; height: number; frame_start: number; frame_end: number; playback: Opaque<"constant">; fps: number; flip_vertical: boolean; flip_horizontal: boolean }[]; geometries: Record<string | number, unknown> };
    /**
     * gets the buffer from a resource
     *
     * @param path - The path to the resource
     * @returns The resource buffer
     * @example
     * ```ts
     * // How to get the data from a buffer
     * export default defineScript({
     *   init() {
     *     const res_path = go.get("#mesh", "vertices");
     *     const buf = resource.get_buffer(res_path);
     *     const stream_positions = buffer.get_stream(buf, "position");
     *
     *     for (let i = 0; i < stream_positions.length; i++) {
     *       print(i, stream_positions[i]);
     *     }
     *   },
     * });
     * ```
     */
    function get_buffer(path: Hash | string): Opaque<"buffer">;
    /**
     * Gets render target info from a render target resource path or a render target handle
     *
     * @param path - The path to the resource or a render target handle
     * @returns A table containing info about the render target:
     * `handle`
     * number the opaque handle to the texture resource
     * 'attachments'
     * table a table of attachments, where each attachment contains the following entries:
     * `width`
     * number width of the texture
     * `height`
     * number height of the texture
     * `depth`
     * number depth of the texture (i.e 1 for a 2D texture and 6 for a cube map)
     * `mipmaps`
     * number number of mipmaps of the texture
     * `type`
     * number The texture type. Supported values:
     * - `graphics.TEXTURE_TYPE_2D`
     * - `graphics.TEXTURE_TYPE_CUBE_MAP`
     * - `graphics.TEXTURE_TYPE_2D_ARRAY`
     * `buffer_type`
     * number The attachment buffer type. Supported values:
     * - `resource.BUFFER_TYPE_COLOR0`
     * - `resource.BUFFER_TYPE_COLOR1`
     * - `resource.BUFFER_TYPE_COLOR2`
     * - `resource.BUFFER_TYPE_COLOR3`
     * - `resource.BUFFER_TYPE_DEPTH`
     * -
     * `resource.BUFFER_TYPE_STENCIL`
     * -
     * `texture`
     * hash The hashed path to the attachment texture resource. This field is only available if the render target passed in is a resource.
     * @example
     * ```ts
     * // Get the metadata from a render target resource
     * export default defineScript({
     *   init() {
     *     const info = resource.get_render_target_info("/my_render_target.render_targetc");
     *     // the info table contains meta data about all the render target attachments
     *     // so it's not necessary to use resource.get_texture here, but we do it here
     *     // just to show that it's possible:
     *     const info_attachment_1 = resource.get_texture_info(info.attachments[0].handle);
     *   },
     * });
     *
     * // Get a texture attachment from a render target and set it on a model component
     * export default defineScript({
     *   init() {
     *     const info = resource.get_render_target_info("/my_render_target.render_targetc");
     *     const attachment = info.attachments[0].texture;
     *     // you can also get texture info from the 'texture' field, since it's a resource hash
     *     const texture_info = resource.get_texture_info(attachment);
     *     go.set("#model", "texture0", attachment);
     *   },
     * });
     * ```
     */
    function get_render_target_info(path: Hash | string | number): { handle: number; width: number; height: number; depth: number; mipmaps: number; type: number; buffer_type: number; texture: Hash };
    /**
     * Gets the text metrics from a font
     *
     * @param url - the font to get the (unscaled) metrics from
     * @param text - text to measure
     * @param options - A table containing parameters for the text. Supported entries:
     * `width`
     * number The width of the text field. Not used if `line_break` is false.
     * `leading`
     * number The leading (default 1.0)
     * `tracking`
     * number The tracking (default 0.0)
     * `line_break`
     * boolean If the calculation should consider line breaks (default false)
     * @returns a table with the following fields:
     * - width
     * - height
     * - max_ascent
     * - max_descent
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     const font = go.get("#label", "font");
     *     const metrics = resource.get_text_metrics(font, "The quick brown fox\n jumps over the lazy dog");
     *     pprint(metrics);
     *   },
     * });
     * ```
     */
    function get_text_metrics(url: Hash, text: string, options?: { width?: number; leading?: number; tracking?: number; line_break?: boolean }): Record<string | number, unknown>;
    /**
     * Gets texture info from a texture resource path or a texture handle
     *
     * @param path - The path to the resource or a texture handle
     * @returns A table containing info about the texture:
     * `handle`
     * number the opaque handle to the texture resource
     * `width`
     * number width of the texture
     * `height`
     * number height of the texture
     * `depth`
     * number depth of the texture (i.e 1 for a 2D texture, 6 for a cube map, the actual depth of a 3D texture)
     * `page_count`
     * number number of pages of the texture array. For 2D texture value is 1. For cube map - 6
     * `mipmaps`
     * number number of mipmaps of the texture
     * `flags`
     * number usage hints of the texture.
     * `type`
     * number The texture type. Supported values:
     * - `graphics.TEXTURE_TYPE_2D`
     * - `graphics.TEXTURE_TYPE_2D_ARRAY`
     * - `graphics.TEXTURE_TYPE_IMAGE_2D`
     * - `graphics.TEXTURE_TYPE_3D`
     * - `graphics.TEXTURE_TYPE_IMAGE_3D`
     * - `graphics.TEXTURE_TYPE_CUBE_MAP`
     * @example
     * ```ts
     * // Create a new texture and get the metadata from it
     * export default defineScript({
     *   init() {
     *     // create an empty texture
     *     const tparams = {
     *       width: 128,
     *       height: 128,
     *       type: graphics.TEXTURE_TYPE_2D,
     *       format: graphics.TEXTURE_FORMAT_RGBA,
     *     };
     *
     *     const my_texture_path = resource.create_texture("/my_texture.texturec", tparams);
     *     const my_texture_info = resource.get_texture_info(my_texture_path);
     *
     *     // my_texture_info now contains
     *     // {
     *     //      handle = <the-numeric-handle>,
     *     //      width = 128,
     *     //      height = 128,
     *     //      depth = 1
     *     //      mipmaps = 1,
     *     //      page_count = 1,
     *     //      type = graphics.TEXTURE_TYPE_2D,
     *     //      flags = graphics.TEXTURE_USAGE_FLAG_SAMPLE
     *     // }
     *   },
     * });
     *
     * // Get the meta data from an atlas resource
     * export default defineScript({
     *   init() {
     *     const my_atlas_info = resource.get_atlas("/my_atlas.a.texturesetc");
     *     const my_texture_info = resource.get_texture_info(my_atlas_info.texture);
     *
     *     // my_texture_info now contains the information about the texture that is backing the atlas
     *   },
     * });
     * ```
     */
    function get_texture_info(path: Hash | string | number): { handle: number; width: number; height: number; depth: number; page_count: number; mipmaps: number; flags: number; type: number };
    /**
     * Loads the resource data for a specific resource.
     *
     * @param path - The path to the resource
     * @returns Returns the buffer stored on disc
     * @example
     * ```ts
     * // read custom resource data into buffer
     * const buffer = resource.load("/resources/datafile");
     *
     * // In order for the engine to include custom resources in the build process, you
     * // need to specify them in the "game.project" settings file:
     * // [project]
     * // title = My project
     * // version = 0.1
     * // custom_resources = resources/,assets/level_data.json
     * ```
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
     * @example
     * ```ts
     * // Load a material and set it to a sprite:
     * go.property("my_material", resource.material("/material.material"));
     *
     * export default defineScript({
     *   init(self) {
     *     go.set("#sprite", "material", self.my_material);
     *   },
     * });
     *
     * // Load a material resource and update a named material with the resource:
     * go.property("my_material", resource.material("/material.material"));
     *
     * export default defineScript({
     *   init(self) {
     *     go.set("#gui", "materials", self.my_material, { key: "my_material" });
     *   },
     * });
     * ```
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
     * @example
     * ```ts
     * // Set a render target color attachment as a model texture:
     * go.property("my_render_target", resource.render_target("/rt.render_target"));
     *
     * export default defineScript({
     *   init(self) {
     *     const rt_info = resource.get_render_target_info(self.my_render_target);
     *     go.set("#model", "texture0", rt_info.attachments[0].texture);
     *   },
     * });
     * ```
     */
    function render_target(path?: string): Hash;
    /**
     * Sets the resource data for a specific resource
     *
     * @param path - The path to the resource
     * @param buffer - The buffer of precreated data, suitable for the intended resource type
     * @example
     * ```ts
     * // Assuming the folder "/res" is added to the project custom resources:
     * // load a texture resource and set it on a sprite
     * const buffer = resource.load("/res/new.texturec");
     * resource.set(go.get("#sprite", "texture0"), buffer);
     * ```
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
     * -
     * `texture`
     * string | hash the path to the texture resource, e.g "/main/my_texture.texturec"
     * -
     * `animations`
     * table a list of the animations in the atlas. Supports the following fields:
     * -
     * `id`
     * string the id of the animation, used in e.g sprite.play_animation
     * -
     * `width`
     * number the width of the animation
     * -
     * `height`
     * number the height of the animation
     * -
     * `frame_start`
     * number index to the first geometry of the animation. Indices are lua based and must be in the range of 1 .. in atlas.
     * -
     * `frame_end`
     * number index to the last geometry of the animation (non-inclusive). Indices are lua based and must be in the range of 1 .. in atlas.
     * -
     * `playback`
     * constant optional playback mode of the animation, the default value is go.PLAYBACK_ONCE_FORWARD
     * -
     * `fps`
     * number optional fps of the animation, the default value is 30
     * -
     * `flip_vertical`
     * boolean optional flip the animation vertically, the default value is false
     * -
     * `flip_horizontal`
     * boolean optional flip the animation horizontally, the default value is false
     * -
     * `geometries`
     * table A list of the geometries that should map to the texture data. Supports the following fields:
     * -
     * `vertices`
     * table a list of the vertices in texture space of the geometry in the form {px0, py0, px1, py1, ..., pxn, pyn}
     * -
     * `uvs`
     * table a list of the uv coordinates in texture space of the geometry in the form of {u0, v0, u1, v1, ..., un, vn}
     * -
     * `indices`
     * table a list of the indices of the geometry in the form {i0, i1, i2, ..., in}. Each tripe in the list represents a triangle.
     * @example
     * ```ts
     * // Add a new animation to an existing atlas
     * export default defineScript({
     *   init() {
     *     const data = resource.get_atlas("/main/my_atlas.a.texturesetc");
     *     const my_animation = {
     *       id: "my_new_animation",
     *       width: 128,
     *       height: 128,
     *       frame_start: 1,
     *       frame_end: 6,
     *       playback: go.PLAYBACK_LOOP_PINGPONG,
     *       fps: 8,
     *     };
     *     data.animations.push(my_animation);
     *     resource.set_atlas("/main/my_atlas.a.texturesetc", data);
     *   },
     * });
     *
     * // Sets atlas data for a 256x256 texture with a single animation being rendered as a quad
     * export default defineScript({
     *   init() {
     *     const params = {
     *       texture: "/main/my_256x256_texture.texturec",
     *       animations: [
     *         {
     *           id: "my_animation",
     *           width: 256,
     *           height: 256,
     *           frames: [1],
     *         },
     *       ],
     *       geometries: [
     *         {
     *           vertices: [0, 0, 0, 256, 256, 256, 256, 0],
     *           uvs: [0, 0, 0, 256, 256, 256, 256, 0],
     *           indices: [0, 1, 2, 0, 2, 3],
     *         },
     *       ],
     *     };
     *     resource.set_atlas("/main/test.a.texturesetc", params);
     *   },
     * });
     * ```
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
     * -
     * `transfer_ownership`
     * boolean optional flag to determine wether or not the resource should take over ownership of the buffer object (default false)
     * @example
     * ```ts
     * // How to set the data from a buffer
     * function fill_stream(stream, verts) {
     *   verts.forEach((value, key) => {
     *     stream[key] = verts[key];
     *   });
     * }
     *
     * export default defineScript({
     *   init() {
     *     const res_path = go.get("#mesh", "vertices");
     *
     *     const positions = [
     *       1, -1, 0,
     *       1, 1, 0,
     *       -1, -1, 0,
     *     ];
     *
     *     const num_verts = positions.length / 3;
     *
     *     // create a new buffer
     *     let buf = buffer.create(num_verts, [{ name: hash("position"), type: buffer.VALUE_TYPE_FLOAT32, count: 3 }]);
     *
     *     buf = resource.get_buffer(res_path);
     *     const stream_positions = buffer.get_stream(buf, "position");
     *
     *     fill_stream(stream_positions, positions);
     *
     *     resource.set_buffer(res_path, buf);
     *   },
     * });
     * ```
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
     * `type`
     * number The texture type. Supported values:
     * - `graphics.TEXTURE_TYPE_2D`
     * - `graphics.TEXTURE_TYPE_IMAGE_2D`
     * - `graphics.TEXTURE_TYPE_3D`
     * - `graphics.TEXTURE_TYPE_IMAGE_3D`
     * - `graphics.TEXTURE_TYPE_CUBE_MAP`
     * `width`
     * number The width of the texture (in pixels)
     * `height`
     * number The width of the texture (in pixels)
     * `format`
     * number The texture format, note that some of these formats are platform specific. Supported values:
     * - `graphics.TEXTURE_FORMAT_LUMINANCE`
     * - `graphics.TEXTURE_FORMAT_RGB`
     * - `graphics.TEXTURE_FORMAT_RGBA`
     * These constants might not be available on the device:
     * - `graphics.TEXTURE_FORMAT_RGB_PVRTC_2BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGB_PVRTC_4BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_2BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGBA_PVRTC_4BPPV1`
     * - `graphics.TEXTURE_FORMAT_RGB_ETC1`
     * - `graphics.TEXTURE_FORMAT_RGBA_ETC2`
     * - `graphics.TEXTURE_FORMAT_RGBA_ASTC_4X4`
     * - `graphics.TEXTURE_FORMAT_RGB_BC1`
     * - `graphics.TEXTURE_FORMAT_RGBA_BC3`
     * - `graphics.TEXTURE_FORMAT_R_BC4`
     * - `graphics.TEXTURE_FORMAT_RG_BC5`
     * - `graphics.TEXTURE_FORMAT_RGBA_BC7`
     * - `graphics.TEXTURE_FORMAT_RGB16F`
     * - `graphics.TEXTURE_FORMAT_RGB32F`
     * - `graphics.TEXTURE_FORMAT_RGBA16F`
     * - `graphics.TEXTURE_FORMAT_RGBA32F`
     * - `graphics.TEXTURE_FORMAT_R16F`
     * - `graphics.TEXTURE_FORMAT_RG16F`
     * - `graphics.TEXTURE_FORMAT_R32F`
     * - `graphics.TEXTURE_FORMAT_RG32F`
     * You can test if the device supports these values by checking if a specific enum is nil or not:
     * `if graphics.TEXTURE_FORMAT_RGBA16F ~= nil then
     * -- it is safe to use this format
     * end
     * `
     * `x`
     * number optional x offset of the texture (in pixels)
     * `y`
     * number optional y offset of the texture (in pixels)
     * `z`
     * number optional z offset of the texture (in pixels). Only applies to 3D textures
     * `page`
     * number optional slice of the array texture. Only applies to 2D texture arrays. Zero-based
     * `mipmap`
     * number optional mipmap to upload the data to
     * `compression_type`
     * number optional specify the compression type for the data in the buffer object that holds the texture data. Defaults to graphics.COMPRESSION_TYPE_DEFAULT, i.e no compression. Supported values:
     * - `COMPRESSION_TYPE_DEFAULT`
     * - `COMPRESSION_TYPE_BASIS_UASTC`
     * @param buffer - The buffer of precreated pixel data
     * To update a cube map texture you need to pass in six times the amount of data via the buffer, since a cube map has six sides!
     * 3D Textures are currently only supported on OpenGL and Vulkan adapters. To check if your device supports 3D textures, use:
     * ```lua
     * if graphics.TEXTURE_TYPE_3D ~= nil then
     * -- Device and graphics adapter support 3D textures
     * end
     * @example
     * ```ts
     * // How to set all pixels of an atlas
     * export default defineScript({
     *   init(self) {
     *     self.height = 128;
     *     self.width = 128;
     *     self.buffer = buffer.create(self.width * self.height, [{ name: hash("rgb"), type: buffer.VALUE_TYPE_UINT8, count: 3 }]);
     *     self.stream = buffer.get_stream(self.buffer, hash("rgb"));
     *
     *     for (let y = 0; y < self.height; y++) {
     *       for (let x = 0; x < self.width; x++) {
     *         const index = y * self.width * 3 + x * 3;
     *         self.stream[index + 0] = 0xff;
     *         self.stream[index + 1] = 0x80;
     *         self.stream[index + 2] = 0x10;
     *       }
     *     }
     *
     *     const resource_path = go.get("#model", "texture0");
     *     const args = { width: self.width, height: self.height, type: graphics.TEXTURE_TYPE_2D, format: graphics.TEXTURE_FORMAT_RGB, num_mip_maps: 1 };
     *     resource.set_texture(resource_path, args, self.buffer);
     *   },
     * });
     *
     * // How to update a specific region of an atlas by using the x,y values. Assumes the already set atlas is a 128x128 texture.
     * export default defineScript({
     *   init(self) {
     *     self.x = 16;
     *     self.y = 16;
     *     self.height = 128 - self.x * 2;
     *     self.width = 128 - self.y * 2;
     *     self.buffer = buffer.create(self.width * self.height, [{ name: hash("rgb"), type: buffer.VALUE_TYPE_UINT8, count: 3 }]);
     *     self.stream = buffer.get_stream(self.buffer, hash("rgb"));
     *
     *     for (let y = 0; y < self.height; y++) {
     *       for (let x = 0; x < self.width; x++) {
     *         const index = y * self.width * 3 + x * 3;
     *         self.stream[index + 0] = 0xff;
     *         self.stream[index + 1] = 0x80;
     *         self.stream[index + 2] = 0x10;
     *       }
     *     }
     *
     *     const resource_path = go.get("#model", "texture0");
     *     const args = { width: self.width, height: self.height, x: self.x, y: self.y, type: graphics.TEXTURE_TYPE_2D, format: graphics.TEXTURE_FORMAT_RGB, num_mip_maps: 1 };
     *     resource.set_texture(resource_path, args, self.buffer);
     *   },
     * });
     *
     * // Update a texture from a buffer resource
     * go.property("my_buffer", resource.buffer("/my_default_buffer.buffer"));
     *
     * export default defineScript({
     *   init(self) {
     *     const resource_path = go.get("#model", "texture0");
     *     // the "my_buffer" resource is expected to hold 128 * 128 * 3 bytes!
     *     const args = {
     *       width: 128,
     *       height: 128,
     *       type: graphics.TEXTURE_TYPE_2D,
     *       format: graphics.TEXTURE_FORMAT_RGB,
     *     };
     *     // Note that the extra resource.get_buffer call is a requirement here
     *     // since the "self.my_buffer" is just pointing to a buffer resource path
     *     // and not an actual buffer object or buffer resource.
     *     resource.set_texture(resource_path, args, resource.get_buffer(self.my_buffer));
     *   },
     * });
     *
     * // Update an existing 3D texture from a buffer
     * export default defineScript({
     *   init() {
     *     // create a buffer that can hold the data of a 8x8x8 texture
     *     const tbuffer = buffer.create(8 * 8 * 8, [{ name: hash("rgba"), type: buffer.VALUE_TYPE_FLOAT32, count: 4 }]);
     *     const tstream = buffer.get_stream(tbuffer, hash("rgba"));
     *
     *     // populate the buffer with some data
     *     let index = 0;
     *     for (let z = 0; z < 8; z++) {
     *       for (let y = 0; y < 8; y++) {
     *         for (let x = 0; x < 8; x++) {
     *           tstream[index + 0] = x;
     *           tstream[index + 1] = y;
     *           tstream[index + 2] = z;
     *           tstream[index + 3] = 1.0;
     *           index = index + 4;
     *         }
     *       }
     *     }
     *
     *     const t_args = {
     *       type: graphics.TEXTURE_TYPE_IMAGE_3D,
     *       width: 8,
     *       height: 8,
     *       depth: 8,
     *       format: resource.TEXTURE_FORMAT_RGBA32F,
     *     };
     *
     *     // This expects that the texture resource "/my_3d_texture.texturec" already exists
     *     // and is a 3D texture resource. To create a dynamic 3D texture resource
     *     // use the "resource.create_texture" function.
     *     resource.set_texture("/my_3d_texture.texturec", t_args, tbuffer);
     *   },
     * });
     *
     * // Update texture 2nd array page with loaded texture from png
     * // new_tex is resource handle of texture which was created via resource.create_resource
     * const tex_path = "/bundle_resources/page_02.png";
     * const [data] = sys.load_resource(tex_path);
     * const buf = image.load_buffer(data);
     * resource.set_texture(
     *   new_tex,
     *   {
     *     type: graphics.TEXTURE_TYPE_2D_ARRAY,
     *     width: buf.width,
     *     height: buf.height,
     *     page: 1,
     *     format: graphics.TEXTURE_FORMAT_RGB,
     *   },
     *   buf.buffer,
     * );
     * go.set("#mesh", "texture0", new_tex);
     * ```
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
     * @example
     * ```ts
     * // Load a texture and set it to a model:
     * go.property("my_texture", resource.texture("/texture.png"));
     *
     * export default defineScript({
     *   init(self) {
     *     go.set("#model", "texture0", self.my_texture);
     *   },
     * });
     * ```
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
     * @example
     * ```ts
     * // Load tile source and set it to a tile map:
     * go.property("my_tile_source", resource.tile_source("/tilesource.tilesource"));
     *
     * export default defineScript({
     *   init(self) {
     *     go.set("#tilemap", "tile_source", self.my_tile_source);
     *   },
     * });
     * ```
     */
    function tile_source(path?: string): Hash;
  }
}

export {};
