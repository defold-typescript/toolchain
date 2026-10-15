/** @noSelfInFile */
import type { Hash } from "../../src/core-types";

declare global {
  /**
   * Functions and messages for controlling sound components and
   * mixer groups.
   */
  namespace sound {
    /**
     * Data passed to the completion callback of sound.play. The callback's
     * `message_id` indicates whether playback finished or was stopped manually.
     */
    interface play_completion {
      /**
       * The sequential play identifier for the playback.
       */
      play_id: number;
    }
    /**
     * Sound playback properties
     */
    interface play_properties {
      /**
       * Delay in seconds before playback starts. The default is 0.
       */
      delay?: number;
      /**
       * Gain from 0 to 1. The default is 1; this combines with the group and master gains.
       */
      gain?: number;
      /**
       * Pan from -1 to 1. The default is 0; this is added to the component pan.
       */
      pan?: number;
      /**
       * Playback speed from 0 to 50. The default is 1; this is multiplied by the component speed.
       */
      speed?: number;
      /**
       * Playback offset in seconds. Mutually exclusive with `start_frame`.
       */
      start_time?: number;
      /**
       * Playback offset in frames or samples. Takes precedence over `start_time`.
       */
      start_frame?: number;
    }
    /**
     * Sound stop properties
     */
    interface stop_properties {
      /**
       * Sequential playback identifier returned by sound.play.
       */
      play_id?: number;
    }
    /**
     * Get mixer group gain
     *
     * @param group - group name
     * @returns gain in [0 1] range ([-60dB.. 0dB])
     * @example
     * ```ts
     * // Get the mixer group gain for the "soundfx" and convert to dB:
     * const gain = sound.get_group_gain("soundfx");
     * const gain_db = 60 * gain;
     * ```
     */
    function get_group_gain(group: string | Hash): number;
    /**
     * Get a mixer group name as a string.
     * This function is to be used for debugging and
     * development tooling only. The function does a reverse hash lookup, which does not
     * return a proper string value when the game is built in release mode.
     *
     * @param group - group name
     * @returns group name
     * @example
     * ```ts
     * // Get the mixer group string names so we can show them as labels on a dev mixer overlay:
     * const groups = sound.get_groups();
     * for (const group of groups) {
     *   const name = sound.get_group_name(group);
     *   msg.post("/mixer_overlay#gui", "set_mixer_label", { group: group, label: name });
     * }
     * ```
     */
    function get_group_name(group: Hash): string;
    /**
     * Get a table of all mixer group names (hashes).
     *
     * @returns table of mixer group names
     * @example
     * ```ts
     * // Get the mixer groups, set all gains to 0 except for "master" and "soundfx"
     * // where gain is set to 1:
     * const groups = sound.get_groups();
     * for (const group of groups) {
     *   if (group === hash("master") || group === hash("soundfx")) {
     *     sound.set_group_gain(group, 1);
     *   } else {
     *     sound.set_group_gain(group, 0);
     *   }
     * }
     * ```
     */
    function get_groups(): Hash[];
    /**
     * Get peak value from mixer group.
     * Note that gain is in linear scale, between 0 and 1.
     * To get the dB value from the gain, use the formula `20 * log(gain)`.
     * Inversely, to find the linear value from a dB value, use the formula
     * `10db/20`.
     * Also note that the returned value might be an approximation and in particular
     * the effective window might be larger than specified.
     *
     * @param group - group name
     * @param window - window length in seconds
     * @example
     * ```ts
     * // Get the peak gain from the "master" group and convert to dB for displaying:
     * const [left_p, right_p] = sound.get_peak("master", 0.1);
     * const left_p_db = 20 * Math.log(left_p);
     * const right_p_db = 20 * Math.log(right_p);
     * ```
     */
    function get_peak(group: string | Hash, window: number): LuaMultiReturn<[number, number]>;
    /**
     * Get RMS (Root Mean Square) value from mixer group. This value is the
     * square root of the mean (average) value of the squared function of
     * the instantaneous values.
     * For instance: for a sinewave signal with a peak gain of -1.94 dB (0.8 linear),
     * the RMS is `0.8 × 1/sqrt(2)` which is about 0.566.
     * Note the returned value might be an approximation and in particular
     * the effective window might be larger than specified.
     *
     * @param group - group name
     * @param window - window length in seconds
     * @example
     * ```ts
     * // Get the RMS from the "master" group where a mono -1.94 dB sinewave is playing:
     * const [rms] = sound.get_rms("master", 0.1); // throw away right channel.
     * print(rms); // => 0.56555819511414
     * ```
     */
    function get_rms(group: string | Hash, window: number): LuaMultiReturn<[number, number]>;
    /**
     * Checks if background music is playing, e.g. from iTunes.
     * On non mobile platforms,
     * this function always return `false`.
     * On Android you can only get a correct reading
     * of this state if your game is not playing any sounds itself. This is a limitation
     * in the Android SDK. If your game is playing any sounds, *even with a gain of zero*, this
     * function will return `false`.
     * The best time to call this function is:
     *
     * - In the `init` function of your main collection script before any sounds are triggered
     * - In a window listener callback when the window.WINDOW_EVENT_FOCUS_GAINED event is received
     *
     * Both those times will give you a correct reading of the state even when your application is
     * swapped out and in while playing sounds and it works equally well on Android and iOS.
     *
     * @returns `true` if music is playing, otherwise `false`.
     * @example
     * ```ts
     * // If music is playing, mute "master":
     * if (sound.is_music_playing()) {
     *   // mute "master"
     *   sound.set_group_gain("master", 0);
     * }
     * ```
     */
    function is_music_playing(): boolean;
    /**
     * Checks if a phone call is active. If there is an active phone call all
     * other sounds will be muted until the phone call is finished.
     * On non mobile platforms,
     * this function always return `false`.
     *
     * @returns `true` if there is an active phone call, `false` otherwise.
     * @example
     * ```ts
     * // Test if a phone call is on-going:
     * if (sound.is_phone_call_active()) {
     *   // do something sensible.
     * }
     * ```
     */
    function is_phone_call_active(): boolean;
    /**
     * Set mixer group gain
     *
     * @param group - group name
     * @param gain - gain in range [0..1] mapped to [0 .. -60dB]
     * @example
     * ```ts
     * // Set mixer group gain on the "soundfx" group to 50% (-30dB):
     * sound.set_group_gain("soundfx", 0.5);
     * ```
     */
    function set_group_gain(group: string | Hash, gain: number): void;
    interface properties {
      /**
       * The gain on the sound-component. Note that gain is in linear scale,
       * between 0 and 1.
       */
      gain: number;
      /**
       * The pan on the sound-component. The valid range is from -1.0 to 1.0,
       * representing -45 degrees left, to +45 degrees right.
       */
      pan: number;
      /**
       * The sound data used when playing the sound. The type of the property is hash.
       */
      sound: Hash;
      /**
       * The speed on the sound-component where 1.0 is normal speed, 0.5 is half
       * speed and 2.0 is double speed. Valid range is 0.0 to 50.0.
       */
      speed: number;
    }
  }
}

export {};
