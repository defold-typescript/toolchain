/** @noSelfInFile */
import type { Hash, Opaque } from "../../src/core-types";

declare global {
  /**
   * Functions and constants to access resources.
   */
  namespace resource {
    /**
     * Animation data accepted when creating or updating an atlas. Specify either
     * `frames`, or both `frame_start` and `frame_end`.
     */
    interface Animation {
      /**
       * Animation id.
       */
      id: string;
      /**
       * Animation width.
       */
      width: number;
      /**
       * Animation height.
       */
      height: number;
      /**
       * Geometry indices for the animation frames.
       */
      frames?: number[];
      /**
       * First geometry index for the legacy contiguous frame range.
       */
      frame_start?: number;
      /**
       * Non-inclusive last geometry index for the legacy contiguous frame range.
       */
      frame_end?: number;
      /**
       * Playback mode. The default is `go.PLAYBACK_ONCE_FORWARD`.
       */
      playback?: go.Playback;
      /**
       * Animation frame rate. The default is 30.
       */
      fps?: number;
      /**
       * Whether to flip the animation vertically. The default is false.
       */
      flip_vertical?: boolean;
      /**
       * Whether to flip the animation horizontally. The default is false.
       */
      flip_horizontal?: boolean;
    }
    /**
     * Animation data returned by resource.get_atlas.
     */
    interface AnimationData {
      /**
       * Animation id.
       */
      id: string;
      /**
       * Animation width.
       */
      width: number;
      /**
       * Animation height.
       */
      height: number;
      /**
       * Geometry indices for the animation frames.
       */
      frames: number[];
      /**
       * Playback mode.
       */
      playback: go.Playback;
      /**
       * Animation frame rate.
       */
      fps: number;
      /**
       * Whether the animation is flipped vertically.
       */
      flip_vertical: boolean;
      /**
       * Whether the animation is flipped horizontally.
       */
      flip_horizontal: boolean;
    }
    /**
     * Data accepted by resource.create_atlas and resource.set_atlas.
     */
    interface Atlas {
      /**
       * Path to the texture resource, for example `"/main/my_texture.texturec"`.
       */
      texture: string | Hash;
      /**
       * Animations in the atlas.
       */
      animations: [Omit<resource.Animation, "frame_start" | "frame_end"> & ({ frames: [number, ...number[]] } | { frame_start: number; frame_end: number }), ...(Omit<resource.Animation, "frame_start" | "frame_end"> & ({ frames: [number, ...number[]] } | { frame_start: number; frame_end: number }))[]];
      /**
       * Geometries that map to the texture data.
       */
      geometries: [resource.Geometry, ...resource.Geometry[]];
    }
    /**
     * Data returned by resource.get_atlas.
     */
    interface AtlasData {
      /**
       * Path to the texture resource.
       */
      texture: string | Hash;
      /**
       * Animations in the atlas.
       */
      animations: resource.AnimationData[];
      /**
       * Geometries that map to the texture data.
       */
      geometries: resource.GeometryData[];
    }
    /**
     * Buffer-resource creation parameters
     */
    interface BufferCreationParams {
      /**
       * Buffer to bind to the resource.
       */
      buffer: Opaque<"buffer"> & { length: LuaLengthMethod<number> };
      /**
       * Whether the resource takes ownership of the buffer. The default is true.
       */
      transfer_ownership?: boolean;
    }
    /**
     * Buffer-resource update options
     */
    interface BufferUpdateOptions {
      /**
       * Whether the resource takes ownership of the buffer. The default is false.
       */
      transfer_ownership?: boolean;
    }
    /**
     * Geometry data accepted when creating or updating an atlas. Vertex, UV, and
     * index values are zero-based.
     */
    interface Geometry {
      /**
       * Geometry name, used when matching animations between atlases.
       */
      id?: string;
      /**
       * Width of the image represented by the geometry. If omitted, it is calculated from the vertices.
       */
      width?: number;
      /**
       * Height of the image represented by the geometry. If omitted, it is calculated from the vertices.
       */
      height?: number;
      /**
       * Horizontal pivot in unit coordinates. The default is 0.5.
       */
      pivot_x?: number;
      /**
       * Vertical pivot in unit coordinates. The default is 0.5.
       */
      pivot_y?: number;
      /**
       * Whether the image is rotated 90 degrees counter-clockwise in the atlas.
       */
      rotated?: boolean;
      /**
       * Vertex coordinates in image space as `{px0, py0, px1, py1, ...}`.
       */
      vertices: number[];
      /**
       * UV coordinates in image space as `{u0, v0, u1, v1, ...}`.
       */
      uvs: number[];
      /**
       * Geometry indices where each group of three entries represents a triangle.
       */
      indices: number[];
    }
    /**
     * Geometry data returned by resource.get_atlas.
     */
    interface GeometryData {
      /**
       * Width of the image represented by the geometry.
       */
      width: number;
      /**
       * Height of the image represented by the geometry.
       */
      height: number;
      /**
       * Horizontal pivot in unit coordinates.
       */
      pivot_x: number;
      /**
       * Vertical pivot in unit coordinates.
       */
      pivot_y: number;
      /**
       * Whether the image is rotated 90 degrees counter-clockwise in the atlas.
       */
      rotated: boolean;
      /**
       * Vertex coordinates in image space as `{px0, py0, px1, py1, ...}`.
       */
      vertices: number[];
      /**
       * UV coordinates in image space as `{u0, v0, u1, v1, ...}`.
       */
      uvs: number[];
      /**
       * Geometry indices where each group of three entries represents a triangle.
       */
      indices: number[];
    }
    /**
     * Render target attachment information
     */
    interface RenderTargetAttachmentInfo {
      /**
       * Opaque texture handle.
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
       * Number of mipmaps.
       */
      mipmaps: number;
      /**
       * Texture usage flags.
       */
      flags: graphics.TextureUsageFlag | number;
      /**
       * Texture type.
       */
      type: graphics.TextureType;
      /**
       * Render-target buffer type.
       */
      buffer_type: graphics.BufferType;
      /**
       * Backing texture resource, when present.
       */
      texture?: Hash;
    }
    /**
     * Render target information
     */
    interface RenderTargetInfo {
      /**
       * Opaque render-target handle.
       */
      handle: Opaque<"render_target">;
      /**
       * Effective sample count shared by all render-target attachments.
       */
      sample_count: number;
      /**
       * Render-target attachments.
       */
      attachments: resource.RenderTargetAttachmentInfo[];
    }
    /**
     * Sound-data creation options
     */
    interface SoundDataOptions {
      /**
       * Raw sound file data, including the file header.
       */
      data: string | Opaque<"buffer">;
      /**
       * Complete file size when `data` is partial.
       */
      filesize?: number;
      /**
       * Whether `data` contains only the initial file chunk.
       */
      partial?: boolean;
    }
    /**
     * Text metrics
     */
    interface TextMetrics {
      /**
       * Text width.
       */
      width: number;
      /**
       * Text height.
       */
      height: number;
      /**
       * Maximum ascent.
       */
      max_ascent: number;
      /**
       * Maximum descent.
       */
      max_descent: number;
    }
    /**
     * Text metric options
     */
    interface TextMetricsOptions {
      /**
       * Text-field width; unused when `line_break` is false.
       */
      width?: number;
      /**
       * Line leading. The default is 1.
       */
      leading?: number;
      /**
       * Character tracking. The default is 0.
       */
      tracking?: number;
      /**
       * Whether to account for line breaks. The default is false.
       */
      line_break?: boolean;
    }
    /**
     * Texture creation parameters
     */
    interface TextureCreationParams {
      /**
       * Texture type.
       */
      type: graphics.TextureType;
      /**
       * Texture width in pixels; must be greater than zero.
       */
      width: number;
      /**
       * Texture height in pixels; must be greater than zero.
       */
      height: number;
      /**
       * Texture depth; used by 3D texture types and must be greater than zero.
       */
      depth?: number;
      /**
       * Number of pages for a 2D array texture.
       */
      page_count?: number;
      /**
       * Texture format. Device-specific unsupported constants evaluate to `nil`.
       */
      format: graphics.TextureFormat;
      /**
       * Creation-usage hints. The default is graphics.TEXTURE_USAGE_FLAG_SAMPLE.
       */
      flags?: graphics.TextureUsageFlag | number;
      /**
       * Maximum mipmap count. The default is zero.
       */
      max_mipmaps?: number;
      /**
       * Compression used by the supplied buffer. The default is graphics.COMPRESSION_TYPE_DEFAULT.
       */
      compression_type?: graphics.CompressionType;
    }
    /**
     * Asynchronous texture creation result
     */
    interface TextureCreationResult {
      /**
       * Created texture resource path.
       */
      path: Hash;
    }
    /**
     * Texture information
     */
    interface TextureInfo {
      /**
       * Opaque texture handle.
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
       * Number of mipmaps.
       */
      mipmaps: number;
      /**
       * Texture usage flags.
       */
      flags: graphics.TextureUsageFlag | number;
      /**
       * Texture type.
       */
      type: graphics.TextureType;
    }
    /**
     * Texture update parameters
     */
    interface TextureUpdateParams {
      /**
       * Texture type.
       */
      type: graphics.TextureType;
      /**
       * Update width in pixels.
       */
      width: number;
      /**
       * Update height in pixels.
       */
      height: number;
      /**
       * Update depth for a 3D texture.
       */
      depth?: number;
      /**
       * Texture format. Device-specific unsupported constants evaluate to `nil`.
       */
      format: graphics.TextureFormat;
      /**
       * X offset in pixels.
       */
      x?: number;
      /**
       * Y offset in pixels.
       */
      y?: number;
      /**
       * Z offset for a 3D texture.
       */
      z?: number;
      /**
       * Zero-based page of a 2D array texture.
       */
      page?: number;
      /**
       * Mipmap level to update.
       */
      mipmap?: number;
      /**
       * Compression used by the supplied buffer. The default is graphics.COMPRESSION_TYPE_DEFAULT.
       */
      compression_type?: graphics.CompressionType;
    }
    /**
     * Constructor-like function with two purposes:
     *
     * - Load the specified resource as part of loading the script
     * - Create a resource reference that resolves to the hashed path of the run-time resource
     *
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a reference to the binary version of the resource
     * @example
     * Load an atlas and set it to a sprite:
     * ```ts
     * // Load an atlas and set it to a sprite:
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_atlas: resource.atlas("/atlas.atlas") },
     *
     *   init(self) {
     *     go.set("#sprite", "image", self.my_atlas);
     *   },
     * });
     * ```
     * @example
     * Load an atlas and set it to a gui:
     * ```ts
     * // Load an atlas and set it to a gui:
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_atlas: resource.atlas("/atlas.atlas") },
     *
     *   init(self) {
     *     go.set("#gui", "textures", self.my_atlas, { key: "my_atlas" });
     *   },
     * });
     * ```
     */
    function atlas(path?: string): Hash;
    /**
     * Constructor-like function with two purposes:
     *
     * - Load the specified resource as part of loading the script
     * - Create a resource reference that resolves to the hashed path of the run-time resource
     *
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a reference to the binary version of the resource
     * @example
     * ```ts
     * // Set a unique buffer it to a sprite:
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_buffer: resource.buffer("/cube.buffer") },
     *
     *   init(self) {
     *     go.set("#mesh", "vertices", self.my_buffer);
     *   },
     * });
     * ```
     */
    function buffer(path?: string): Hash;
    /**
     * Constructor-like function with two purposes:
     *
     * - Load the specified resource as part of loading the script
     * - Create a resource reference that resolves to the hashed path of the run-time resource
     *
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a reference to the binary version of the resource
     * @example
     * Load a font and set it to a label:
     * ```ts
     * // Load a font and set it to a label:
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_font: resource.font("/font.font") },
     *
     *   init(self) {
     *     go.set("#label", "font", self.my_font);
     *   },
     * });
     * ```
     * @example
     * Load a font and set it to a gui:
     * ```ts
     * // Load a font and set it to a gui:
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_font: resource.font("/font.font") },
     *
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
     * @returns atlas data. **⚠️ `frames` is 1-based; passed to Defold unchanged.** **0️⃣ `indices` is 0-based; passed to Defold unchanged.**
     */
    function get_atlas(path: Hash | string): resource.AtlasData;
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
     *     const res_path = go.get<mesh.Properties>()("#mesh", "vertices");
     *     const buf = resource.get_buffer(res_path);
     *     const stream_positions = buffer.get_stream(buf, "position");
     *
     *     for (let i = 0; i < stream_positions.length(); i++) {
     *       print(i, stream_positions[i]);
     *     }
     *   },
     * });
     * ```
     */
    function get_buffer(path: Hash | string): Opaque<"buffer"> & { length: LuaLengthMethod<number> };
    /**
     * Gets render target info from a render target resource path or a render target handle
     *
     * @param path - The path to the resource or a render target handle
     * @returns render-target information
     * @example
     * Get the metadata from a render target resource
     * ```ts
     * // Get the metadata from a render target resource
     * export default defineScript({
     *   init() {
     *     const info = resource.get_render_target_info("/my_render_target.render_targetc");
     *     // the info table contains meta data about all the render target attachments
     *     // so it's not necessary to use resource.get_texture here, but we do it here
     *     // just to show that it's possible:
     *     const info_attachment_1 = resource.get_texture_info(info.attachments[0]!.handle);
     *   },
     * });
     * ```
     * @example
     * Get a texture attachment from a render target and set it on a model component
     * ```ts
     * // Get a texture attachment from a render target and set it on a model component
     * export default defineScript({
     *   init() {
     *     const info = resource.get_render_target_info("/my_render_target.render_targetc");
     *     const attachment = info.attachments[0]!.texture!;
     *     // you can also get texture info from the 'texture' field, since it's a resource hash
     *     const texture_info = resource.get_texture_info(attachment);
     *     go.set("#model", "texture0", attachment);
     *   },
     * });
     * ```
     */
    function get_render_target_info(path: Hash | string | Opaque<"render_target"> | number): resource.RenderTargetInfo;
    /**
     * Gets the text metrics from a font. Rich text markup is measured using its
     * visible text and font sizes. If markup cannot be parsed, the text is measured literally.
     * Inline sprites reserve their specified dimensions, or one em by default.
     *
     * @param url - the font to get the (unscaled) metrics from
     * @param text - text to measure
     * @param options - optional text-metric options
     * @returns measured text metrics
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     const font = go.get<label.Properties>()("#label", "font");
     *     const metrics = resource.get_text_metrics(font, "The quick brown fox\n jumps over the lazy dog");
     *     pprint(metrics);
     *   },
     * });
     * ```
     */
    function get_text_metrics(url: Hash | string, text: string): resource.TextMetrics;
    /**
     * Gets the text metrics from a font. Rich text markup is measured using its
     * visible text and font sizes. If markup cannot be parsed, the text is measured literally.
     * Inline sprites reserve their specified dimensions, or one em by default.
     *
     * @param url - the font to get the (unscaled) metrics from
     * @param text - text to measure
     * @param options - optional text-metric options
     * @returns measured text metrics
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     const font = go.get<label.Properties>()("#label", "font");
     *     const metrics = resource.get_text_metrics(font, "The quick brown fox\n jumps over the lazy dog");
     *     pprint(metrics);
     *   },
     * });
     * ```
     */
    function get_text_metrics(url: Hash | string, text: string, options: resource.TextMetricsOptions): resource.TextMetrics;
    /**
     * Gets texture info from a texture resource path or a texture handle
     *
     * @param path - The path to the resource or a texture handle
     * @returns texture information
     * @example
     * Create a new texture and get the metadata from it
     * ```ts
     * // Create a new texture and get the metadata from it
     * export default defineScript({
     *   init() {
     *     // the engine registers a texture format only when the driver supports it
     *     const format = graphics.TEXTURE_FORMAT_RGBA;
     *     if (format === undefined) return;
     *     // create an empty texture
     *     const tparams = {
     *       width: 128,
     *       height: 128,
     *       type: graphics.TEXTURE_TYPE_2D,
     *       format,
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
     * ```
     * @example
     * Get the meta data from an atlas resource
     * ```ts
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
    function get_texture_info(path: Hash | string | Opaque<"texture"> | number): resource.TextureInfo;
    /**
     * Loads the resource data for a specific resource.
     *
     * @param path - The path to the resource
     * @returns Returns the buffer stored on disc
     * @example
     * ```ts
     * // read custom resource data into buffer
     * const buffer = resource.load("/resources/datafile");
     * ```
     * @example
     * In order for the engine to include custom resources in the build process, you need
     * to specify them in the "game.project" settings file:
     * ```ts
     * // [project]
     * // title = My project
     * // version = 0.1
     * // custom_resources = resources/,assets/level_data.json
     * ```
     */
    function load(path: string): Opaque<"buffer"> & { length: LuaLengthMethod<number> };
    /**
     * Constructor-like function with two purposes:
     *
     * - Load the specified resource as part of loading the script
     * - Create a resource reference that resolves to the hashed path of the run-time resource
     *
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a reference to the binary version of the resource
     * @example
     * Load a material and set it to a sprite:
     * ```ts
     * // Load a material and set it to a sprite:
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_material: resource.material("/material.material") },
     *
     *   init(self) {
     *     go.set("#sprite", "material", self.my_material);
     *   },
     * });
     * ```
     * @example
     * Load a material resource and update a named material with the resource:
     * ```ts
     * // Load a material resource and update a named material with the resource:
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_material: resource.material("/material.material") },
     *
     *   init(self) {
     *     go.set("#gui", "materials", self.my_material, { key: "my_material" });
     *   },
     * });
     * ```
     */
    function material(path?: string): Hash;
    /**
     * Constructor-like function with two purposes:
     *
     * - Load the specified resource as part of loading the script
     * - Create a resource reference that resolves to the hashed path of the run-time resource
     *
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a reference to the binary version of the resource
     * @example
     * ```ts
     * // Set a render target color attachment as a model texture:
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_render_target: resource.render_target("/rt.render_target") },
     *
     *   init(self) {
     *     const rt_info = resource.get_render_target_info(self.my_render_target);
     *     go.set("#model", "texture0", rt_info.attachments[0]!.texture!);
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
     * resource.set(go.get<sprite.Properties>()("#sprite", "texture0"), buffer);
     * ```
     */
    function set(path: string | Hash, buffer: Opaque<"buffer"> & { length: LuaLengthMethod<number> }): void;
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
     * @param table - atlas data. **⚠️ `frame_start` is 1-based; passed to Defold unchanged.** **⚠️ `frame_end` is 1-based; passed to Defold unchanged.** **⚠️ `frame_start` is 1-based; passed to Defold unchanged.** **⚠️ `frame_end` is 1-based; passed to Defold unchanged.** **⚠️ `frames` is 1-based; passed to Defold unchanged.** **0️⃣ `indices` is 0-based; passed to Defold unchanged.**
     * @example
     * Add a new animation to an existing atlas
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
     *       flip_vertical: false,
     *       flip_horizontal: false,
     *     };
     *     // set_atlas takes each animation's frames as a non-empty list
     *     const animations = data.animations.flatMap((animation) => {
     *       // an animation described by frame_start/frame_end passes through as-is
     *       if (!("frames" in animation)) return [animation];
     *       const [first, ...rest] = (animation.frames as number[] | undefined) ?? [];
     *       return first === undefined ? [] : [{ ...animation, frames: [first, ...rest] as [number, ...number[]] }];
     *     });
     *     // set_atlas needs at least one animation and one geometry
     *     const [first_geometry, ...geometries] = data.geometries;
     *     if (first_geometry !== undefined) {
     *       resource.set_atlas("/main/my_atlas.a.texturesetc", {
     *         ...data,
     *         animations: [my_animation, ...animations],
     *         geometries: [first_geometry, ...geometries],
     *       });
     *     }
     *   },
     * });
     * ```
     * @example
     * Sets atlas data for a 256x256 texture with a single animation being rendered as a quad
     * ```ts
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
     *     } satisfies Parameters<typeof resource.set_atlas>[1];
     *     resource.set_atlas("/main/test.a.texturesetc", params);
     *   },
     * });
     * ```
     */
    function set_atlas(path: Hash | string, table: resource.Atlas): void;
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
     * @param table - optional buffer-resource update options
     * @example
     * ```ts
     * // How to set the data from a buffer
     * function fill_stream(stream: { [index: number]: number }, verts: number[]) {
     *   verts.forEach((value, key) => {
     *     stream[key] = value;
     *   });
     * }
     *
     * export default defineScript({
     *   init() {
     *     const res_path = go.get<mesh.Properties>()("#mesh", "vertices");
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
    function set_buffer(path: Hash | string, buffer: Opaque<"buffer"> & { length: LuaLengthMethod<number> }, table?: resource.BufferUpdateOptions): void;
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
     * @param table - texture update parameters. **0️⃣ `page` is 0-based; passed to Defold unchanged.** **0️⃣ `mipmap` is 0-based; passed to Defold unchanged.**
     * @param buffer - The buffer of precreated pixel data
     * To update a cube map texture you need to pass in six times the amount of data via the buffer, since a cube map has six sides!
     * 3D textures are currently only supported on OpenGL and Vulkan adapters.
     * @example
     * Check whether a texture format is supported by the device:
     * ```ts
     * if (graphics.TEXTURE_FORMAT_RGBA16F !== undefined) {
     *   // It is safe to use this format.
     * }
     * ```
     * @example
     * Check whether the device supports 3D textures before using them:
     * ```ts
     * if (graphics.TEXTURE_TYPE_3D !== undefined) {
     *   // The device and graphics adapter support 3D textures.
     * }
     * ```
     * @example
     * How to set all pixels of an atlas
     * ```ts
     * // How to set all pixels of an atlas
     * export default defineScript({
     *   init() {
     *     const height = 128;
     *     const width = 128;
     *     const buf = buffer.create(width * height, [{ name: hash("rgb"), type: buffer.VALUE_TYPE_UINT8, count: 3 }]);
     *     const stream = buffer.get_stream(buf, hash("rgb"));
     *
     *     for (let y = 0; y < height; y++) {
     *       for (let x = 0; x < width; x++) {
     *         const index = y * width * 3 + x * 3;
     *         stream[index + 0] = 0xff;
     *         stream[index + 1] = 0x80;
     *         stream[index + 2] = 0x10;
     *       }
     *     }
     *
     *     // the engine registers a texture format only when the driver supports it
     *     const format = graphics.TEXTURE_FORMAT_RGB;
     *     if (format !== undefined) {
     *       const resource_path = go.get<model.Properties>()("#model", "texture0");
     *       const args = { width, height, type: graphics.TEXTURE_TYPE_2D, format, num_mip_maps: 1 };
     *       resource.set_texture(resource_path, args, buf);
     *     }
     *     return { buffer: buf, stream };
     *   },
     * });
     * ```
     * @example
     * How to update a specific region of an atlas by using the x,y values. Assumes the already set atlas is a 128x128 texture.
     * ```ts
     * // How to update a specific region of an atlas by using the x,y values. Assumes the already set atlas is a 128x128 texture.
     * export default defineScript({
     *   init() {
     *     const x = 16;
     *     const y = 16;
     *     const height = 128 - x * 2;
     *     const width = 128 - y * 2;
     *     const buf = buffer.create(width * height, [{ name: hash("rgb"), type: buffer.VALUE_TYPE_UINT8, count: 3 }]);
     *     const stream = buffer.get_stream(buf, hash("rgb"));
     *
     *     for (let row = 0; row < height; row++) {
     *       for (let col = 0; col < width; col++) {
     *         const index = row * width * 3 + col * 3;
     *         stream[index + 0] = 0xff;
     *         stream[index + 1] = 0x80;
     *         stream[index + 2] = 0x10;
     *       }
     *     }
     *
     *     // the engine registers a texture format only when the driver supports it
     *     const format = graphics.TEXTURE_FORMAT_RGB;
     *     if (format !== undefined) {
     *       const resource_path = go.get<model.Properties>()("#model", "texture0");
     *       const args = { width, height, x, y, type: graphics.TEXTURE_TYPE_2D, format, num_mip_maps: 1 };
     *       resource.set_texture(resource_path, args, buf);
     *     }
     *     return { buffer: buf, stream };
     *   },
     * });
     * ```
     * @example
     * Update a texture from a buffer resource
     * ```ts
     * // Update a texture from a buffer resource
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_buffer: resource.buffer("/my_default_buffer.buffer") },
     *
     *   init(self) {
     *     // the engine registers a texture format only when the driver supports it
     *     const format = graphics.TEXTURE_FORMAT_RGB;
     *     if (format === undefined) return;
     *     const resource_path = go.get<model.Properties>()("#model", "texture0");
     *     // the "my_buffer" resource is expected to hold 128 * 128 * 3 bytes!
     *     const args = {
     *       width: 128,
     *       height: 128,
     *       type: graphics.TEXTURE_TYPE_2D,
     *       format,
     *     };
     *     // Note that the extra resource.get_buffer call is a requirement here
     *     // since the "self.my_buffer" is just pointing to a buffer resource path
     *     // and not an actual buffer object or buffer resource.
     *     resource.set_texture(resource_path, args, resource.get_buffer(self.my_buffer));
     *   },
     * });
     * ```
     * @example
     * Update an existing 3D texture from a lua buffer
     * ```ts
     * // Update an existing 3D texture from a lua buffer
     * export default defineScript({
     *   init() {
     *     // the engine registers a texture type or format only when the driver supports it
     *     const type = graphics.TEXTURE_TYPE_IMAGE_3D;
     *     const format = graphics.TEXTURE_FORMAT_RGBA32F;
     *     if (type === undefined || format === undefined) return;
     *     // create a buffer that can hold the data of a 8x8x8 texture
     *     const tbuffer = buffer.create(8 * 8 * 8, [{ name: hash("rgba"), type: buffer.VALUE_TYPE_FLOAT32, count: 4 }]);
     *     const tstream = buffer.get_stream(tbuffer, hash("rgba"));
     *
     *     // populate the buffer with some data
     *     let index = 0;
     *     for (let z = 1; z <= 8; z++) {
     *       for (let y = 1; y <= 8; y++) {
     *         for (let x = 1; x <= 8; x++) {
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
     *       type,
     *       width: 8,
     *       height: 8,
     *       depth: 8,
     *       format,
     *     };
     *
     *     // This expects that the texture resource "/my_3d_texture.texturec" already exists
     *     // and is a 3D texture resource. To create a dynamic 3D texture resource
     *     // use the "resource.create_texture" function.
     *     resource.set_texture("/my_3d_texture.texturec", t_args, tbuffer);
     *   },
     * });
     * ```
     * @example
     * Update texture 2nd array page with loaded texture from png
     * ```ts
     * // Update texture 2nd array page with loaded texture from png
     * const tex_path = "/bundle_resources/page_02.png";
     * const [data] = sys.load_resource(tex_path);
     * // the engine registers a texture format only when the driver supports it
     * const format = graphics.TEXTURE_FORMAT_RGB;
     * if (data !== undefined && format !== undefined) {
     *   const buf = image.load_buffer(data);
     *   if (buf !== undefined) {
     *     // new_tex is the resource handle of a texture created via resource.create_texture
     *     const new_tex = resource.create_texture("/my_array_texture.texturec", {
     *       type: graphics.TEXTURE_TYPE_2D_ARRAY,
     *       width: buf.width,
     *       height: buf.height,
     *       page_count: 2,
     *       format,
     *     });
     *     resource.set_texture(
     *       new_tex,
     *       {
     *         type: graphics.TEXTURE_TYPE_2D_ARRAY,
     *         width: buf.width,
     *         height: buf.height,
     *         page: 1,
     *         format,
     *       },
     *       buf.buffer,
     *     );
     *     go.set("#mesh", "texture0", new_tex);
     *   }
     * }
     * ```
     */
    function set_texture(path: Hash | string, table: resource.TextureUpdateParams, buffer: Opaque<"buffer"> & { length: LuaLengthMethod<number> }): void;
    /**
     * Constructor-like function with two purposes:
     *
     * - Load the specified resource as part of loading the script
     * - Create a resource reference that resolves to the hashed path of the run-time resource
     *
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a reference to the binary version of the resource
     * @example
     * ```ts
     * // Load a texture and set it to a model:
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_texture: resource.texture("/texture.png") },
     *
     *   init(self) {
     *     go.set("#model", "texture0", self.my_texture);
     *   },
     * });
     * ```
     */
    function texture(path?: string): Hash;
    /**
     * Constructor-like function with two purposes:
     *
     * - Load the specified resource as part of loading the script
     * - Create a resource reference that resolves to the hashed path of the run-time resource
     *
     * This function can only be called within go.property function calls.
     *
     * @param path - optional resource path string to the resource
     * @returns a reference to the binary version of the resource
     * @example
     * ```ts
     * // Load tile source and set it to a tile map:
     * export default defineScript({
     *   // Never call `go.property` yourself: the transpiler emits the chunk-scope
     *   // registration from this field, and only this field types the property onto `self`.
     *   properties: { my_tile_source: resource.tile_source("/tilesource.tilesource") },
     *
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
