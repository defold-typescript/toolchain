/** @noSelfInFile */
/**
 * Wave simulation that floats, pitches and rolls game objects on a water
 * surface, sampled with the same parameters as the water shader.
 *
 * @see {@link https://github.com/selimanac/defold-wave|Github Source}
 */
/** @globalTable */
declare module "wave" {
  /**
   * Initialize the wave simulation. Call it once before any other wave
   * function, with the same parameters the water shader uses.
   *
   * @param wave1_direction - Wave 1 direction (0.0 to 2.0, multiplied by π internally).
   * @param wave1_amplitude - Wave 1 height in world units.
   * @param wave1_wavelength - Wave 1 distance between peaks.
   * @param wave1_speed - Wave 1 animation speed.
   * @param wave2_direction - Wave 2 direction (0.0 to 2.0).
   * @param wave2_amplitude - Wave 2 height in world units.
   * @param wave2_wavelength - Wave 2 distance between peaks.
   * @param wave2_speed - Wave 2 animation speed.
   * @param time_speed - Global time multiplier.
   * @param gameobject_capacity - Pre-allocated entity table size (for example 256), fixed at init time.
   */
  function init(
    wave1_direction: number,
    wave1_amplitude: number,
    wave1_wavelength: number,
    wave1_speed: number,
    wave2_direction: number,
    wave2_amplitude: number,
    wave2_wavelength: number,
    wave2_speed: number,
    time_speed: number,
    gameobject_capacity: number,
  ): void;

  /**
   * Add a floating game object to the wave simulation.
   *
   * The model must face -Z in its unrotated state: wave sampling, pitch, roll
   * and movement all assume it. To face another way at runtime, call
   * `set_yaw` after registration, or pass the matching `forward`.
   *
   * @param instance - The game object.
   * @param float_offset - Vertical offset from the water surface.
   * @param water_base_y - Y coordinate of the flat water plane.
   * @param sample_distance - Probe offset used to compute the pitch and roll normals.
   * @param rotation_smoothing - SLERP factor: `0` or omitted disables rotation, `1` snaps instantly.
   * @param use_world_transform - `true` for objects nested under another moving object, `false` for root objects.
   * @param forward - World-space direction the model's nose faces at registration. Default is `vmath.vector3(0, 0, -1)`.
   * @returns The floater ID used by every later call, or `0` on error such as exceeded capacity.
   */
  function add_gameobject(
    instance: SceneGameObjectAddress | Hash | Url,
    float_offset: number,
    water_base_y: number,
    sample_distance: number,
    rotation_smoothing?: number,
    use_world_transform?: boolean,
    forward?: Vector3,
  ): number;

  /**
   * Live-update the wave 1 parameters. Call it in sync with the water
   * shader's wave 1 update to keep visuals and physics aligned.
   *
   * @param direction - Wave direction.
   * @param amplitude - Wave height.
   * @param wavelength - Distance between peaks.
   * @param speed - Animation speed.
   */
  function update_wave1(
    direction: number,
    amplitude: number,
    wavelength: number,
    speed: number,
  ): void;

  /**
   * Live-update the wave 2 parameters. Call it in sync with the water
   * shader's wave 2 update to keep visuals and physics aligned.
   *
   * @param direction - Wave direction.
   * @param amplitude - Wave height.
   * @param wavelength - Distance between peaks.
   * @param speed - Animation speed.
   */
  function update_wave2(
    direction: number,
    amplitude: number,
    wavelength: number,
    speed: number,
  ): void;

  /**
   * Sample the wave 1 height at a world position, at the simulation's
   * current time.
   *
   * @param pos_x - World X.
   * @param pos_z - World Z.
   * @param time - Required by the runtime; the sample uses the simulation's own clock instead.
   * @returns The wave height.
   */
  function get_wave1_height(pos_x: number, pos_z: number, time: number): number;

  /**
   * Sample the wave 2 height at a world position, at the simulation's
   * current time.
   *
   * @param pos_x - World X.
   * @param pos_z - World Z.
   * @param time - Required by the runtime; the sample uses the simulation's own clock instead.
   * @returns The wave height.
   */
  function get_wave2_height(pos_x: number, pos_z: number, time: number): number;

  /**
   * Override the yaw (heading) of a floater, for steering such as a boat
   * turning.
   *
   * @param id - Floater ID.
   * @param yaw - Yaw in radians.
   */
  function set_yaw(id: number, yaw: number): void;

  /**
   * Begin moving a floater forward at up to `max_speed`, accelerating by
   * `speed_factor` per second.
   *
   * @param id - Floater ID.
   * @param max_speed - Target and maximum speed in world units per second.
   * @param speed_factor - Acceleration factor; higher ramps up faster.
   */
  function move(id: number, max_speed: number, speed_factor: number): void;

  /**
   * Stop a floater. Its target speed becomes `0` and it decelerates smoothly
   * by its speed factor.
   *
   * @param id - Floater ID.
   */
  function stop(id: number): void;

  /**
   * Pause or resume the wave update loop without removing entities.
   *
   * @param state - `true` to pause, `false` to resume.
   */
  function pause(state: boolean): void;

  /**
   * Whether the wave update loop is paused.
   *
   * @returns `true` when paused.
   */
  function is_pause(): boolean;

  /**
   * Shut down the wave simulation and free all resources. The extension
   * finalizer calls it automatically; call it yourself only to
   * reinitialize.
   */
  function shutdown(): void;
}
