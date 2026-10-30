/** @noSelfInFile **/

/**
 * @see {@link https://github.com/megalanthus/defold-gamepush|Github Source}
 * @see {@link https://docs.gamepush.com/docs/multiplayer|GamePush multiplayer docs}
 * @noResolution
 */
declare module 'gamepush.core.multiplayer' {
  export interface RoomParameters {
    /** The id of the channel that hosts the room. */
    channelId: number;
  }

  export interface SendMessageOptions {
    /** Who receives the message: `"all"` or a player id. */
    target?: string | number;
    /** Deliver the message to the sender as well. */
    echo?: boolean;
  }

  export interface NetworkStats {
    /** The connection's ping. */
    ping: number;
    /** The size of the state buffer. */
    bufferSize: number;
    /** The delay of the state buffer. */
    bufferDelay: number;
  }

  /**
   * Event handlers, called with no `self`. Assign a slot, before or after `init`, to
   * receive that event; leave it unset to ignore it.
   */
  export interface MultiplayerCallbacks {
    /** The player connected to a room. */
    connect?: (result: unknown) => void;
    /** The player disconnected from a room. */
    disconnect?: (result: unknown) => void;
    /** A player joined the room. */
    player_joined?: (result: unknown) => void;
    /** A player left the room. */
    player_left?: (result: unknown) => void;
    /** The player became the room's host. */
    became_host?: () => void;
    /** The player stopped being the room's host. */
    became_peer?: () => void;
    /** Another player became the room's host. */
    host_migrated?: (result: unknown) => void;
    /** The players' states changed. */
    players_updated?: (result: unknown) => void;
    /** The global state changed. */
    global_state_updated?: (result: unknown) => void;
    /** Connecting to a room failed. */
    error_connect?: (error: unknown) => void;
    /** Sending the player's state failed. */
    error_send_state?: (error: unknown) => void;
    /** Disconnecting from a room failed. */
    error_disconnect?: (error: unknown) => void;
    /** An SDK tick, while subscribed with `on_tick`. */
    tick?: (delta: number) => void;
    /** A message from another player, while subscribed with `on_message`. */
    message?: (payload: unknown) => void;
    /** Set by `set_player_initializer`; call that instead of assigning this slot. */
    player_initializer?: (data: unknown) => void;
  }

  /** The fast sync mode, for `set_mode`. */
  export const MODE_FAST: "fast";

  /** The smooth sync mode, for `set_mode`. */
  export const MODE_SMOOTH: "smooth";

  /**
   * Connects to a room. The player must be a member of its channel. Raises when the table
   * is missing.
   * @param parameters The room's channel.
   * @param callback Receives the result.
   */
  export function connect(parameters: RoomParameters, callback?: (result: unknown) => void): void;

  /**
   * Disconnects from a room.
   * @param parameters The room's channel, or nil for the current room.
   * @param callback Receives the result.
   */
  export function disconnect(
    parameters?: RoomParameters,
    callback?: (result: unknown) => void,
  ): void;

  /**
   * Declares the player fields to sync. Raises when the table is missing.
   * @param schema The fields and their settings.
   */
  export function define_player_schema(schema: Record<string, unknown>): void;

  /**
   * Declares the shared fields to sync. Raises when the table is missing.
   * @param schema The fields and their settings.
   */
  export function define_global_schema(schema: Record<string, unknown>): void;

  /**
   * Sets how the host creates a joining player's state. Raises unless `initializer` is a
   * function.
   * @param initializer Receives the player's id and info and returns its initial state.
   */
  export function set_player_initializer(
    initializer: (
      player_id: number,
      player_info: Record<string, unknown>,
    ) => Record<string, unknown>,
  ): void;

  /**
   * Updates the player's state. Raises when the table is missing.
   * @param state The fields to change.
   */
  export function set_player_state(state: Record<string, unknown>): void;

  /**
   * Sets the global state; the host only. Raises when the table is missing.
   * @param state The world state.
   */
  export function set_global_state(state: Record<string, unknown>): void;

  /**
   * Picks the sync mode. Raises unless `mode` is a string.
   * @param mode `MODE_FAST` or `MODE_SMOOTH`.
   */
  export function set_mode(mode: "fast" | "smooth"): void;

  /** Subscribes to the SDK tick, delivered to `callbacks.tick`. */
  export function on_tick(): void;

  /** Unsubscribes from the SDK tick. */
  export function off_tick(): void;

  /**
   * Sends a one-off event to other players. Raises unless `event_name` is a string.
   * @param event_name The message type.
   * @param data JSON-compatible data.
   * @param target_or_options `"all"`, a player id, or the target and echo options; nil
   * sends to everyone.
   */
  export function send_message(
    event_name: string,
    data: unknown,
    target_or_options?: string | number | SendMessageOptions,
  ): void;

  /** Subscribes to messages from other players, delivered to `callbacks.message`. */
  export function on_message(): void;

  /** Unsubscribes from messages from other players. */
  export function off_message(): void;

  /** Whether the player is connected to a room. */
  export function is_connected(): boolean;

  /** Whether the player is the room's host. */
  export function is_host(): boolean;

  /** The players connected to the room. */
  export function connected_players(): Record<string, unknown>[];

  /** The current network figures. */
  export function network_stats(): NetworkStats;

  /** The player's state, or nil before it is set. */
  export function my_state(): Record<string, unknown> | undefined;

  /** Every player's state, keyed by player id. */
  export function players_state(): Record<string, unknown>;

  /** The last global state, or nil before one is set. */
  export function global_state(): Record<string, unknown> | undefined;

  /** The multiplayer event handlers. */
  export const callbacks: MultiplayerCallbacks;
}
