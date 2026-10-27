/** @noSelfInFile **/

/**
 * The light options the render script forwards into shader uniform constants. Scripts
 * such as `light_setting.script` and `sun.script` write them, and `light.update` and
 * the render script read them every frame. Vector fields are mutated in place
 * (`constants.fog.x = 20`); assigning a new value to a field goes through a cast, since
 * a namespace import is read-only.
 * @see {@link https://github.com/Dragosha/defold-light-and-shadows|Github Source}
 * @noResolution
 */
declare module 'light_and_shadows.constants' {
  /**
   * One light source as the shader receives it. `light.update` rebuilds the list every
   * frame from `light.list`, sorted by distance from the point the camera looks at.
   */
  export interface LightEntry {
    /** The world position. `w` carries the spotlight smoothness. */
    position: Vector4;
    /** The color. `w` is the power after distance attenuation. */
    color: Vector4;
    /** The spotlight direction; `w` above `0` turns the spotlight on. `light_and_shadows.update` sends a zero vector when it is absent. */
    direction?: Vector4;
    /** The squared distance from the point the camera looks at. */
    distance: number;
    /** The power before distance attenuation. */
    power: number;
  }

  /** The color that clears the default render target, which is the background color. RGB in `0`..`1`. */
  export const clear_color: Vector4;

  /** The minimum and maximum Z in camera view space between which the fog starts and ends, in `x` and `y`. */
  export const fog: Vector4;

  /** The ambient color, added after every light source is blended. `w` is the maximum value of each final color component. */
  export const ambient: Vector4;

  /** The fog color, usually the clear color. `w` is the fog density from `0` to `1`, where `0` is the densest. */
  export const fog_color: Vector4;

  /**
   * The light sources, their world positions and colors. Only the first
   * `light_and_shadows.max_lights` reach the shader; missing ones are sent as zero
   * vectors.
   */
  export const lights: LightEntry[];

  /** The camera world position, which the shader uses for specular light. `light.update` copies it from `light.cam_position`. */
  export const cam_position: Vector4;

  /** The point the camera looks at, the center of the shadow projection. `light.update` copies it from `light.cam_look_at`. */
  export const cam_look_at_position: Vector3;

  /** The sun position, the one light source that casts shadows. */
  export const sun_position: Vector4;

  /** The sun color. */
  export const sun_color: Vector4;

  /** The sun direction, used for shadow casting with a perspective projection. */
  export const sun_dir: Vector3;

  /** The inverted shadow color, subtracted where shadows fall. `light_and_shadows.update` sets `w` to `1` when `light_and_shadows.shadow` is on and `0` when it is off. */
  export const shadow_color: Vector4;

  /** The camera Z coordinate, the distance from the focus point. `light.update` copies it from `light.cam_z`. */
  export const cam_z: number;

  /** How wide the depth-of-field focus zone is. `light_and_shadows.dof` sets it from `focus_range`. */
  export const focus_range: number;

  /** The camera near Z plane. The reference render script reads it from the camera while `light_and_shadows.get_far_near_z_from_camera` is `true`. */
  export const near_z: number;

  /** The camera far Z plane. The reference render script reads it from the camera while `light_and_shadows.get_far_near_z_from_camera` is `true`. */
  export const far_z: number;
}
