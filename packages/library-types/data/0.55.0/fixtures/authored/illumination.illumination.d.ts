/** @noSelfInFile **/

/**
 * Forward shading lighting for 3D games, with ambient and directional light, point and
 * spot lights, and linear or radial fog. Add `illumination.go` to the scene as the
 * sunlight source, add `light_point.go` or `light_spot.go` for each light, and set
 * `/illumination/materials/model.material` on the meshes. The lighting data reaches the
 * shader as a texture, so no render script is needed. The module's functions toggle the
 * debug meshes and set lights and the environment by hand.
 * @see {@link https://github.com/astrochili/defold-illumination|Github Source}
 * @noResolution
 */
declare module 'illumination.illumination' {
  /** No fog. */
  export const FOG_TYPE_NONE: 0;

  /** Fog along the camera's view direction. */
  export const FOG_TYPE_LINEAR: 1;

  /** Fog around the camera's position. */
  export const FOG_TYPE_RADIAL: 2;

  /** One of the three `FOG_TYPE_*` values. */
  export type FogType = typeof FOG_TYPE_NONE | typeof FOG_TYPE_LINEAR | typeof FOG_TYPE_RADIAL;

  /**
   * The environment fields `set_environment` patches. Each is optional, and only the fields
   * given change. Colors run from `0` to `1` on each channel.
   */
  export interface Environment {
    /** The fog type. The fog fields below apply only while the fog type is not `FOG_TYPE_NONE`. */
    fog_type?: FogType;
    /** The ambient light color, its `w` the ambient strength. */
    ambient_color?: Vector4;
    /** The directional light color, its `w` the sunlight brightness. */
    sunlight_color?: Vector4;
    /** The direction the sunlight shines, normalized by upstream. */
    sunlight_direction?: Vector3;
    /** The sunlight's specular component, from `0` to `1`. */
    sunlight_specular?: number;
    /** The fog color, its `w` the fog's full strength. Also posted as `clear_color` to `@render:`. */
    fog_color?: Vector4;
    /** The distance at which the fog begins. Values below `0` are raised to `0`. */
    fog_min?: number;
    /** The distance at which the fog reaches full strength. Values below `fog_min` are raised to it. */
    fog_max?: number;
  }

  /**
   * A light source `set_light` adds or updates. `color`, `radius` and `cutoff` are read on
   * every light, and a light whose `color.w`, `radius` or `cutoff` is `0` or below is
   * removed.
   */
  export interface Light {
    /** The light's world position. Each axis is encoded within -2048 to 2048. */
    position: Vector3;
    /** The light color, multiplied with the diffuse color. Its `w` is the brightness. */
    color: Vector4;
    /** The light radius. Upstream rounds it up and caps it at `255`. */
    radius: number;
    /**
     * The spotlight cutoff, from `0` to `1`: `0.3` is like a flashlight, `0.5` half of the
     * sphere, and `1` no cutoff.
     */
    cutoff: number;
    /** The direction a spotlight shines. Read only while `cutoff` is below `1`. */
    direction?: Vector3;
    /** The light's specular component, from `0` to `1`. Defaults to `1`. */
    specular?: number;
    /**
     * The light's attenuation, from `0` to `1`: `0` fills the radius evenly and `1` fades
     * from the center to the edge. Defaults to `1`.
     */
    smoothness?: number;
  }

  /**
   * Shows or hides the debug meshes of the sun and the light sources.
   * @param is_enabled Whether the debug meshes show.
   */
  export function set_debug(is_enabled: boolean): void;

  /** Returns whether the debug meshes show. */
  export function is_debug(): boolean;

  /**
   * Patches the environment with the fields given and leaves the others as they are. The
   * fog fields apply only while the stored fog type, including one set in the same call,
   * is not `FOG_TYPE_NONE`, and `fog_color` also posts `clear_color` to `@render:`. The
   * bundled `illumination.go` patches each field from its own properties on its first
   * update and whenever that property changes, overwriting a value set here. Raises until
   * the bundled `illumination.go` has run its script's `init`.
   * @param environment The fields to change.
   */
  export function set_environment(environment: Environment): void;

  /**
   * Adds, updates or removes a light source by hand, for lights that are not
   * `light_point.go` or `light_spot.go`. `position`, `color`, `radius` and `cutoff` are
   * required, `specular` and `smoothness` default to `1`, and each position axis must lie
   * within -2048 to 2048. `undefined`, or a light whose `color.w`, `radius` or `cutoff` is
   * `0` or below, removes the light. `url` keys the light, so pass the same value on every
   * call for the same light. It receives a `debug` message carrying `is_enabled` when the
   * light is added or removed and on every `set_debug`. Adding or updating a light raises
   * until the bundled `illumination.go` has run its script's `init`.
   * @param light The light, or `undefined` to remove it.
   * @param url The light's key and the address of its `debug` messages.
   */
  export function set_light(light: Light | undefined, url: Url | string | Hash): void;
}
