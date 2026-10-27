/** @noSelfInFile **/

/**
 * Real-time shadows from one light source, the sun, and many point light sources,
 * wired into a render script. Call `init(self)` from the render script's `init`,
 * `update(self)` from its `update`, and `draw_upscaled(self)` after drawing the world
 * when a post effect is on (see `light_and_shadows/render/default.render_script`, the
 * lines marked `-- L_S Injection`). The settings fields are read every frame. Vector
 * fields are mutated in place; assigning a new value to any other field goes through a
 * cast, since a namespace import is read-only:
 * `(light_and_shadows as { fxaa: boolean }).fxaa = true`.
 * @see {@link https://github.com/Dragosha/defold-light-and-shadows|Github Source}
 * @noResolution
 */
declare module 'light_and_shadows.light_and_shadows' {
  /** A render target with the size it was created at, as `render_target` returns it. */
  export interface SizedRenderTarget {
    /** The render target. */
    rt: render.RenderTarget;
    /** The width in pixels. */
    w: number;
    /** The height in pixels. */
    h: number;
  }

  /** The depth-of-field options `dof` reads. */
  export interface DofOptions {
    /** How strong the blur effect is, `2` to `10`. Omitted, `blur_power` keeps its value. */
    blur_power?: number;
    /** How wide the focus zone is, `0.1` to `4`. Omitted, `focus_range` in `light_and_shadows.constants` keeps its value. */
    focus_range?: number;
    /**
     * How much the blur render target is reduced in size, for speed; `1` to `2` is enough.
     * `dof` copies it with no fallback, so it is required: an options table without it
     * leaves `blur_resolution` nil and the next `update` fails.
     */
    blur_resolution: number;
    /** Whether to upscale the main render target. `dof` sets `upscale` to `false` when it is omitted. */
    upscale?: boolean;
  }

  /** Whether the sun casts shadows. The default is `true`. */
  export const shadow: boolean;

  /**
   * Whether the main render target is upscaled. When on, every object is first rendered
   * to a render target no larger than the project settings size, which is then placed on
   * the screen with linear scaling. Add `light_and_shadows/props/render_target_quad.go`
   * to the main scene to use it. The default is `false`.
   */
  export const upscale: boolean;

  /** Whether FXAA anti-aliasing is applied to the final image. The default is `false`. */
  export const fxaa: boolean;

  /** Whether depth of field is on. `dof` sets it. The default is `false`. */
  export const mix: boolean;

  /** The alpha below which the sprite shader discards semitransparent pixels. The default is `0.5`. */
  export const discard_threshold: number;

  /** Whether the reference render script reads the near and far Z planes from the camera component into `light_and_shadows.constants`. Set it to `false` to set `near_z` and `far_z` by hand. The default is `true`. */
  export const get_far_near_z_from_camera: boolean;

  /** Whether the game scene is blurred, so an unblurred GUI can be drawn on top. It uses the same render target as upscaling. The default is `false`. */
  export const blur: boolean;

  /** How strong the blur is, `1` to `10`. The default is `2.5`. */
  export const blur_power: number;

  /** How much the blur render target is reduced in size, for speed. The default is `2`. */
  export const blur_resolution: number;

  /** The depth-of-field focus position, in `z`. */
  export const focus: Vector4;

  /** The shadow depth bias. Too high a bias detaches shadows from their objects; too low a bias causes shadow acne. The default is `0.0004`. */
  export const depth_bias: number;

  /** How many point light sources the shader processes at once, at most `16`. The default is `8`. */
  export const max_lights: number;

  /** Every render target `render_target` created, keyed by name. */
  export const rt_list: LuaTable<string, SizedRenderTarget>;

  /** The polygon offset applied while drawing the shadow map. Raise it to reduce shadow acne; lower it if shadows detach from their casters. */
  export const polygon_offset: { factor: number; units: number };

  /** The zoom `update` computed for upscaling, `1` when `upscale` is off. */
  export const zoom: number;

  /**
   * Turns depth of field on or off.
   * @param enable `true` turns depth of field on.
   * @param options The depth-of-field options. Omitted, every setting keeps its value.
   */
  export function dof(enable: boolean, options?: DofOptions): void;

  /**
   * Returns the render target named `name`, creating it with a color buffer and, unless
   * `no_depth` is set, a depth texture. A target that exists at another size is resized.
   * @param name The render target name, also its key in `rt_list`.
   * @param w The width in pixels.
   * @param h The height in pixels.
   * @param no_depth `true` creates the target without a depth buffer.
   */
  export function render_target(
    name: string,
    w: number,
    h: number,
    no_depth?: boolean,
  ): SizedRenderTarget;

  /**
   * Sets an orthographic shadow projection, used for directional light. `init` sets one.
   * @param proj_w The width of the area the shadow is projected on.
   * @param proj_h The height of the area the shadow is projected on.
   * @param near_z The near clipping plane. The default is `-500`.
   * @param far_z The far clipping plane. The default is `500`.
   */
  export function set_orthographic_projection(
    proj_w: number,
    proj_h: number,
    near_z?: number,
    far_z?: number,
  ): void;

  /**
   * Sets a perspective shadow projection, cast in the direction of `sun_dir` in
   * `light_and_shadows.constants`. Experimental.
   * @param fov The field of view in radians. The default is `3.14 / 1.5`.
   * @param aspect The aspect ratio. The default is `1`.
   * @param near_z The near clipping plane. The default is `50`.
   * @param far_z The far clipping plane. The default is `500`.
   */
  export function set_perspective_projection(
    fov?: number,
    aspect?: number,
    near_z?: number,
    far_z?: number,
  ): void;

  /**
   * Sets up the shadow map, the orthographic shadow projection and the render
   * constants on the render script. Call it from the render script's `init`.
   * @param self The render script instance.
   */
  export function init(self: object): void;

  /**
   * Writes the sun, the point light sources, the ambient and fog values and the camera
   * values from `light_and_shadows.constants` into the render constants. `update` calls it.
   * @param self The render script instance.
   */
  export function update_light(self: object): void;

  /**
   * Draws every object tagged `shadow` into the shadow map. `update` calls it while
   * `shadow` is on. The render script's `self.predicates` must carry `shadow`,
   * `shadow_local`, `shadow_instanced`, `shadow_instanced_billboard`,
   * `shadow_instanced_textured`, `shadow_skinned_instanced` and `shadow_skinned`.
   * @param self The render script instance.
   */
  export function render_shadows(self: object): void;

  /**
   * Updates the light constants, draws the shadow map, and creates or resizes the main
   * and blur render targets a post effect needs. Call it from the render script's
   * `update`.
   * @param self The render script instance.
   */
  export function update(self: object): void;

  /**
   * Blurs the main render target when depth of field or blur is on, then draws it to the
   * screen, with FXAA when `fxaa` is on. Call it after the world is drawn to the main
   * render target. The render script's `self.predicates` must carry `upscale`.
   * @param self The render script instance.
   */
  export function draw_upscaled(self: object): void;
}
