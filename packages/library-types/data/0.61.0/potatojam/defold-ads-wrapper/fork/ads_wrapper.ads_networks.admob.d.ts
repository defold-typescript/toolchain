/** @noSelfInFile **/

/**
 * @see {@link https://github.com/potatojam/defold-ads-wrapper|Github Source}
 * @see {@link https://github.com/defold/extension-admob|AdMob extension}
 * @noResolution
 */
declare module 'ads_wrapper.ads_networks.admob' {
  import type { ads_callback, ads_response } from 'ads_wrapper.ads_wrapper';

  /** The network's name, `"admob"`, reported as `networkName` in every response. */
  export const NAME: "admob";

  /**
   * Internal. Handles an AdMob extension event. The module registers it with
   * `admob.set_callback` itself during `init` and `request_idfa`, so a project never
   * calls it.
   */
  export function _on_event(self: unknown, message_id: number, message?: LuaTable): void;

  /**
   * Api setup. Takes the network parameters given to `register_network`: the unit id
   * for `ads_wrapper.T_REWARDED` and `ads_wrapper.T_INTERSTITIAL`, and for
   * `ads_wrapper.T_BANNER` a table with `id` and optional `size` and `position`. In
   * debug mode AdMob's test unit ids replace them. Cancels every pending operation
   * except an IDFA request.
   */
  export function setup(params?: LuaTable): void;

  /** Check if the environment supports admob api: Android or iOS with the extension. */
  export function is_supported(): boolean;

  /** Initializes `admob` sdk. */
  export function init(callback?: ads_callback, params?: LuaTable): void;

  /** Check if the admob is initialized */
  export function is_initialized(): boolean;

  /**
   * Requests IDFA. Off iOS it succeeds without asking. The response is cached and given
   * to every later call.
   */
  export function request_idfa(callback?: ads_callback, params?: LuaTable): void;

  /** Loads rewarded ads */
  export function load_rewarded(callback?: ads_callback, params?: LuaTable): void;

  /** Check if the rewarded ads is loaded */
  export function is_rewarded_loaded(params?: LuaTable): boolean;

  /**
   * Shows rewarded ads. The response succeeds when the ad closes after the reward was
   * earned, and is skipped when it closes without one.
   */
  export function show_rewarded(callback?: ads_callback, params?: LuaTable): void;

  /** Loads interstitial ads */
  export function load_interstitial(callback?: ads_callback, params?: LuaTable): void;

  /** Check if the interstitial ads is loaded */
  export function is_interstitial_loaded(params?: LuaTable): boolean;

  /** Shows interstitial ads. */
  export function show_interstitial(callback?: ads_callback, params?: LuaTable): void;

  /** Check if the banner is set up */
  export function is_banner_setup(): boolean;

  /** Loads banner. Use `ads.T_BANNER` parameter. */
  export function load_banner(callback?: ads_callback, params?: LuaTable): void;

  /** Unloads active banner. */
  export function unload_banner(callback?: ads_callback, params?: LuaTable): void;

  /** Check if the banner is loaded */
  export function is_banner_loaded(params?: LuaTable): boolean;

  /** Shows loaded banner. */
  export function show_banner(callback?: ads_callback, params?: LuaTable): void;

  /** Hides loaded banner. */
  export function hide_banner(callback?: ads_callback, params?: LuaTable): void;

  /** Check if the banner is showed */
  export function is_banner_showed(params?: LuaTable): boolean;

  /**
   * Sets the banner position, one of the extension's `admob.POS_*` constants. It applies
   * the next time the banner is shown.
   */
  export function set_banner_position(position: number): ads_response;

  /**
   * Sets the banner size, one of the extension's `admob.SIZE_*` constants. It applies
   * the next time the banner is loaded.
   */
  export function set_banner_size(size: number): ads_response;

  /**
   * Cancels a pending rewarded load (`"load"`) or show (any other value), completing its
   * callbacks with an error that carries `reason`.
   */
  export function cancel_rewarded(operation?: "load" | "show", reason?: string): void;

  /**
   * Cancels a pending interstitial load (`"load"`) or show (any other value), completing
   * its callbacks with an error that carries `reason`.
   */
  export function cancel_interstitial(operation?: "load" | "show", reason?: string): void;

  /**
   * Cancels a pending banner load (`"load"`) or unload (any other value), completing its
   * callbacks with an error that carries `reason`.
   */
  export function cancel_banner(operation?: "load" | "unload", reason?: string): void;
}
