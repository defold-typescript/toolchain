/** @noSelfInFile **/

/**
 * A stylized water shader: animated wave surfaces, foam, sparkles, refraction and
 * reflection, set through shader constants. A game object script calls `init` once with
 * the camera, sun and water objects, then `update(dt)` and `update_camera()` every frame.
 * The render script calls `render_init(self)` at the end of its `init` and
 * `render_update(self, state, predicates, draw_options_world)` in its `update` (see
 * `water/render/water.render_script`). The shader needs `exclude_gles_sm100 = 1` under
 * `[shader]` in `game.project`. Every setter writes a shader constant the next
 * `render_update` uploads, and every getter returns the stored values as separate
 * values.
 * @see {@link https://github.com/selimanac/defold-stylized-water-shader|Github Source}
 * @noResolution
 */
declare module 'water.water' {
  /** The render script instance `render_init` reads and writes. */
  export interface RenderScriptSelf {
    /** The render script's predicates. `render_init` adds a `water` predicate to it. */
    predicates: object;
    /** The render state, whose size `render_init` creates the scene render target at. */
    state: {
      /** The width in pixels. */
      width: number;
      /** The height in pixels. */
      height: number;
    };
  }

  /** The render state `render_update` reads each frame. */
  export interface RenderState {
    /** The window width in pixels, which the scene render target is resized to. */
    window_width: number;
    /** The window height in pixels, which the scene render target is resized to. */
    window_height: number;
    /** The clear values `render.clear` receives for the scene render target. */
    clear_buffers: LuaMap<render.ClearBufferKey, number | Vector4>;
  }

  /** The predicates `render_update` draws. */
  export interface Predicates {
    /** The `model` predicate, drawn into the scene render target and then to the screen. */
    model: render.RenderPredicate;
    /** The `water` predicate `render_init` adds to the render script's `self.predicates`. */
    water: render.RenderPredicate;
  }

  /**
   * Stores the camera, sun and water objects and the time speed, then reads the camera
   * position and near and far planes and the sun direction once. Call it from a game
   * object script's `init`.
   * @param camera_url The camera game object, whose world position the shader uses.
   * @param camera_component_url The camera component, whose near and far Z planes the shader uses.
   * @param sun_url The sun game object, whose position sets the light and the sun direction.
   * @param water_url The water surface game object, the origin of the sun direction.
   * @param time_speed The multiplier `update` applies to `dt` to advance the wave time.
   */
  export function init(
    camera_url: Url | string | Hash,
    camera_component_url: Url | string | Hash,
    sun_url: Url | string | Hash,
    water_url: Url | string | Hash,
    time_speed: number,
  ): void;

  /**
   * Adds the `water` predicate to `self.predicates`, creates the scene render target at
   * `self.state.width` by `self.state.height` with a color and a depth buffer, and
   * creates the two constant buffers `render_update` draws with, all stored on `self`.
   * Call it at the end of the render script's `init`, once `self.predicates` and
   * `self.state` are set.
   * @param self The render script instance.
   */
  export function render_init(self: RenderScriptSelf): void;

  /**
   * Draws the `model` predicate into the scene render target, then draws `model` and the
   * water to the default render target, sampling the scene's depth and color for edge
   * foam and refraction. It needs `render_init` to have run on the same `self`, and
   * raises otherwise. Call it from the render script's `update` after the world view and
   * projection are set.
   * @param self The render script instance `render_init` ran on.
   * @param state The render state: the window size and the clear values.
   * @param predicates The render script's predicates; pass `self.predicates`, which holds
   * the `water` predicate `render_init` added.
   * @param draw_options_world The draw options for the world, used for the scene pass.
   */
  export function render_update(
    self: object,
    state: RenderState,
    predicates: Predicates,
    draw_options_world: render.DrawOptions,
  ): void;

  /**
   * Re-reads the sun position, which moves the light and recomputes the sun direction
   * from the water object, replacing any direction `set_sun_direction` wrote.
   */
  export function update_sun(): void;

  /** Re-reads the camera world position and its near and far Z planes. Call it every frame. */
  export function update_camera(): void;

  /**
   * Advances the wave time by `dt` times the time speed `init` stored, unless the timer
   * is paused. Call it every frame.
   * @param dt The frame time in seconds.
   */
  export function update(dt: number): void;

  /**
   * Pauses or resumes the wave timer.
   * @param state `true` stops the timer, `false` resumes it.
   */
  export function pause(state: boolean): void;

  /**
   * Sets the first wave layer.
   * @param direction The wave direction in radians, `0` to `2π`: `0` east, `π/2` north, `π` west, `3π/2` south.
   * @param amplitude The wave height: `0.1` to `0.5` gentle, `0.5` to `1` medium, `1` to `2` rough, above `2` a storm.
   * @param wavelength The distance between wave peaks: `10` to `20` choppy, `20` to `40` ocean waves, above `40` long gentle swells.
   * @param speed The animation speed: `0.5` to `1` slow, `1` to `3` moderate, `3` to `5` fast, above `5` very fast.
   */
  export function set_wave1(
    direction: number,
    amplitude: number,
    wavelength: number,
    speed: number,
  ): void;

  /** Returns the first wave layer's direction, amplitude, wavelength and speed. */
  export function get_wave1(): LuaMultiReturn<
    [direction: number, amplitude: number, wavelength: number, speed: number]
  >;

  /**
   * Sets the second wave layer, with the same ranges as `set_wave1`.
   * @param direction The wave direction in radians, `0` to `2π`.
   * @param amplitude The wave height: `0.1` to `0.5` gentle, `0.5` to `1` medium, `1` to `2` rough, above `2` a storm.
   * @param wavelength The distance between wave peaks: `10` to `20` choppy, `20` to `40` ocean waves, above `40` long gentle swells.
   * @param speed The animation speed: `0.5` to `1` slow, `1` to `3` moderate, `3` to `5` fast, above `5` very fast.
   */
  export function set_wave2(
    direction: number,
    amplitude: number,
    wavelength: number,
    speed: number,
  ): void;

  /** Returns the second wave layer's direction, amplitude, wavelength and speed. */
  export function get_wave2(): LuaMultiReturn<
    [direction: number, amplitude: number, wavelength: number, speed: number]
  >;

  /**
   * Sets the animated normal map that adds ripple detail to the surface.
   * @param scale The normal map tiling: `5` large ripples, `10` medium, `20` tiny.
   * @param speed The animation speed: `0.5` slow, `1` normal, `2` fast.
   */
  export function set_wave_normal_params(scale: number, speed: number): void;

  /** Returns the normal map tiling and animation speed. */
  export function get_wave_normal_params(): LuaMultiReturn<[scale: number, speed: number]>;

  /**
   * Sets the water color in shallow areas. The shader always uses an alpha of `1`.
   * @param r The red component, `0` to `1`.
   * @param g The green component, `0` to `1`.
   * @param b The blue component, `0` to `1`.
   */
  export function set_shallow_color(r: number, g: number, b: number): void;

  /** Returns the shallow water color's red, green and blue components. */
  export function get_shallow_color(): LuaMultiReturn<[r: number, g: number, b: number]>;

  /**
   * Sets the water color in deep areas.
   * @param r The red component, `0` to `1`.
   * @param g The green component, `0` to `1`.
   * @param b The blue component, `0` to `1`.
   */
  export function set_deep_color(r: number, g: number, b: number): void;

  /** Returns the deep water color's red, green and blue components. */
  export function get_deep_color(): LuaMultiReturn<[r: number, g: number, b: number]>;

  /**
   * Sets the water color far from the camera, which the surface fades to with distance.
   * @param r The red component, `0` to `1`.
   * @param g The green component, `0` to `1`.
   * @param b The blue component, `0` to `1`.
   */
  export function set_far_color(r: number, g: number, b: number): void;

  /** Returns the far water color's red, green and blue components. */
  export function get_far_color(): LuaMultiReturn<[r: number, g: number, b: number]>;

  /**
   * Sets the foam's look and animation.
   * @param scale The foam texture tiling; lower values give bigger foam patches.
   * @param speed The animation speed.
   * @param noise_scale The normal map distortion: `0` none, `0.5` moderate, `1` heavy.
   * @param contribution The overall foam visibility: `0` no foam, `0.5` subtle, `1` full.
   */
  export function set_foam_params(
    scale: number,
    speed: number,
    noise_scale: number,
    contribution: number,
  ): void;

  /** Returns the foam tiling, speed, normal map distortion and visibility. */
  export function get_foam_params(): LuaMultiReturn<
    [scale: number, speed: number, noise_scale: number, contribution: number]
  >;

  /**
   * Sets how the color fades with distance and blends with depth.
   * @param distance_density How quickly the color fades to the far color: `0.01` very slow, `0.1` normal, `0.5` quick.
   * @param depth_density How quickly the color moves from the shallow color to the deep color with water depth.
   */
  export function set_density_params(distance_density: number, depth_density: number): void;

  /** Returns the distance fade rate and the depth blending intensity. */
  export function get_density_params(): LuaMultiReturn<
    [distance_density: number, depth_density: number]
  >;

  /**
   * Sets the sharpness of the sun's specular highlight.
   * @param exponent The highlight sharpness: `100` big and soft, `1000` medium, `10000` tiny and sharp.
   */
  export function set_sun_params(exponent: number): void;

  /** Returns the sun highlight sharpness. */
  export function get_sun_params(): number;

  /**
   * Sets the sun light color.
   * @param r The red component, `0` to `1`.
   * @param g The green component, `0` to `1`.
   * @param b The blue component, `0` to `1`.
   */
  export function set_sun_color(r: number, g: number, b: number): void;

  /** Returns the sun color's red, green and blue components. */
  export function get_sun_color(): LuaMultiReturn<[r: number, g: number, b: number]>;

  /**
   * Sets the directional light direction. `init` and `update_sun` overwrite it with the
   * direction from the water object to the sun.
   * @param x The X component of the normalized direction.
   * @param y The Y component of the normalized direction.
   * @param z The Z component of the normalized direction.
   */
  export function set_sun_direction(x: number, y: number, z: number): void;

  /** Returns the X, Y and Z components of the sun direction. */
  export function get_sun_direction(): LuaMultiReturn<[x: number, y: number, z: number]>;

  /**
   * Sets the sparkle (glitter) effect.
   * @param scale The sparkle texture tiling.
   * @param speed The animation speed.
   * @param exponent The sharpness: `1000` many soft sparkles, `10000` medium, `100000` very few, very sharp ones.
   * @param enabled `0` disables sparkles and `1` enables them. When omitted, the current
   * value is kept.
   */
  export function set_sparkle_params(
    scale: number,
    speed: number,
    exponent: number,
    enabled?: number,
  ): void;

  /** Returns the sparkle tiling, speed and sharpness, and `1` when sparkles are enabled or `0` when not. */
  export function get_sparkle_params(): LuaMultiReturn<
    [scale: number, speed: number, exponent: number, enabled: number]
  >;

  /** Enables the sparkle effect. */
  export function enable_sparkle(): void;

  /** Disables the sparkle effect, which saves eight texture samples per fragment. */
  export function disable_sparkle(): void;

  /** Returns `true` when the sparkle effect is enabled. */
  export function is_sparkle_enabled(): boolean;

  /**
   * Sets the sparkle tint color.
   * @param r The red component, `0` to `1`.
   * @param g The green component, `0` to `1`.
   * @param b The blue component, `0` to `1`.
   */
  export function set_sparkle_color(r: number, g: number, b: number): void;

  /** Returns the sparkle color's red, green and blue components. */
  export function get_sparkle_color(): LuaMultiReturn<[r: number, g: number, b: number]>;

  /**
   * Sets the foam drawn where the water meets other geometry, based on water depth.
   * @param depth_scale How quickly the foam fades with depth; lower values give more foam.
   * @param noise_strength The noise distortion strength, about `0.2` to `0.5`.
   * @param edge_softness The edge blend softness, about `0.02` to `0.15`.
   * @param alpha The overall foam opacity, `0` to `1`.
   */
  export function set_edge_foam_params(
    depth_scale: number,
    noise_strength: number,
    edge_softness: number,
    alpha: number,
  ): void;

  /** Returns the edge foam depth scale, noise strength, edge softness and opacity. */
  export function get_edge_foam_params(): LuaMultiReturn<
    [depth_scale: number, noise_strength: number, edge_softness: number, alpha: number]
  >;

  /**
   * Sets how the edge foam is drawn. It also prints `SET` and the type on every call.
   * @param type `0` draws a solid color, `1` a texture.
   */
  export function set_edge_foam_type(type: 0 | 1): void;

  /** Returns the edge foam type: `0` for a solid color, `1` for a texture. */
  export function get_edge_foam_type(): number;

  /**
   * Sets the edge foam color.
   * @param r The red component, `0` to `1`.
   * @param g The green component, `0` to `1`.
   * @param b The blue component, `0` to `1`.
   */
  export function set_edge_foam_color(r: number, g: number, b: number): void;

  /** Returns the edge foam color's red, green and blue components. */
  export function get_edge_foam_color(): LuaMultiReturn<[r: number, g: number, b: number]>;

  /**
   * Sets the screen-space refraction.
   * @param strength The refraction intensity: `0` off, `0.5` moderate, `1` strong.
   * @param chromatic_aberration The color separation: `0` off, `0.5` subtle, `1` strong.
   * Defaults to `0`.
   */
  export function set_refraction_params(strength: number, chromatic_aberration?: number): void;

  /** Returns the refraction strength and chromatic aberration. */
  export function get_refraction_params(): LuaMultiReturn<
    [strength: number, chromatic_aberration: number]
  >;

  /**
   * Sets the cubemap reflection. The reflection samples the cubemap bound to the water
   * material's `reflection_cubemap` sampler; this module binds none.
   * @param strength The reflection intensity: `0` off, `0.5` moderate, `1` strong.
   * @param fresnel_power How much stronger the reflection is at grazing angles, `1` to `5`:
   * `1` the same at every angle, `3` natural, `5` very strong. Defaults to `3`.
   */
  export function set_reflection_params(strength: number, fresnel_power?: number): void;

  /** Returns the reflection strength and fresnel power. */
  export function get_reflection_params(): LuaMultiReturn<
    [strength: number, fresnel_power: number]
  >;

  /**
   * Prints a warning and does nothing else.
   * @param cubemap_path The cubemap texture path, for example `/main/skybox.cubemap`.
   * @deprecated Upstream does not implement cubemap reflections: a cubemap path cannot be
   * passed to `render.enable_texture`.
   */
  export function set_skybox_cubemap(cubemap_path: string): void;

  /**
   * Returns `undefined`.
   * @deprecated Upstream does not implement cubemap reflections: a cubemap path cannot be
   * passed to `render.enable_texture`.
   */
  export function get_skybox_cubemap(): undefined;

  /**
   * Sets the level-of-detail distances beyond which effects are simplified.
   * @param sparkle_distance The distance beyond which sparkles are skipped, saving eight texture samples, `0` to `500`. The default is `100`.
   * @param foam_distance The distance beyond which a simplified foam is drawn, saving three texture samples, `0` to `500`. The default is `150`.
   */
  export function set_lod_params(sparkle_distance: number, foam_distance: number): void;

  /** Returns the sparkle and foam level-of-detail distances. */
  export function get_lod_params(): LuaMultiReturn<
    [sparkle_distance: number, foam_distance: number]
  >;
}
