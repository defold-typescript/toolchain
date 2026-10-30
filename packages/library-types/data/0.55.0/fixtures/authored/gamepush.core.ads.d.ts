/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/advertising|GamePush advertising docs}
 * @noResolution
 */
declare module 'gamepush.core.ads' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface AdsCallbacks {
    /** An ad of any kind started. */
    start?: () => void;
    /** An ad of any kind closed. */
    close?: (success: boolean) => void;
    /** A fullscreen ad started. */
    fullscreen_start?: () => void;
    /** A fullscreen ad closed. */
    fullscreen_close?: (success: boolean) => void;
    /** A preloader ad started. */
    preloader_start?: () => void;
    /** A preloader ad closed. */
    preloader_close?: (success: boolean) => void;
    /** A rewarded video started. */
    rewarded_start?: () => void;
    /** A rewarded video closed. */
    rewarded_close?: (success: boolean) => void;
    /** The player earned the reward for watching a rewarded video. */
    rewarded_reward?: () => void;
    /** The sticky banner started. */
    sticky_start?: () => void;
    /** The sticky banner rendered. */
    sticky_render?: () => void;
    /** The sticky banner refreshed. */
    sticky_refresh?: () => void;
    /** The sticky banner closed. */
    sticky_close?: () => void;
  }

  /** Whether an ad blocker is on. */
  export function is_adblock_enabled(): boolean;

  /** Whether the sticky banner is available. */
  export function is_sticky_available(): boolean;

  /** Whether fullscreen ads are available. */
  export function is_fullscreen_available(): boolean;

  /** Whether rewarded videos are available. */
  export function is_rewarded_available(): boolean;

  /** Whether preloader ads are available. */
  export function is_preloader_available(): boolean;

  /** Whether the sticky banner is showing. */
  export function is_sticky_playing(): boolean;

  /** Whether a fullscreen ad is playing. */
  export function is_fullscreen_playing(): boolean;

  /** Whether a rewarded video is playing. */
  export function is_rewarded_playing(): boolean;

  /** Whether a preloader ad is playing. */
  export function is_preloader_playing(): boolean;

  /** Whether a countdown overlay shows before a fullscreen ad. */
  export function is_countdown_overlay_enabled(): boolean;

  /** Whether an overlay shows when a rewarded video fails to play. */
  export function is_rewarded_failed_overlay_enabled(): boolean;

  /** Whether the platform allows a fullscreen ad before gameplay starts. */
  export function can_show_fullscreen_before_gameplay(): boolean;

  /**
   * Shows a fullscreen ad.
   * @param callback Receives whether the ad was shown.
   * @param parameters The ad options, or nil for the defaults.
   */
  export function show_fullscreen(
    callback?: (result: boolean) => void,
    parameters?: Record<string, unknown>,
  ): void;

  /**
   * Shows a preloader ad.
   * @param callback Receives whether the ad was shown.
   */
  export function show_preloader(callback?: (result: boolean) => void): void;

  /**
   * Shows a rewarded video. Grant the reward when `callback` receives `true`, or in
   * `callbacks.rewarded_reward`.
   * @param callback Receives whether the video was watched to the reward.
   * @param parameters The ad options, or nil for the defaults.
   */
  export function show_rewarded_video(
    callback?: (result: boolean) => void,
    parameters?: Record<string, unknown>,
  ): void;

  /**
   * Shows the sticky banner.
   * @param callback Receives whether the banner was shown.
   */
  export function show_sticky(callback?: (result: boolean) => void): void;

  /**
   * Refreshes the sticky banner.
   * @param callback Receives whether the banner was refreshed.
   */
  export function refresh_sticky(callback?: (result: boolean) => void): void;

  /**
   * Closes the sticky banner.
   * @param callback Called when the banner is closed.
   */
  export function close_sticky(callback?: () => void): void;

  /** The ad event handlers. */
  export const callbacks: AdsCallbacks;
}
