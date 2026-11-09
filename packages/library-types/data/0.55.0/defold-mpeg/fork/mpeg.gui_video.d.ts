/** @noSelfInFile */

/**
 * Plays an MPEG1 or AV1 video on a GUI box node, optionally with its sound.
 * It is built on the `mpeg` native extension. Call `init` from the GUI script's
 * `init`, `update` from its `update` and `final` from its `final`, passing the
 * script's `self`: the module keeps each player on it. Map
 * `/mpeg/video_yuv.material` in the GUI scene as `video_yuv` to convert frames on the
 * GPU instead of the CPU.
 * @see {@link https://github.com/Morgerion/defold-mpeg|Github Source}
 * @noResolution
 */
declare module "mpeg.gui_video" {
  /**
   * A video player `init` starts.
   * It is the module's own state, kept on `self` under its `field`, so pass the
   * `field` back to address it rather than reading this value.
   */
  export type Player = Opaque<"gui_video_player">;

  /** The `init` options every video takes. */
  export interface CommonOptions {
    /** Id of the box node that shows the video. */
    node: string | Hash;
    /**
     * Field on `self` that holds this player, for a GUI with several videos.
     * Defaults to one shared field, so a single video needs none.
     */
    field?: string;
    /** URL of the GUI component the runtime atlas is added to. Defaults to `msg.url()`. */
    gui_url?: Url;
    /** URL of a sound component to play the audio track through. Without it the video plays silently. */
    sound?: string | Hash | Url;
    /**
     * A separate MPEG audio file to play instead of the video's own track.
     * It is a `custom_resources` path. An AV1 video needs it for sound.
     */
    audio_resource?: string;
    /** A separate MPEG audio file's data, used instead of `audio_resource`. */
    audio_data?: string | Opaque<"buffer">;
    /**
     * The sound resource the `sound` component plays.
     * Its data is replaced with the decoded track. Defaults to
     * `/mpeg/video_sound.wavc`; two videos with sound at once each need their own copy.
     */
    sound_resource?: string | Hash;
    /** Gain of the sound. Defaults to `1`. */
    gain?: number;
    /**
     * Whether frames are converted to RGB by the YUV material.
     * `true` requires the material and throws when it is not mapped; `false` always
     * converts on the CPU. Defaults to using the material when it is mapped.
     */
    yuv?: boolean;
    /** Name of the YUV material in the GUI scene. Defaults to `video_yuv`. */
    yuv_material?: string | Hash;
    /** Loop the video and its sound. Defaults to `true`. */
    loop?: boolean;
    /** Stop a non-looping video on its last frame. Defaults to `true`. */
    stop_on_last_frame?: boolean;
    /** Crossfade between neighbouring frames, using a clone of the node. Defaults to `false`. */
    blend_frames?: boolean;
    /** Speed multiplier, applied to the sound as well. Defaults to `1`. */
    playback_speed?: number;
    /** Playback frame rate; when set, it overrides `playback_speed`. */
    playback_fps?: number;
    /** Frame rate to use when the file stores none. Defaults to `24`. */
    fallback_fps?: number;
    /** Most video frames decoded in one game frame. Defaults to `2`. */
    max_frames_per_update?: number;
    /**
     * With sound, how far in seconds the picture may fall behind it.
     * Past that it jumps to the nearest key frame. Defaults to `0.3`.
     */
    max_lag?: number;
    /** Enable the node once the video is ready. Defaults to `true`. */
    enable_node?: boolean;
    /** Base name of the runtime texture and atlas paths. Defaults to `gui_video`. */
    runtime_name?: string;
    /** Key the runtime atlas is added to the GUI under. Defaults to `video`. */
    texture_key?: string;
    /** Id of the runtime atlas animation the node plays. Defaults to `white`. */
    animation_id?: string;
  }

  /** `init` options for a video that is a game resource. */
  export interface ResourceOptions extends CommonOptions {
    /** Path of the video in `custom_resources`. */
    video_resource: string;
    /** The video's data; when given, it is played instead of loading `video_resource`. */
    video_data?: string | Opaque<"buffer">;
  }

  /** `init` options for a video that is not a game resource, such as one read from disk or downloaded. */
  export interface DataOptions extends CommonOptions {
    /** The video's data. */
    video_data: string | Opaque<"buffer">;
    /** Name of the video in error messages. */
    video_resource?: string;
  }

  /** `init` options: a node and either a `video_resource` or `video_data`. */
  export type Options = ResourceOptions | DataOptions;

  /**
   * Start a video player on `self`, replacing the one in the same `field`.
   * It shows the first frame at once and, with `sound`, decodes the whole audio track
   * and starts it. Throws when the video, its material or its node cannot be used.
   * @param self The GUI script's `self`, which holds the player.
   * @param options The node, the video and how to play it.
   */
  export function init(self: object, options: Options): Player;

  /**
   * Advance one video player.
   * It moves by `dt` scaled by its playback speed or, while its sound plays, to the
   * sound's position. A non-looping video that ends with `stop_on_last_frame` keeps its
   * last frame and is finished.
   * @param self The GUI script's `self`.
   * @param dt The game frame's time step, in seconds.
   * @param field The player's `field`. Defaults to the single-video field.
   */
  export function update(self: object, dt: number, field?: string): void;

  /**
   * Stop one video player and release what it holds.
   * It stops the sound, closes the decoder and releases the runtime texture and atlas.
   * Call it from `final`, or reopening the GUI leaks them.
   * @param self The GUI script's `self`.
   * @param field The player's `field`. Defaults to the single-video field.
   */
  export function final(self: object, field?: string): void;

  /**
   * Whether one video has stopped on its last frame.
   * A looping video, one with `stop_on_last_frame` off, or a `field` with no player
   * never has.
   * @param self The GUI script's `self`.
   * @param field The player's `field`. Defaults to the single-video field.
   */
  export function is_finished(self: object, field?: string): boolean;

  /**
   * Start several video players at once.
   * When one fails, those already started are finalized before the error is rethrown.
   * @param self The GUI script's `self`.
   * @param options_list One options table per video, each with its own `field`.
   */
  export function init_many(self: object, options_list: Options[]): Player[];

  /**
   * Advance the given video players, or every one `self` holds.
   * @param self The GUI script's `self`.
   * @param dt The game frame's time step, in seconds.
   * @param fields The players' fields. Defaults to every player, in start order.
   */
  export function update_all(self: object, dt: number, fields?: string[]): void;

  /**
   * Finalize the given video players, or every one `self` holds, in reverse order.
   * @param self The GUI script's `self`.
   * @param fields The players' fields. Defaults to every player.
   */
  export function final_all(self: object, fields?: string[]): void;

  /**
   * Whether every given video has stopped on its last frame, or every one `self` holds.
   * `false` when there is none.
   * @param self The GUI script's `self`.
   * @param fields The players' fields. Defaults to every player.
   */
  export function are_finished(self: object, fields?: string[]): boolean;
}
