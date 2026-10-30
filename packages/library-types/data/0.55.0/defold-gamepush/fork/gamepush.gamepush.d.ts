/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/get-start/getting-started|GamePush getting started docs}
 * @noResolution
 */
declare module 'gamepush.gamepush' {
  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface CommonCallbacks {
    /** The screen orientation changed. */
    change_orientation?: (is_portrait: boolean) => void;
    /** The game was paused. */
    pause?: () => void;
    /** The game was resumed. */
    resume?: () => void;
    /** Another window of the game connected. */
    event_connect?: () => void;
  }

  /** The common event handlers. */
  export const callbacks: CommonCallbacks;

  /** The ISO 639-1 codes of the languages GamePush supports. */
  export const languages: {
    readonly ENGLISH: "en";
    readonly RUSSIAN: "ru";
    readonly FRENCH: "fr";
    readonly ITALIAN: "it";
    readonly GERMAN: "de";
    readonly SPANISH: "es";
    readonly CHINESE: "zh";
    readonly PORTUGUESE: "pt";
    readonly KOREAN: "ko";
    readonly JAPANESE: "ja";
    readonly TURKISH: "tr";
    readonly ARAB: "ar";
    readonly HINDI: "hi";
    readonly INDONESIAN: "id";
  };

  /**
   * Initializes GamePush. Call it once, before any other function. Raises when called
   * twice, without a callback, or when `gamepush.id` or `gamepush.token` is missing from
   * `game.project`.
   * @param callback Receives whether initialization succeeded.
   */
  export function init(callback: (success: boolean) => void): void;

  /** The current language, as an ISO 639-1 code. */
  export function language(): string;

  /**
   * Sets the language. Raises when the code is not a string.
   * @param language_code The ISO 639-1 code, for example `languages.RUSSIAN`.
   */
  export function change_language(language_code: string): void;

  /** Whether the game runs on a mobile device. */
  export function is_mobile(): boolean;

  /** Whether the screen is in portrait orientation. */
  export function is_portrait(): boolean;

  /** Whether the game runs in development mode. */
  export function is_dev(): boolean;

  /** Whether the game's host is a trusted origin. */
  export function is_allowed_origin(): boolean;

  /** The server time, in ISO 8601 format. */
  export function get_server_time(): string;

  /** Whether the game is paused. */
  export function is_paused(): boolean;

  /** Pauses the game. */
  export function pause(): void;

  /** Resumes the game. */
  export function resume(): void;

  /**
   * Sets the game's background image. Raises when the table is missing.
   * @param parameters The background, for example `{ url: "/image.png" }`.
   */
  export function set_background(parameters: Record<string, unknown>): void;

  /** Reports that the game has finished loading. */
  export function game_start(): void;

  /** Whether the game has finished loading. */
  export function is_game_started(): boolean;

  /** Reports that gameplay started. */
  export function gameplay_start(): void;

  /** Reports that gameplay stopped. */
  export function gameplay_stop(): void;

  /** Whether gameplay is running. */
  export function is_game_play(): boolean;

  /** The plugin's version string. */
  export function get_plugin_version(): string;

  /** The game's application details, reviews and shortcuts. */
  export const app: typeof import('gamepush.core.app');
  /** The platform the game runs on and its native SDK. */
  export const platform: typeof import('gamepush.core.platform');
  /** The current player. */
  export const player: typeof import('gamepush.core.player');
  /** Other players' data. */
  export const players: typeof import('gamepush.core.players');
  /** In-game purchases and subscriptions. */
  export const payments: typeof import('gamepush.core.payments');
  /** Leaderboards. */
  export const leaderboard: typeof import('gamepush.core.leaderboard');
  /** Channels and chats. */
  export const channels: typeof import('gamepush.core.channels');
  /** Events. */
  export const events: typeof import('gamepush.core.events');
  /** Rewards. */
  export const rewards: typeof import('gamepush.core.rewards');
  /** Reward schedulers. */
  export const schedulers: typeof import('gamepush.core.schedulers');
  /** Triggers. */
  export const triggers: typeof import('gamepush.core.triggers');
  /** Advertising. */
  export const ads: typeof import('gamepush.core.ads');
  /** Achievements. */
  export const achievements: typeof import('gamepush.core.achievements');
  /** Social actions: sharing, posts, invites and communities. */
  export const socials: typeof import('gamepush.core.socials');
  /** Game variables. */
  export const variables: typeof import('gamepush.core.variables');
  /** Games collections. */
  export const games_collections: typeof import('gamepush.core.games_collections');
  /** Images. */
  export const images: typeof import('gamepush.core.images');
  /** Files. */
  export const files: typeof import('gamepush.core.files');
  /** Documents such as the privacy policy. */
  export const documents: typeof import('gamepush.core.documents');
  /** Analytics. */
  export const analytics: typeof import('gamepush.core.analytics');
  /** Fullscreen. */
  export const fullscreen: typeof import('gamepush.core.fullscreen');
  /** Sounds. */
  export const sounds: typeof import('gamepush.core.sounds');
  /** Toasts and console logs. */
  export const logger: typeof import('gamepush.core.logger');
  /** Key-value storage. */
  export const storage: typeof import('gamepush.core.storage');
  /** Player segments. */
  export const segments: typeof import('gamepush.core.segments');
  /** Experiments. */
  export const experiments: typeof import('gamepush.core.experiments');
  /** Feedback. */
  export const feedbacks: typeof import('gamepush.core.feedbacks');
  /** Reactions. */
  export const reactions: typeof import('gamepush.core.reactions');
  /** Unique values. */
  export const uniques: typeof import('gamepush.core.uniques');
  /** Multiplayer. */
  export const multiplayer: typeof import('gamepush.core.multiplayer');
  /** Overlay windows. */
  export const windows: typeof import('gamepush.core.windows');
  /** The same module as `socials`. */
  export const social_actions: typeof import('gamepush.core.socials');
}
