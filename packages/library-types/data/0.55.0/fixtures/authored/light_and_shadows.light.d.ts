/** @noSelfInFile **/

/**
 * The light sources manager. It keeps the list of point light sources and the camera
 * position, and each frame writes the sorted sources and the camera values into
 * `light_and_shadows.constants`. `light_setting.script` calls `set_color` and `update`,
 * and a scene controller calls `set_position` as its camera moves. Assigning a new value
 * to a field goes through a cast, since a namespace import is read-only.
 * @see {@link https://github.com/Dragosha/defold-light-and-shadows|Github Source}
 * @noResolution
 */
declare module 'light_and_shadows.light' {
  /**
   * A point light source as `bulb.script` builds it. Add one to `list` under its game
   * object id and remove it when the light is gone.
   */
  export interface LightSource {
    /** The color in `x`, `y`, `z`. `w` is the power `update` attenuates by distance; `bulb.script` sets it to `1 / power`. */
    value: Vector4;
    /** The color sent to the shader, its `w` attenuated by distance. `update` creates it from nothing when it is absent. */
    current_value?: Vector4;
    /** The world position. `w` carries the spotlight smoothness, from `0` (soft) to `1` (hard). */
    position: Vector4;
    /** The spotlight direction. `w` is the cone angle in radians; `0` or less turns the spotlight off. */
    direction: Vector4;
    /** A positive number keeps the source out of the distance sort and always visible; the default is `-1`. */
    num: number;
    /** When `true`, `update` never reads the game object's world position again. */
    static?: boolean;
    /** When `true`, `update` never reads the game object's rotation for the spotlight direction again. */
    static_spot?: boolean;
    /** When `true`, `update` rotates the game object to the camera rotation, as a billboard. */
    rotate?: boolean;
    /** Added to the world Y position each frame. */
    y_offset?: number;
    /** The game object id, as `bulb.script` stores it. */
    id?: Hash;
    /** A timer `bulb.script` stores; `update` does not read it. */
    timer?: number;
  }

  /** Every point light source, keyed by its game object id. `update` reads it every frame. */
  export const list: LuaTable<Hash, LightSource>;

  /** The point the camera looks at, set by `set_position`. Light sources are sorted by their distance from it. */
  export const cam_look_at: Vector3;

  /** The camera world position, set by `set_position`. */
  export const cam_position: Vector3;

  /** The camera rotation, set by `set_position`. A source with `rotate` set turns to it. */
  export const cam_view: Quaternion;

  /** The up vector, rotated by a game object's world rotation to give a spotlight's direction. */
  export const top_v: Vector3;

  /** The camera Z coordinate, the distance from the focus point that depth of field needs. Set it here or with `set_position`'s `cam_z`. */
  export const cam_z: number;

  /** Divides a source's squared distance from the camera focus point before it scales the source's power. */
  export const attenuation_coefficient: number;

  /**
   * Sets the base light uniform constants in `light_and_shadows.constants`. An omitted
   * value leaves its constant as it is. It also posts `clear_color` to `@render:` with
   * `clear_color`, or `fog_color` when that is omitted.
   * @param fog_color The fog color in RGB; `w` is the fog density.
   * @param fog The minimum and maximum Z in camera view space where the fog begins and ends.
   * @param ambient The ambient color.
   * @param clear_color The color that clears the default render target, which is the background color.
   */
  export function set_color(
    fog_color?: Vector4,
    fog?: Vector4,
    ambient?: Vector4,
    clear_color?: Vector4,
  ): void;

  /**
   * Sets the camera rotation, the point the camera looks at, and the camera position.
   * @param cam_rotation The camera rotation.
   * @param cam_look_at_position The point the camera looks at.
   * @param cam_position The camera world position.
   * @param cam_z The camera Z coordinate, the distance from the focus point, for depth of field. Omitted, `cam_z` keeps its value.
   */
  export function set_position(
    cam_rotation: Quaternion,
    cam_look_at_position: Vector3,
    cam_position: Vector3,
    cam_z?: number,
  ): void;

  /**
   * Clears the light sources sent to the shader and restores the module's default
   * ambient, fog color and fog constants.
   * @param self Unused.
   */
  export function reset(self: object): void;

  /**
   * Prepares the constants for the render script: updates each source's position and
   * spotlight direction from its game object, sorts the sources by distance from the
   * point the camera looks at into `light_and_shadows.constants.lights`, attenuates
   * their power, and copies the camera values. Call it from `update`.
   * @param self Unused.
   * @param dt Unused.
   */
  export function update(self: object, dt: number): void;
}
