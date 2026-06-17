/** @noSelfInFile */
import type { Hash, Url } from "../src/core-types";

declare global {
  /**
   * Functions and messages for controlling sound components and
   * mixer groups.
   */
  namespace sound {
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
    function get_group_name(group: string | Hash): string;
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
     * the RMS is `0.8 &times; 1/sqrt(2)` which is about 0.566.
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
     *
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
     * Pause all active voices
     *
     * @param url - the sound that should pause
     * @param pause - true if the sound should pause
     * @example
     * ```ts
     * // Assuming the script belongs to an instance with a sound-component with id
     * // "sound", this will make the component pause all playing voices:
     * sound.pause("#sound", true);
     * ```
     */
    function pause(url: string | Hash | Url, pause: boolean): void;
    /**
     * Make the sound component play its sound. Multiple voices are supported. The limit is set to 32 voices per sound component.
     * A sound will continue to play even if the game object the sound component belonged to is deleted. You can call `sound.stop()` to stop the sound.
     *
     * @param url - the sound that should play
     * @param play_properties - optional table with properties:
     * `delay`
     * number delay in seconds before the sound starts playing, default is 0.
     * `gain`
     * number sound gain between 0 and 1, default is 1. The final gain of the sound will be a combination of this gain, the group gain and the master gain.
     * `pan`
     * number sound pan between -1 and 1, default is 0. The final pan of the sound will be an addition of this pan and the sound pan.
     * `speed`
     * number sound speed where 1.0 is normal speed, 0.5 is half speed and 2.0 is double speed. Valid range is 0.0 to 50.0. The final speed of the sound will be a multiplication of this speed and the sound speed.
     * `start_time`
     * number start playback offset (seconds). Optional, mutually exclusive with `start_frame`.
     * `start_frame`
     * number start playback offset (frames/samples). Optional, mutually exclusive with `start_time`. If both are provided, `start_frame` is used.
     * @param complete_function - function to call when the sound has finished playing or stopped manually via sound.stop.
     *
     * `self`
     * object The current object.
     * `message_id`
     * hash The name of the completion message, which can be either `"sound_done"` if the sound has finished playing, or `"sound_stopped"` if it was stopped manually.
     * `message`
     * table Information about the completion:
     *
     * - number `play_id` - the sequential play identifier that was given by the sound.play function.
     *
     * `sender`
     * url The invoker of the callback: the sound component.
     * @returns The identifier for the sound voice
     * @example
     * ```ts
     * // Assuming the script belongs to an instance with a sound-component with id
     * // "sound", this will make the component play its sound after 1 second:
     * sound.play("#sound", { delay: 1, gain: 0.9, pan: -1.0 });
     *
     * // Using the callback argument, you can chain several sounds together:
     * function sound_done(self, message_id, message, sender) {
     *   // play 'boom' sound fx when the countdown has completed
     *   if (message_id === hash("sound_done") && message.play_id === self.countdown_id) {
     *     sound.play("#boom", undefined, sound_done);
     *   }
     * }
     *
     * export default defineScript({
     *   init(self) {
     *     self.countdown_id = sound.play("#countdown", undefined, sound_done);
     *   },
     * });
     * ```
     */
    function play(url: string | Hash | Url, play_properties?: { delay?: number; gain?: number; pan?: number; speed?: number; start_time?: number; start_frame?: number }, complete_function?: (self: unknown, message_id: unknown, message: unknown, sender: unknown) => void): number;
    /**
     * Set gain on all active playing voices of a sound.
     *
     * @param url - the sound to set the gain of
     * @param gain - sound gain between 0 and 1 [-60dB .. 0dB]. The final gain of the sound will be a combination of this gain, the group gain and the master gain.
     * @example
     * ```ts
     * // Assuming the script belongs to an instance with a sound-component with id
     * // "sound", this will set the gain to 0.9
     * sound.set_gain("#sound", 0.9);
     * ```
     */
    function set_gain(url: string | Hash | Url, gain?: number): void;
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
    /**
     * Set panning on all active playing voices of a sound.
     * The valid range is from -1.0 to 1.0, representing -45 degrees left, to +45 degrees right.
     *
     * @param url - the sound to set the panning value to
     * @param pan - sound panning between -1.0 and 1.0
     * @example
     * ```ts
     * // Assuming the script belongs to an instance with a sound-component with id
     * // "sound", this will set the gain to 0.5
     * sound.set_pan("#sound", 0.5); // pan to the right
     * ```
     */
    function set_pan(url: string | Hash | Url, pan?: number): void;
    /**
     * Stop playing all active voices or just one voice if `play_id` provided
     *
     * @param url - the sound component that should stop
     * @param stop_properties - optional table with properties:
     * `play_id`
     * number the sequential play identifier that should be stopped (was given by the sound.play() function)
     * @example
     * ```ts
     * // Assuming the script belongs to an instance with a sound-component with id
     * // "sound", this will make the component stop all playing voices:
     * sound.stop("#sound");
     * const id = sound.play("#sound");
     * sound.stop("#sound", { play_id: id });
     * ```
     */
    function stop(url: string | Hash | Url, stop_properties?: { play_id?: number }): void;
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
