/** @noSelfInFile */
/**
 * 3D positional audio through OpenAL: sound sources created from WAV files
 * loaded with `resource.load`, each with its own position, velocity, pitch,
 * gain, looping and attenuation, all heard from one listener. Defold's own
 * sound system must be disabled for it, with the extension's
 * `sound_null.appmanifest` set under Native Extensions -> App Manifest in
 * `game.project`.
 *
 * @see {@link https://github.com/Lerg/extension-openal|Github Source}
 */
/** @globalTable */
declare module "openal" {
  /** The OpenAL implementation in use, returned by {@link get_info}. */
  interface Info {
    /** Who made the implementation. */
    vendor: string;
    /** The implementation's version. */
    version: string;
    /** The renderer the implementation plays through. */
    renderer: string;
    /** The OpenAL extensions the implementation supports, separated by spaces. */
    extensions: string;
  }

  /** The point every sound is heard from, {@link listener}. */
  interface Listener {
    /** X position. */
    x: number;
    /** Y position. */
    y: number;
    /** Z position. */
    z: number;
    /** X component of the velocity. */
    vx: number;
    /** Y component of the velocity. */
    vy: number;
    /** Z component of the velocity. */
    vz: number;
    /** X component of the "at" vector, the direction the listener faces. */
    orientation_at_x: number;
    /** Y component of the "at" vector. */
    orientation_at_y: number;
    /** Z component of the "at" vector. */
    orientation_at_z: number;
    /** X component of the "up" vector. */
    orientation_up_x: number;
    /** Y component of the "up" vector. */
    orientation_up_y: number;
    /** Z component of the "up" vector. */
    orientation_up_z: number;
  }

  /** A sound source, created by {@link new_source} from a WAV file. */
  interface Source {
    /** X position. */
    x: number;
    /** Y position. */
    y: number;
    /** Z position. */
    z: number;
    /** X component of the velocity. */
    vx: number;
    /** Y component of the velocity. */
    vy: number;
    /** Z component of the velocity. */
    vz: number;
    /** X component of the direction the sound cone points in. */
    dx: number;
    /** Y component of the direction. */
    dy: number;
    /** Z component of the direction. */
    dz: number;
    /** Pitch adjustment, `1` by default. */
    pitch: number;
    /** Gain from `0` to `1`. */
    gain: number;
    /** The distance past which the source no longer attenuates under a clamped distance model, `1000` by default. */
    max_distance: number;
    /** How fast the source attenuates with distance. */
    rolloff_factor: number;
    /** The distance at which the volume drops by half before `rolloff_factor` and `max_distance` apply, `50` by default. */
    reference_distance: number;
    /** The lowest gain the source attenuates to. */
    min_gain: number;
    /** The highest gain the source plays at. */
    max_gain: number;
    /** The gain outside the sound cone. */
    cone_outer_gain: number;
    /** Inner angle of the sound cone, in degrees. */
    cone_inner_angle: number;
    /** Outer angle of the sound cone, in degrees. */
    cone_outer_angle: number;
    /** Playback position in seconds; setting it seeks. */
    time: number;
    /** Whether the sound repeats indefinitely, `false` by default. */
    is_looping: boolean;
    /** Whether the position is relative to the listener, `false` by default. */
    is_relative: boolean;
    /** The playback state. */
    readonly state: "initial" | "playing" | "paused" | "stopped";
    /** Starts playback. */
    play(): void;
    /** Pauses playback. */
    pause(): void;
    /** Moves playback back to the start of the sound. */
    rewind(): void;
    /** Stops playback. */
    stop(): void;
  }

  /**
   * Opens the default audio device and creates the context every other call
   * works through. Call it once, before creating sources.
   */
  function init(): void;

  /** Reads which OpenAL implementation is running. */
  function get_info(): Info;

  /**
   * Sets the model every source's attenuation with distance is calculated by.
   *
   * @param distance_model - The attenuation model; a name outside the seven is ignored.
   */
  function set_distance_model(
    distance_model:
      | "inverse"
      | "inverse_clamped"
      | "linear"
      | "linear_clamped"
      | "exponent"
      | "exponent_clamped"
      | "none",
  ): void;

  /**
   * Creates a sound source and loads a WAV file into it. Only a mono sound is
   * positioned; a stereo one plays as if it were at the listener.
   *
   * @param resource - The WAV file's data, as `resource.load` returns it.
   * @returns The source, or `undefined` when the data cannot be loaded as a WAV file.
   */
  function new_source(resource: Opaque<"buffer">): Source | undefined;

  /**
   * Destroys a source and frees its sound. Reading or writing the source's
   * properties afterwards is an error.
   *
   * @param source - The source to destroy; `undefined` is ignored, so a failed
   * {@link new_source} result can be passed as is.
   */
  function remove_source(source: Source | undefined): void;

  /** Scales the Doppler effect; a higher value makes it more noticeable. A value that is not positive is ignored. */
  let doppler_factor: number;

  /** The speed of sound the Doppler effect is calculated with. A value that is not positive is ignored. */
  let speed_of_sound: number;

  /** The point every sound is heard from. */
  const listener: Listener;
}
