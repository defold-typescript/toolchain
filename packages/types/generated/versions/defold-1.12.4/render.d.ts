/** @noSelfInFile */
import type { Hash, Matrix4, Opaque, Url, Vector4 } from "../../../src/core-types";

declare global {
  /**
   * Rendering functions, messages and constants. The "render" namespace is
   * accessible only from render scripts.
   *
   * The rendering API was originally built on top of OpenGL ES 2.0, and it uses a subset of the
   * OpenGL computer graphics rendering API for rendering 2D and 3D computer
   * graphics. Our current target is OpenGLES 3.0 with fallbacks to 2.0 on some platforms.
   *
   * [icon:attention] It is possible to create materials and write shaders that
   * require features not in OpenGL ES 2.0, but those will not work cross platform.
   */
  namespace render {
    type constant_buffer = Opaque<"constant_buffer">;
    type render_target = Opaque<"render_target">;
    type texture = Opaque<"texture">;
    const FRUSTUM_PLANES_ALL: number & { readonly __brand: "render.FRUSTUM_PLANES_ALL" };
    const FRUSTUM_PLANES_SIDES: number & { readonly __brand: "render.FRUSTUM_PLANES_SIDES" };
    const RENDER_TARGET_DEFAULT: number & { readonly __brand: "render.RENDER_TARGET_DEFAULT" };
    /**
     * Depth sort far-to-near (default; good for transparent passes).
     */
    const SORT_BACK_TO_FRONT: number & { readonly __brand: "render.SORT_BACK_TO_FRONT" };
    /**
     * Depth sort near-to-far (good for opaque passes to reduce overdraw).
     */
    const SORT_FRONT_TO_BACK: number & { readonly __brand: "render.SORT_FRONT_TO_BACK" };
    /**
     * No per-call sorting; draw entries in insertion order.
     */
    const SORT_NONE: number & { readonly __brand: "render.SORT_NONE" };
    /**
     * Clear buffers in the currently enabled render target with specified value. If the render target has been created with multiple
     * color attachments, all buffers will be cleared with the same value.
     *
     * @param buffers - table with keys specifying which buffers to clear and values set to clear values. Available keys are:
     *
     * - `graphics.BUFFER_TYPE_COLOR0_BIT`
     *
     * - `graphics.BUFFER_TYPE_DEPTH_BIT`
     *
     * - `graphics.BUFFER_TYPE_STENCIL_BIT`
     * @example
     * ```ts
     * // Clear the color buffer and the depth buffer.
     * render.clear({
     *   [graphics.BUFFER_TYPE_COLOR0_BIT]: vmath.vector4(0, 0, 0, 0),
     *   [graphics.BUFFER_TYPE_DEPTH_BIT]: 1,
     * });
     * ```
     */
    function clear(buffers: LuaMap<number, number | Vector4>): void;
    /**
     * Constant buffers are used to set shader program variables and are optionally passed to the `render.draw()` function.
     * The buffer's constant elements can be indexed like an ordinary Lua table, but you can't iterate over them with pairs() or ipairs().
     *
     * @returns new constant buffer
     * @example
     * ```ts
     * // Set a "tint" constant in a constant buffer in the render script:
     * const constants = render.constant_buffer();
     * constants.tint = vmath.vector4(1, 1, 1, 1);
     *
     * // Then use the constant buffer when drawing a predicate:
     * render.draw(self.my_pred, { constants });
     *
     * // The constant buffer also supports array values by specifying constants in an array:
     * const constants2 = render.constant_buffer();
     * constants2.light_colors = [];
     * constants2.light_colors[0] = vmath.vector4(1, 0, 0, 1);
     * constants2.light_colors[1] = vmath.vector4(0, 1, 0, 1);
     * constants2.light_colors[2] = vmath.vector4(0, 0, 1, 1);
     *
     * // You can also create the array by passing the vectors directly:
     * const constants3 = render.constant_buffer();
     * constants3.light_colors = [
     *   vmath.vector4(1, 0, 0, 1),
     *   vmath.vector4(0, 1, 0, 1),
     *   vmath.vector4(0, 0, 1, 1),
     * ];
     *
     * // Add more constants to the array
     * constants3.light_colors[3] = vmath.vector4(1, 1, 1, 1);
     * ```
     */
    function constant_buffer(): Opaque<"constant_buffer">;
    /**
     * Deletes a render target created by a render script.
     * You cannot delete a render target resource.
     *
     * @param render_target - render target to delete
     * @example
     * ```ts
     * // How to delete a render target:
     * render.delete_render_target(self.my_render_target);
     * ```
     */
    function delete_render_target(render_target: Opaque<"render_target">): void;
    /**
     * If a material is currently enabled, disable it.
     * The name of the material must be specified in the ".render" resource set
     * in the "game.project" setting.
     *
     * @example
     * ```ts
     * // Enable material named "glow", then draw my_pred with it.
     * render.enable_material("glow");
     * render.draw(self.my_pred);
     * render.disable_material();
     * ```
     */
    function disable_material(): void;
    /**
     * Disables a render state.
     *
     * @param state - state to disable
     *
     * - `graphics.STATE_DEPTH_TEST`
     *
     * - `graphics.STATE_STENCIL_TEST`
     *
     * - `graphics.STATE_BLEND`
     *
     * - `graphics.STATE_ALPHA_TEST` ( not available on iOS and Android)
     *
     * - `graphics.STATE_CULL_FACE`
     *
     * - `graphics.STATE_POLYGON_OFFSET_FILL`
     * @example
     * ```ts
     * // Disable face culling when drawing the tile predicate:
     * render.disable_state(graphics.STATE_CULL_FACE);
     * render.draw(self.tile_pred);
     * ```
     */
    function disable_state(state: Opaque<"constant">): void;
    /**
     * Disables a texture that has previourly been enabled.
     *
     * @param binding - texture binding, either by texture unit, string or hash that should be disabled
     * @example
     * ```ts
     * export default defineScript({
     *   update(self, dt) {
     *     render.enable_texture(0, self.my_render_target, graphics.BUFFER_TYPE_COLOR0_BIT);
     *     // draw a predicate with the render target available as texture 0 in the predicate
     *     // material shader.
     *     render.draw(self.my_pred);
     *     // done, disable the texture
     *     render.disable_texture(0);
     *   },
     * });
     * ```
     */
    function disable_texture(binding: Opaque<"texture"> | string | Hash): void;
    /**
     * Dispatches the currently enabled compute program. The dispatch call takes three arguments x,y,z which constitutes
     * the 'global working group' of the compute dispatch. Together with the 'local working group' specified in the compute shader
     * as a layout qualifier, these two sets of parameters forms the number of invocations the compute shader will execute.
     * An optional constant buffer can be provided to override the default constants. If no constants buffer is provided, a default
     * system constants buffer is used containing constants as defined in the compute program.
     *
     * @param x - global work group size X
     * @param y - global work group size Y
     * @param z - global work group size Z
     * @param options - optional table with properties:
     *
     * `constants`
     * constant_buffer optional constants to use while rendering
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     const color_params = {
     *       format: graphics.TEXTURE_FORMAT_RGBA,
     *       width: render.get_window_width(),
     *       height: render.get_window_height(),
     *     };
     *     return {
     *       scene_rt: render.render_target({ [graphics.BUFFER_TYPE_COLOR0_BIT]: color_params }),
     *     };
     *   },
     *
     *   update(self, dt) {
     *     render.set_compute("bloom");
     *     render.enable_texture(0, self.backing_texture);
     *     render.enable_texture(1, self.scene_rt);
     *     render.dispatch_compute(128, 128, 1);
     *     render.set_compute();
     *   },
     * });
     *
     * // Dispatch a compute program with a constant buffer:
     * const constants = render.constant_buffer();
     * constants.tint = vmath.vector4(1, 1, 1, 1);
     * render.dispatch_compute(32, 32, 32, { constants });
     * ```
     */
    function dispatch_compute(x: number, y: number, z: number, options?: { constants?: Opaque<"constant_buffer"> }): void;
    /**
     * Draws all objects that match a specified predicate. An optional constant buffer can be
     * provided to override the default constants. If no constants buffer is provided, a default
     * system constants buffer is used containing constants as defined in materials and set through
     * go.set (or particlefx.set_constant) on visual components.
     *
     * @param predicate - predicate to draw for
     * @param options - optional table with properties:
     *
     * `frustum`
     * matrix4 A frustum matrix used to cull renderable items. (E.g. `local frustum = proj * view`). default=nil
     * `frustum_planes`
     * int Determines which sides of the frustum will be used. Default is render.FRUSTUM_PLANES_SIDES.
     *
     * - render.FRUSTUM_PLANES_SIDES : The left, right, top and bottom sides of the frustum.
     *
     * - render.FRUSTUM_PLANES_ALL : All 6 sides of the frustum.
     *
     * `constants`
     * constant_buffer optional constants to use while rendering
     * `sort_order`
     * int How to sort draw order for world-ordered entries. Default uses the renderer's preferred world sorting (back-to-front).
     * @example
     * ```ts
     * export default defineScript({
     *   init() {
     *     // define a predicate matching anything with material tag "my_tag"
     *     return { my_pred: render.predicate([hash("my_tag")]) };
     *   },
     *
     *   update(self, dt) {
     *     // draw everything in the my_pred predicate
     *     render.draw(self.my_pred);
     *   },
     * });
     *
     * // Draw predicate with constants:
     * const constants = render.constant_buffer();
     * constants.tint = vmath.vector4(1, 1, 1, 1);
     * render.draw(self.my_pred, { constants });
     *
     * // Draw with predicate and frustum culling (without near+far planes):
     * const frustum = self.proj.mul(self.view);
     * render.draw(self.my_pred, { frustum });
     *
     * // Draw with predicate and frustum culling (with near+far planes):
     * const frustum2 = self.proj.mul(self.view);
     * render.draw(self.my_pred, { frustum: frustum2, frustum_planes: render.FRUSTUM_PLANES_ALL });
     * ```
     */
    function draw(predicate: number, options?: { frustum?: Matrix4; frustum_planes?: number; constants?: Opaque<"constant_buffer">; sort_order?: number }): void;
    /**
     * Draws all 3d debug graphics such as lines drawn with "draw_line" messages and physics visualization.
     *
     * @param options - optional table with properties:
     *
     * `frustum`
     * matrix4 A frustum matrix used to cull renderable items. (E.g. `local frustum = proj * view`). May be nil.
     * `frustum_planes`
     * int Determines which sides of the frustum will be used. Default is render.FRUSTUM_PLANES_SIDES.
     *
     * - render.FRUSTUM_PLANES_SIDES : The left, right, top and bottom sides of the frustum.
     *
     * - render.FRUSTUM_PLANES_ALL : All sides of the frustum.
     * @example
     * ```ts
     * export default defineScript({
     *   update(self, dt) {
     *     // draw debug visualization
     *     render.draw_debug3d();
     *   },
     * });
     * ```
     */
    function draw_debug3d(options?: { frustum?: Matrix4; frustum_planes?: number }): void;
    /**
     * If another material was already enabled, it will be automatically disabled
     * and the specified material is used instead.
     * The name of the material must be specified in the ".render" resource set
     * in the "game.project" setting.
     *
     * @param material_id - material id to enable
     * @example
     * ```ts
     * // Enable material named "glow", then draw my_pred with it.
     * render.enable_material("glow");
     * render.draw(self.my_pred);
     * render.disable_material();
     * ```
     */
    function enable_material(material_id: string | Hash): void;
    /**
     * Enables a particular render state. The state will be enabled until disabled.
     *
     * @param state - state to enable
     *
     * - `graphics.STATE_DEPTH_TEST`
     *
     * - `graphics.STATE_STENCIL_TEST`
     *
     * - `graphics.STATE_BLEND`
     *
     * - `graphics.STATE_ALPHA_TEST` ( not available on iOS and Android)
     *
     * - `graphics.STATE_CULL_FACE`
     *
     * - `graphics.STATE_POLYGON_OFFSET_FILL`
     * @example
     * ```ts
     * // Enable stencil test when drawing the gui predicate, then disable it:
     * render.enable_state(graphics.STATE_STENCIL_TEST);
     * render.draw(self.gui_pred);
     * render.disable_state(graphics.STATE_STENCIL_TEST);
     * ```
     */
    function enable_state(state: Opaque<"constant">): void;
    /**
     * Sets the specified texture handle for a render target attachment or a regular texture
     * that should be used for rendering. The texture can be bound to either a texture unit
     * or to a sampler name by a hash or a string.
     * A texture can be bound to multiple units and sampler names at the same time,
     * the actual binding will be applied to the shaders when a shader program is bound.
     * When mixing binding using both units and sampler names, you might end up in situations
     * where two different textures will be applied to the same bind location in the shader.
     * In this case, the texture set to the named sampler will take precedence over the unit.
     * Note that you can bind multiple sampler names to the same texture, in case you want to reuse
     * the same texture for differnt use-cases. It is however recommended that you use the same name
     * everywhere for the textures that should be shared across different materials.
     *
     * @param binding - texture binding, either by texture unit, string or hash for the sampler name that the texture should be bound to
     * @param handle_or_name - render target or texture handle that should be bound, or a named resource in the "Render Resource" table in the currently assigned .render file
     * @param buffer_type - optional buffer type from which to enable the texture. Note that this argument only applies to render targets. Defaults to `graphics.BUFFER_TYPE_COLOR0_BIT`. These values are supported:
     *
     * - `graphics.BUFFER_TYPE_COLOR0_BIT`
     *
     * If The render target has been created as depth and/or stencil textures, these buffer types can be used:
     *
     * - `graphics.BUFFER_TYPE_DEPTH_BIT`
     *
     * - `graphics.BUFFER_TYPE_STENCIL_BIT`
     *
     * If the render target has been created with multiple color attachments, these buffer types can be used
     * to enable those textures as well. Currently 4 color attachments are supported:
     *
     * - `graphics.BUFFER_TYPE_COLOR0_BIT`
     *
     * - `graphics.BUFFER_TYPE_COLOR1_BIT`
     *
     * - `graphics.BUFFER_TYPE_COLOR2_BIT`
     *
     * - `graphics.BUFFER_TYPE_COLOR3_BIT`
     * @example
     * ```ts
     * export default defineScript({
     *   update(self, dt) {
     *     // enable target so all drawing is done to it
     *     render.set_render_target(self.my_render_target);
     *
     *     // draw a predicate to the render target
     *     render.draw(self.my_pred);
     *
     *     // disable target
     *     render.set_render_target(render.RENDER_TARGET_DEFAULT);
     *
     *     render.enable_texture(0, self.my_render_target, graphics.BUFFER_TYPE_COLOR0_BIT);
     *     // draw a predicate with the render target available as texture 0 in the predicate
     *     // material shader.
     *     render.draw(self.my_pred);
     *   },
     * });
     *
     * // Or enable a render target by resource id:
     * export default defineScript({
     *   update(self, dt) {
     *     render.set_render_target("my_rt_resource");
     *     render.draw(self.my_pred);
     *     render.set_render_target(render.RENDER_TARGET_DEFAULT);
     *
     *     render.enable_texture(0, "my_rt_resource", graphics.BUFFER_TYPE_COLOR0_BIT);
     *     // draw a predicate with the render target available as texture 0 in the predicate
     *     // material shader.
     *     render.draw(self.my_pred);
     *   },
     * });
     *
     * // Or bind a texture handle directly:
     * export default defineScript({
     *   update(self, dt) {
     *     // bind a texture to the texture unit 0
     *     render.enable_texture(0, self.my_texture_handle);
     *     // bind the same texture to a named sampler
     *     render.enable_texture("my_texture_sampler", self.my_texture_handle);
     *   },
     * });
     * ```
     */
    function enable_texture(binding: number | string | Hash, handle_or_name: Opaque<"texture"> | string | Hash, buffer_type?: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR0_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR1_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR2_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR3_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_DEPTH_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_STENCIL_BIT" }): void;
    /**
     * Returns the logical window height that is set in the "game.project" settings.
     * Note that the actual window pixel size can change, either by device constraints
     * or user input.
     *
     * @returns specified window height
     * @example
     * ```ts
     * // Get the height of the window
     * const h = render.get_height();
     * ```
     */
    function get_height(): number;
    /**
     * Returns the specified buffer height from a render target.
     *
     * @param render_target - render target from which to retrieve the buffer height
     * @param buffer_type - which type of buffer to retrieve the height from
     *
     * - `graphics.BUFFER_TYPE_COLOR0_BIT`
     *
     * - `graphics.BUFFER_TYPE_DEPTH_BIT`
     *
     * - `graphics.BUFFER_TYPE_STENCIL_BIT`
     * @returns the height of the render target buffer texture
     * @example
     * ```ts
     * // get the height of the render target color buffer
     * const h = render.get_render_target_height(self.target_right, graphics.BUFFER_TYPE_COLOR0_BIT);
     * // get the height of a render target resource
     * const w = render.get_render_target_height("my_rt_resource", graphics.BUFFER_TYPE_COLOR0_BIT);
     * ```
     */
    function get_render_target_height(render_target: Opaque<"render_target">, buffer_type: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR0_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR1_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR2_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR3_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_DEPTH_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_STENCIL_BIT" }): number;
    /**
     * Returns the specified buffer width from a render target.
     *
     * @param render_target - render target from which to retrieve the buffer width
     * @param buffer_type - which type of buffer to retrieve the width from
     *
     * - `graphics.BUFFER_TYPE_COLOR0_BIT`
     *
     * - `graphics.BUFFER_TYPE_COLOR[x]_BIT` (x: [0..3], if supported!)
     *
     * - `graphics.BUFFER_TYPE_DEPTH_BIT`
     *
     * - `graphics.BUFFER_TYPE_STENCIL_BIT`
     * @returns the width of the render target buffer texture
     * @example
     * ```ts
     * // get the width of the render target color buffer
     * const w = render.get_render_target_width(self.target_right, graphics.BUFFER_TYPE_COLOR0_BIT);
     * // get the width of a render target resource
     * const w2 = render.get_render_target_width("my_rt_resource", graphics.BUFFER_TYPE_COLOR0_BIT);
     * ```
     */
    function get_render_target_width(render_target: Opaque<"render_target">, buffer_type: number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR0_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR1_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR2_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_COLOR3_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_DEPTH_BIT" } | number & { readonly __brand: "graphics.BUFFER_TYPE_STENCIL_BIT" }): number;
    /**
     * Returns the logical window width that is set in the "game.project" settings.
     * Note that the actual window pixel size can change, either by device constraints
     * or user input.
     *
     * @returns specified window width (number)
     * @example
     * ```ts
     * // Get the width of the window.
     * const w = render.get_width();
     * ```
     */
    function get_width(): number;
    /**
     * Returns the actual physical window height.
     * Note that this value might differ from the logical height that is set in the
     * "game.project" settings.
     *
     * @returns actual window height
     * @example
     * ```ts
     * // Get the actual height of the window
     * const h = render.get_window_height();
     * ```
     */
    function get_window_height(): number;
    /**
     * Returns the actual physical window width.
     * Note that this value might differ from the logical width that is set in the
     * "game.project" settings.
     *
     * @returns actual window width
     * @example
     * ```ts
     * // Get the actual width of the window
     * const w = render.get_window_width();
     * ```
     */
    function get_window_width(): number;
    /**
     * This function returns a new render predicate for objects with materials matching
     * the provided material tags. The provided tags are combined into a bit mask
     * for the predicate. If multiple tags are provided, the predicate matches materials
     * with all tags ANDed together.
     * The current limit to the number of tags that can be defined is `64`.
     *
     * @param tags - table of tags that the predicate should match. The tags can be of either hash or string type
     * @returns new predicate
     * @example
     * ```ts
     * // Create a new render predicate containing all visual objects that
     * // have a material with material tags "opaque" AND "smoke".
     * const p = render.predicate([hash("opaque"), hash("smoke")]);
     * ```
     */
    function predicate(tags: (string | Hash)[]): number;
    /**
     * Creates a new render target according to the supplied
     * specification table.
     * The table should contain keys specifying which buffers should be created
     * with what parameters. Each buffer key should have a table value consisting
     * of parameters. The following parameter keys are available:
     *
     * Key
     * Values
     *
     * `format`
     * `graphics.TEXTURE_FORMAT_LUMINANCE`
     * `graphics.TEXTURE_FORMAT_RGB`
     * `graphics.TEXTURE_FORMAT_RGBA`
     * `graphics.TEXTURE_FORMAT_DEPTH`
     * `graphics.TEXTURE_FORMAT_STENCIL`
     * `graphics.TEXTURE_FORMAT_RGBA32F`
     * `graphics.TEXTURE_FORMAT_RGBA16F`
     *
     * `width`
     * number
     *
     * `height`
     * number
     *
     * `min_filter` (optional)
     * `graphics.TEXTURE_FILTER_LINEAR`
     * `graphics.TEXTURE_FILTER_NEAREST`
     *
     * `mag_filter` (optional)
     * `graphics.TEXTURE_FILTER_LINEAR`
     * `graphics.TEXTURE_FILTER_NEAREST`
     *
     * `u_wrap` (optional)
     * `graphics.TEXTURE_WRAP_CLAMP_TO_BORDER`
     * `graphics.TEXTURE_WRAP_CLAMP_TO_EDGE`
     * `graphics.TEXTURE_WRAP_MIRRORED_REPEAT`
     * `graphics.TEXTURE_WRAP_REPEAT`
     *
     * `v_wrap` (optional)
     * `graphics.TEXTURE_WRAP_CLAMP_TO_BORDER`
     * `graphics.TEXTURE_WRAP_CLAMP_TO_EDGE`
     * `graphics.TEXTURE_WRAP_MIRRORED_REPEAT`
     * `graphics.TEXTURE_WRAP_REPEAT`
     *
     * `flags` (optional)
     * `render.TEXTURE_BIT` (only applicable to depth and stencil buffers)
     *
     * The render target can be created to support multiple color attachments. Each attachment can have different format settings and texture filters,
     * but attachments must be added in sequence, meaning you cannot create a render target at slot 0 and 3.
     * Instead it has to be created with all four buffer types ranging from [0..3] (as denoted by graphics.BUFFER_TYPE_COLORX_BIT where 'X' is the attachment you want to create).
     * It is not guaranteed that the device running the script can support creating render targets with multiple color attachments. To check if the device can support multiple attachments,
     * you can check if the `render` table contains any of the `BUFFER_TYPE_COLOR1_BIT`, `BUFFER_TYPE_COLOR2_BIT` or `BUFFER_TYPE_COLOR3_BIT` constants:
     *
     * `function init(self)
     * if graphics.BUFFER_TYPE_COLOR1_BIT == nil then
     * -- this devices does not support multiple color attachments
     * end
     * end
     * `
     *
     * @param name - render target name
     * @param parameters - table of buffer parameters, see the description for available keys and values
     * @returns new render target
     * @example
     * ```lua
     * How to create a new render target and draw to it:
     * function init(self)
     *     -- render target buffer parameters
     *     local color_params = { format = graphics.TEXTURE_FORMAT_RGBA,
     *                            width = render.get_window_width(),
     *                            height = render.get_window_height(),
     *                            min_filter = graphics.TEXTURE_FILTER_LINEAR,
     *                            mag_filter = graphics.TEXTURE_FILTER_LINEAR,
     *                            u_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE,
     *                            v_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE }
     *     local depth_params = { format = graphics.TEXTURE_FORMAT_DEPTH,
     *                            width = render.get_window_width(),
     *                            height = render.get_window_height(),
     *                            u_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE,
     *                            v_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE }
     *     self.my_render_target = render.render_target({[graphics.BUFFER_TYPE_COLOR0_BIT] = color_params, [graphics.BUFFER_TYPE_DEPTH_BIT] = depth_params })
     * end
     *
     * function update(self, dt)
     *     -- enable target so all drawing is done to it
     *     render.set_render_target(self.my_render_target)
     *
     *     -- draw a predicate to the render target
     *     render.draw(self.my_pred)
     * end
     *
     * How to create a render target with multiple outputs:
     * function init(self)
     *     -- render target buffer parameters
     *     local color_params_rgba = { format = graphics.TEXTURE_FORMAT_RGBA,
     *                                 width = render.get_window_width(),
     *                                 height = render.get_window_height(),
     *                                 min_filter = graphics.TEXTURE_FILTER_LINEAR,
     *                                 mag_filter = graphics.TEXTURE_FILTER_LINEAR,
     *                                 u_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE,
     *                                 v_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE }
     *     local color_params_float = { format = graphics.TEXTURE_FORMAT_RG32F,
     *                            width = render.get_window_width(),
     *                            height = render.get_window_height(),
     *                            min_filter = graphics.TEXTURE_FILTER_LINEAR,
     *                            mag_filter = graphics.TEXTURE_FILTER_LINEAR,
     *                            u_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE,
     *                            v_wrap = graphics.TEXTURE_WRAP_CLAMP_TO_EDGE }
     *
     *     -- Create a render target with three color attachments
     *     -- Note: No depth buffer is attached here
     *     self.my_render_target = render.render_target({
     *            [graphics.BUFFER_TYPE_COLOR0_BIT] = color_params_rgba,
     *            [graphics.BUFFER_TYPE_COLOR1_BIT] = color_params_rgba,
     *            [graphics.BUFFER_TYPE_COLOR2_BIT] = color_params_float, })
     * end
     *
     * function update(self, dt)
     *     -- enable target so all drawing is done to it
     *     render.enable_render_target(self.my_render_target)
     *
     *     -- draw a predicate to the render target
     *     render.draw(self.my_pred)
     * end
     * ```
     */
    function render_target(name: string, parameters: Record<string | number, unknown>): Opaque<"render_target">;
    /**
     * Specifies the arithmetic used when computing pixel values that are written to the frame
     * buffer. In RGBA mode, pixels can be drawn using a function that blends the source RGBA
     * pixel values with the destination pixel values already in the frame buffer.
     * Blending is initially disabled.
     * `source_factor` specifies which method is used to scale the source color components.
     * `destination_factor` specifies which method is used to scale the destination color
     * components.
     * Source color components are referred to as (Rs,Gs,Bs,As).
     * Destination color components are referred to as (Rd,Gd,Bd,Ad).
     * The color specified by setting the blendcolor is referred to as (Rc,Gc,Bc,Ac).
     * The source scale factor is referred to as (sR,sG,sB,sA).
     * The destination scale factor is referred to as (dR,dG,dB,dA).
     * The color values have integer values between 0 and (kR,kG,kB,kA), where kc = 2mc - 1 and mc is the number of bitplanes for that color. I.e for 8 bit color depth, color values are between `0` and `255`.
     * Available factor constants and corresponding scale factors:
     *
     * Factor constant
     * Scale factor (fR,fG,fB,fA)
     *
     * `graphics.BLEND_FACTOR_ZERO`
     * (0,0,0,0)
     *
     * `graphics.BLEND_FACTOR_ONE`
     * (1,1,1,1)
     *
     * `graphics.BLEND_FACTOR_SRC_COLOR`
     * (Rs/kR,Gs/kG,Bs/kB,As/kA)
     *
     * `graphics.BLEND_FACTOR_ONE_MINUS_SRC_COLOR`
     * (1,1,1,1) - (Rs/kR,Gs/kG,Bs/kB,As/kA)
     *
     * `graphics.BLEND_FACTOR_DST_COLOR`
     * (Rd/kR,Gd/kG,Bd/kB,Ad/kA)
     *
     * `graphics.BLEND_FACTOR_ONE_MINUS_DST_COLOR`
     * (1,1,1,1) - (Rd/kR,Gd/kG,Bd/kB,Ad/kA)
     *
     * `graphics.BLEND_FACTOR_SRC_ALPHA`
     * (As/kA,As/kA,As/kA,As/kA)
     *
     * `graphics.BLEND_FACTOR_ONE_MINUS_SRC_ALPHA`
     * (1,1,1,1) - (As/kA,As/kA,As/kA,As/kA)
     *
     * `graphics.BLEND_FACTOR_DST_ALPHA`
     * (Ad/kA,Ad/kA,Ad/kA,Ad/kA)
     *
     * `graphics.BLEND_FACTOR_ONE_MINUS_DST_ALPHA`
     * (1,1,1,1) - (Ad/kA,Ad/kA,Ad/kA,Ad/kA)
     *
     * `graphics.BLEND_FACTOR_CONSTANT_COLOR`
     * (Rc,Gc,Bc,Ac)
     *
     * `graphics.BLEND_FACTOR_ONE_MINUS_CONSTANT_COLOR`
     * (1,1,1,1) - (Rc,Gc,Bc,Ac)
     *
     * `graphics.BLEND_FACTOR_CONSTANT_ALPHA`
     * (Ac,Ac,Ac,Ac)
     *
     * `graphics.BLEND_FACTOR_ONE_MINUS_CONSTANT_ALPHA`
     * (1,1,1,1) - (Ac,Ac,Ac,Ac)
     *
     * `graphics.BLEND_FACTOR_SRC_ALPHA_SATURATE`
     * (i,i,i,1) where i = min(As, kA - Ad) /kA
     *
     * The blended RGBA values of a pixel comes from the following equations:
     *
     * - Rd = min(kR, Rs * sR + Rd * dR)
     *
     * - Gd = min(kG, Gs * sG + Gd * dG)
     *
     * - Bd = min(kB, Bs * sB + Bd * dB)
     *
     * - Ad = min(kA, As * sA + Ad * dA)
     *
     * Blend function `(graphics.BLEND_FACTOR_SRC_ALPHA, graphics.BLEND_FACTOR_ONE_MINUS_SRC_ALPHA)` is useful for
     * drawing with transparency when the drawn objects are sorted from farthest to nearest.
     * It is also useful for drawing antialiased points and lines in arbitrary order.
     *
     * @param source_factor - source factor
     * @param destination_factor - destination factor
     * @example
     * ```ts
     * // Set the blend func to the most common one:
     * render.set_blend_func(graphics.BLEND_FACTOR_SRC_ALPHA, graphics.BLEND_FACTOR_ONE_MINUS_SRC_ALPHA);
     * ```
     */
    function set_blend_func(source_factor: number, destination_factor: number): void;
    /**
     * Sets the current render camera to be used for rendering. If a render camera
     * has been set by the render script, the renderer will be using its projection and view matrix
     * during rendering. If a projection and/or view matrix has been set by the render script,
     * they will not be used until the current render camera has been reset by calling `render.set_camera()`.
     * If the 'use_frustum' flag in the options table has been set to true, the renderer will automatically use the
     * camera frustum for frustum culling regardless of what frustum is being passed into the render.draw() function.
     * Note that the frustum plane option in render.draw can still be used together with the camera.
     *
     * @param camera - camera id to use, or nil to reset
     * @param options - optional table with properties:
     *
     * `use_frustum`
     * boolean If true, the renderer will use the cameras view-projection matrix for frustum culling (default: false)
     * @example
     * ```ts
     * // Set the current camera to be used for rendering
     * render.set_camera("main:/my_go#camera");
     * render.draw(self.my_pred);
     * render.set_camera(undefined);
     *
     * // Use the camera frustum for frustum culling together with a specific frustum plane option for the draw command
     * // The camera frustum will take precedence over the frustum plane option in render.draw
     * render.set_camera("main:/my_go#camera", { use_frustum: true });
     * // However, we can still customize the frustum planes regardless of the camera option!
     * render.draw(self.my_pred, { frustum_planes: render.FRUSTUM_PLANES_ALL });
     * render.set_camera();
     * ```
     */
    function set_camera(camera?: Url | number, options?: { use_frustum?: boolean }): void;
    /**
     * Specifies whether the individual color components in the frame buffer is enabled for writing (`true`) or disabled (`false`). For example, if `blue` is `false`, nothing is written to the blue component of any pixel in any of the color buffers, regardless of the drawing operation attempted. Note that writing are either enabled or disabled for entire color components, not the individual bits of a component.
     * The component masks are all initially `true`.
     *
     * @param red - red mask
     * @param green - green mask
     * @param blue - blue mask
     * @param alpha - alpha mask
     * @example
     * ```ts
     * // alpha cannot be written to frame buffer
     * render.set_color_mask(true, true, true, false);
     * ```
     */
    function set_color_mask(red: boolean, green: boolean, blue: boolean, alpha: boolean): void;
    /**
     * The name of the compute program must be specified in the ".render" resource set
     * in the "game.project" setting. If nil (or no arguments) are passed to this function,
     * the current compute program will instead be disabled.
     *
     * @param compute - compute id to use, or nil to disable
     * @example
     * ```ts
     * // Enable compute program named "fractals", then dispatch it.
     * render.set_compute("fractals");
     * render.enable_texture(0, self.backing_texture);
     * render.dispatch_compute(128, 128, 1);
     * render.set_compute();
     * ```
     */
    function set_compute(compute?: string | Hash): void;
    /**
     * Specifies whether front- or back-facing polygons can be culled
     * when polygon culling is enabled. Polygon culling is initially disabled.
     * If mode is `graphics.FACE_TYPE_FRONT_AND_BACK`, no polygons are drawn, but other
     * primitives such as points and lines are drawn. The initial value for
     * `face_type` is `graphics.FACE_TYPE_BACK`.
     *
     * @param face_type - face type
     *
     * - `graphics.FACE_TYPE_FRONT`
     *
     * - `graphics.FACE_TYPE_BACK`
     *
     * - `graphics.FACE_TYPE_FRONT_AND_BACK`
     * @example
     * ```ts
     * // How to enable polygon culling and set front face culling:
     * render.enable_state(graphics.STATE_CULL_FACE);
     * render.set_cull_face(graphics.FACE_TYPE_FRONT);
     * ```
     */
    function set_cull_face(face_type: number): void;
    /**
     * Specifies the function that should be used to compare each incoming pixel
     * depth value with the value present in the depth buffer.
     * The comparison is performed only if depth testing is enabled and specifies
     * the conditions under which a pixel will be drawn.
     * Function constants:
     *
     * - `graphics.COMPARE_FUNC_NEVER` (never passes)
     *
     * - `graphics.COMPARE_FUNC_LESS` (passes if the incoming depth value is less than the stored value)
     *
     * - `graphics.COMPARE_FUNC_LEQUAL` (passes if the incoming depth value is less than or equal to the stored value)
     *
     * - `graphics.COMPARE_FUNC_GREATER` (passes if the incoming depth value is greater than the stored value)
     *
     * - `graphics.COMPARE_FUNC_GEQUAL` (passes if the incoming depth value is greater than or equal to the stored value)
     *
     * - `graphics.COMPARE_FUNC_EQUAL` (passes if the incoming depth value is equal to the stored value)
     *
     * - `graphics.COMPARE_FUNC_NOTEQUAL` (passes if the incoming depth value is not equal to the stored value)
     *
     * - `graphics.COMPARE_FUNC_ALWAYS` (always passes)
     *
     * The depth function is initially set to `graphics.COMPARE_FUNC_LESS`.
     *
     * @param func - depth test function, see the description for available values
     * @example
     * ```ts
     * // Enable depth test and set the depth test function to "not equal".
     * render.enable_state(graphics.STATE_DEPTH_TEST);
     * render.set_depth_func(graphics.COMPARE_FUNC_NOTEQUAL);
     * ```
     */
    function set_depth_func(func: number): void;
    /**
     * Specifies whether the depth buffer is enabled for writing. The supplied mask governs
     * if depth buffer writing is enabled (`true`) or disabled (`false`).
     * The mask is initially `true`.
     *
     * @param depth - depth mask
     * @example
     * ```ts
     * // How to turn off writing to the depth buffer:
     * render.set_depth_mask(false);
     * ```
     */
    function set_depth_mask(depth: boolean): void;
    /**
     * Set or remove listener. Currenly only only two type of events can arrived:
     * `render.CONTEXT_EVENT_CONTEXT_LOST` - when rendering context lost. Rending paused and all graphics resources become invalid.
     * `render.CONTEXT_EVENT_CONTEXT_RESTORED` - when rendering context was restored. Rendering still paused and graphics resources still
     * invalid but can be reloaded.
     *
     * @param callback - A callback that receives all render related events.
     * Pass `nil` if want to remove listener.
     *
     * `self`
     * object The render script
     * `event_type`
     * string Rendering event. Possible values: `render.CONTEXT_EVENT_CONTEXT_LOST`, `render.CONTEXT_EVENT_CONTEXT_RESTORED`
     * @example
     * ```ts
     * // Set listener and handle render context events.
     * // custom.render_script
     * export default defineScript({
     *   init() {
     *     render.set_listener((self, event_type) => {
     *       if (event_type === render.CONTEXT_EVENT_CONTEXT_LOST) {
     *         // Some stuff when rendering context is lost
     *       } else if (event_type === render.CONTEXT_EVENT_CONTEXT_RESTORED) {
     *         // Start reload resources, reload game, etc.
     *       }
     *     });
     *   },
     * });
     * ```
     */
    function set_listener(callback?: (self: unknown, event_type: unknown) => void): void;
    /**
     * Sets the scale and units used to calculate depth values.
     * If `graphics.STATE_POLYGON_OFFSET_FILL` is enabled, each fragment's depth value
     * is offset from its interpolated value (depending on the depth value of the
     * appropriate vertices). Polygon offset can be used when drawing decals, rendering
     * hidden-line images etc.
     * `factor` specifies a scale factor that is used to create a variable depth
     * offset for each polygon. The initial value is `0`.
     * `units` is multiplied by an implementation-specific value to create a
     * constant depth offset. The initial value is `0`.
     * The value of the offset is computed as `factor` &times; `DZ` + `r` &times; `units`
     * `DZ` is a measurement of the depth slope of the polygon which is the change in z (depth)
     * values divided by the change in either x or y coordinates, as you traverse a polygon.
     * The depth values are in window coordinates, clamped to the range [0, 1].
     * `r` is the smallest value that is guaranteed to produce a resolvable difference.
     * It's value is an implementation-specific constant.
     * The offset is added before the depth test is performed and before the
     * value is written into the depth buffer.
     *
     * @param factor - polygon offset factor
     * @param units - polygon offset units
     * @example
     * ```ts
     * render.enable_state(graphics.STATE_POLYGON_OFFSET_FILL);
     * render.set_polygon_offset(1.0, 1.0);
     * ```
     */
    function set_polygon_offset(factor: number, units: number): void;
    /**
     * Sets the projection matrix to use when rendering.
     *
     * @param matrix - projection matrix
     * @example
     * ```ts
     * // How to set the projection to orthographic with world origo at lower left,
     * // width and height as set in project settings and depth (z) between -1 and 1:
     * render.set_projection(vmath.matrix4_orthographic(0, render.get_width(), 0, render.get_height(), -1, 1));
     * ```
     */
    function set_projection(matrix: Matrix4): void;
    /**
     * Sets a render target. Subsequent draw operations will be to the
     * render target until it is replaced by a subsequent call to set_render_target.
     * This function supports render targets created by a render script, or a render target resource.
     *
     * @param render_target - render target to set. render.RENDER_TARGET_DEFAULT to set the default render target
     * @param options - optional table with behaviour parameters
     *
     * `transient`
     * table Transient frame buffer types are only valid while the render target is active, i.e becomes undefined when a new target is set by a subsequent call to set_render_target.
     * Default is all non-transient. Be aware that some hardware uses a combined depth stencil buffer and when this is the case both are considered non-transient if exclusively selected!
     * A buffer type defined that doesn't exist in the render target is silently ignored.
     *
     * - `graphics.BUFFER_TYPE_COLOR0_BIT`
     *
     * - `graphics.BUFFER_TYPE_DEPTH_BIT`
     *
     * - `graphics.BUFFER_TYPE_STENCIL_BIT`
     * @example
     * ```ts
     * // How to set a render target and draw to it and then switch back to the default render target
     * // The render target defines the depth/stencil buffers as transient, when set_render_target is called the next time the buffers may be invalidated and allow for optimisations depending on driver support
     * export default defineScript({
     *   update(self, dt) {
     *     // set render target so all drawing is done to it
     *     render.set_render_target(self.my_render_target, {
     *       transient: [graphics.BUFFER_TYPE_DEPTH_BIT, graphics.BUFFER_TYPE_STENCIL_BIT],
     *     });
     *
     *     // draw a predicate to the render target
     *     render.draw(self.my_pred);
     *
     *     // set default render target. This also invalidates the depth and stencil buffers of the current target (self.my_render_target)
     *     //  which can be an optimisation on some hardware
     *     render.set_render_target(render.RENDER_TARGET_DEFAULT);
     *   },
     * });
     *
     * // Or set the render target by a render target resource identifier:
     * export default defineScript({
     *   update(self, dt) {
     *     render.set_render_target("my_rt_resource");
     *
     *     // draw a predicate to the render target
     *     render.draw(self.my_pred);
     *
     *     // reset the render target to the default backbuffer
     *     render.set_render_target(render.RENDER_TARGET_DEFAULT);
     *   },
     * });
     * ```
     */
    function set_render_target(render_target: Opaque<"render_target">, options?: { transient?: Record<string | number, unknown> }): void;
    /**
     * Sets the render target size for a render target created from
     * either a render script, or from a render target resource.
     *
     * @param render_target - render target to set size for
     * @param width - new render target width
     * @param height - new render target height
     * @example
     * ```ts
     * // Resize render targets to the current window size:
     * render.set_render_target_size(self.my_render_target, render.get_window_width(), render.get_window_height());
     * render.set_render_target_size("my_rt_resource", render.get_window_width(), render.get_window_height());
     * ```
     */
    function set_render_target_size(render_target: Opaque<"render_target">, width: number, height: number): void;
    /**
     * Stenciling is similar to depth-buffering as it enables and disables drawing on a
     * per-pixel basis. First, GL drawing primitives are drawn into the stencil planes.
     * Second, geometry and images are rendered but using the stencil planes to mask out
     * where to draw.
     * The stencil test discards a pixel based on the outcome of a comparison between the
     * reference value `ref` and the corresponding value in the stencil buffer.
     * `func` specifies the comparison function. See the table below for values.
     * The initial value is `graphics.COMPARE_FUNC_ALWAYS`.
     * `ref` specifies the reference value for the stencil test. The value is clamped to
     * the range [0, 2n-1], where n is the number of bitplanes in the stencil buffer.
     * The initial value is `0`.
     * `mask` is ANDed with both the reference value and the stored stencil value when the test
     * is done. The initial value is all `1`'s.
     * Function constant:
     *
     * - `graphics.COMPARE_FUNC_NEVER` (never passes)
     *
     * - `graphics.COMPARE_FUNC_LESS` (passes if (ref & mask) < (stencil & mask))
     *
     * - `graphics.COMPARE_FUNC_LEQUAL` (passes if (ref & mask) <= (stencil & mask))
     *
     * - `graphics.COMPARE_FUNC_GREATER` (passes if (ref & mask) > (stencil & mask))
     *
     * - `graphics.COMPARE_FUNC_GEQUAL` (passes if (ref & mask) >= (stencil & mask))
     *
     * - `graphics.COMPARE_FUNC_EQUAL` (passes if (ref & mask) = (stencil & mask))
     *
     * - `graphics.COMPARE_FUNC_NOTEQUAL` (passes if (ref & mask) != (stencil & mask))
     *
     * - `graphics.COMPARE_FUNC_ALWAYS` (always passes)
     *
     * @param func - stencil test function, see the description for available values
     * @param ref - reference value for the stencil test
     * @param mask - mask that is ANDed with both the reference value and the stored stencil value when the test is done
     * @example
     * ```ts
     * // let only 0's pass the stencil test
     * render.set_stencil_func(graphics.COMPARE_FUNC_EQUAL, 0, 1);
     * ```
     */
    function set_stencil_func(func: number, ref: number, mask: number): void;
    /**
     * The stencil mask controls the writing of individual bits in the stencil buffer.
     * The least significant `n` bits of the parameter `mask`, where `n` is the number of
     * bits in the stencil buffer, specify the mask.
     * Where a `1` bit appears in the mask, the corresponding
     * bit in the stencil buffer can be written. Where a `0` bit appears in the mask,
     * the corresponding bit in the stencil buffer is never written.
     * The mask is initially all `1`'s.
     *
     * @param mask - stencil mask
     * @example
     * ```ts
     * // set the stencil mask to all 1:s
     * render.set_stencil_mask(0xff);
     * ```
     */
    function set_stencil_mask(mask: number): void;
    /**
     * The stencil test discards a pixel based on the outcome of a comparison between the
     * reference value `ref` and the corresponding value in the stencil buffer.
     * To control the test, call render.set_stencil_func.
     * This function takes three arguments that control what happens to the stored stencil
     * value while stenciling is enabled. If the stencil test fails, no change is made to the
     * pixel's color or depth buffers, and `sfail` specifies what happens to the stencil buffer
     * contents.
     * Operator constants:
     *
     * - `graphics.STENCIL_OP_KEEP` (keeps the current value)
     *
     * - `graphics.STENCIL_OP_ZERO` (sets the stencil buffer value to 0)
     *
     * - `graphics.STENCIL_OP_REPLACE` (sets the stencil buffer value to `ref`, as specified by render.set_stencil_func)
     *
     * - `graphics.STENCIL_OP_INCR` (increments the stencil buffer value and clamp to the maximum representable unsigned value)
     *
     * - `graphics.STENCIL_OP_INCR_WRAP` (increments the stencil buffer value and wrap to zero when incrementing the maximum representable unsigned value)
     *
     * - `graphics.STENCIL_OP_DECR` (decrements the current stencil buffer value and clamp to 0)
     *
     * - `graphics.STENCIL_OP_DECR_WRAP` (decrements the current stencil buffer value and wrap to the maximum representable unsigned value when decrementing zero)
     *
     * - `graphics.STENCIL_OP_INVERT` (bitwise inverts the current stencil buffer value)
     *
     * `dppass` and `dpfail` specify the stencil buffer actions depending on whether subsequent
     * depth buffer tests succeed (dppass) or fail (dpfail).
     * The initial value for all operators is `graphics.STENCIL_OP_KEEP`.
     *
     * @param sfail - action to take when the stencil test fails
     * @param dpfail - the stencil action when the stencil test passes
     * @param dppass - the stencil action when both the stencil test and the depth test pass, or when the stencil test passes and either there is no depth buffer or depth testing is not enabled
     * @example
     * ```ts
     * // Set the stencil function to never pass and operator to always draw 1's
     * // on test fail.
     * render.set_stencil_func(graphics.COMPARE_FUNC_NEVER, 1, 0xFF);
     * // always draw 1's on test fail
     * render.set_stencil_op(graphics.STENCIL_OP_REPLACE, graphics.STENCIL_OP_KEEP, graphics.STENCIL_OP_KEEP);
     * ```
     */
    function set_stencil_op(sfail: number, dpfail: number, dppass: number): void;
    /**
     * Sets the view matrix to use when rendering.
     *
     * @param matrix - view matrix to set
     * @example
     * ```ts
     * // How to set the view and projection matrices according to
     * // the values supplied by a camera.
     * export default defineScript({
     *   init() {
     *     return {
     *       view: vmath.matrix4(),
     *       projection: vmath.matrix4(),
     *     };
     *   },
     *
     *   update(self, dt) {
     *     // set the view to the stored view value
     *     render.set_view(self.view);
     *     // now we can draw with this view
     *   },
     *
     *   on_message(self, message_id, message) {
     *     if (message_id === hash("set_view_projection")) {
     *       // camera view and projection arrives here.
     *       self.view = message.view;
     *       self.projection = message.projection;
     *     }
     *   },
     * });
     * ```
     */
    function set_view(matrix: Matrix4): void;
    /**
     * Set the render viewport to the specified rectangle.
     *
     * @param x - left corner
     * @param y - bottom corner
     * @param width - viewport width
     * @param height - viewport height
     * @example
     * ```ts
     * // Set the viewport to the window dimensions.
     * render.set_viewport(0, 0, render.get_window_width(), render.get_window_height());
     * ```
     */
    function set_viewport(x: number, y: number, width: number, height: number): void;
  }
}

export {};
