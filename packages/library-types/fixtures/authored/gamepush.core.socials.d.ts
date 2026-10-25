/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/social-actions|GamePush social actions docs}
 * @noResolution
 */
declare module 'gamepush.core.socials' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface SocialsCallbacks {
    /** A share finished. */
    share?: (success: boolean) => void;
    /** A post finished. */
    post?: (success: boolean) => void;
    /** An invite to friends finished. */
    invite?: (success: boolean) => void;
    /** Joining the community finished. */
    join_community?: (success: boolean) => void;
  }

  /** Whether sharing is supported. */
  export function is_supports_share(): boolean;

  /** Whether the platform's native sharing is supported. */
  export function is_supports_native_share(): boolean;

  /**
   * Shares a link to the game.
   * @param parameters The options for the SDK's `socials.share`, or nil for the defaults.
   */
  export function share(parameters?: Record<string, unknown>): void;

  /** Whether the platform's native posting is supported. */
  export function is_supports_native_posts(): boolean;

  /**
   * Publishes a post.
   * @param parameters The options for the SDK's `socials.post`, or nil for the defaults.
   */
  export function post(parameters?: Record<string, unknown>): void;

  /** Whether the platform's native invites are supported. */
  export function is_supports_native_invite(): boolean;

  /**
   * Invites friends to the game.
   * @param parameters The options for the SDK's `socials.invite`, or nil for the defaults.
   */
  export function invite(parameters?: Record<string, unknown>): void;

  /** Whether the player can be invited to the community on this platform. */
  export function can_join_community(): boolean;

  /** Whether the platform's native community join is supported. */
  export function is_supports_native_community_join(): boolean;

  /** Joins the game's community. */
  export function join_community(): void;

  /**
   * A share link that carries the given parameters. Raises when the table is missing.
   * @param parameters The parameters to put in the link, read back by `get_share_param`.
   */
  export function make_share_url(parameters: Record<string, unknown>): string;

  /**
   * The value of a parameter in the link the player came from, or nil when the link has
   * none. Raises unless `parameter` is a string.
   * @param parameter The parameter's name.
   */
  export function get_share_param(parameter: string): string | undefined;

  /** The social action event handlers. */
  export const callbacks: SocialsCallbacks;
}
