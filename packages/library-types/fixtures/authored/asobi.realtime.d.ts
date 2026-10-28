/** @noSelfInFile **/

/**
 * The realtime connection a client creates as `client.realtime`: one websocket that
 * authenticates the session, carries matchmaking, matches, worlds, chat, votes and
 * extension calls, and keeps a registry of the entities the server syncs.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.realtime' {
  import type { Client, Payload } from 'asobi.client';

  /** The error an extension's RPC method answered with. Branch on `code`. */
  export interface RpcError {
    /** The error code, `"internal"` when the server sent none. */
    code: string;
    /** A message for people, which may be reworded at any time. */
    message?: string;
    /** Further detail the method attached. */
    details?: unknown;
  }

  /** What `world_ack` receives: the highest input `seq` the server consumed, as of `tick`. */
  export interface WorldAck {
    /** The world tick the input was consumed by. */
    tick: number;
    /** The highest `seq` passed to `send_world_input` that the server has consumed. */
    seq: number;
  }

  /**
   * What `error` receives: an `error` frame, which carries a `reason`, or `{ error }` with the
   * websocket's message when the socket fails.
   */
  export type RealtimeError = Payload & { error?: string; reason?: string };

  /**
   * Receives the reply to a request: the reply's payload, or `undefined` and the reason it
   * failed, `"not connected"` when the socket is closed.
   */
  export type RequestCallback = (payload: Payload | undefined, err: string | undefined) => void;

  /** What `join_match`, `find_or_create_match` and `join_world` take beside the id or mode. */
  export interface JoinOptions {
    /** Passed untouched to the game module's join callback, such as a room code or a team pick. */
    ctx?: Payload;
  }

  /** What `list_matches` and `list_worlds` take in place of a mode string. */
  export interface ListOptions {
    /** Only sessions of this mode. */
    mode?: string;
    /** Only sessions with room for another player. */
    has_capacity?: boolean;
  }

  /** What `add_to_matchmaker` and `quick_play` take in place of a mode string. */
  export interface MatchmakerOptions {
    /** The matchmaker mode. Defaults to `"default"`. */
    mode?: string;
    /** Properties the matchmaker groups tickets by. */
    properties?: Payload;
  }

  /**
   * Every event `on` accepts, with the arguments its handlers receive. Server events receive
   * the frame's payload, a table even when the frame carried none.
   */
  export interface RealtimeEvents {
    /**
     * An `error` frame, or `{ error }` with the websocket's message when the socket fails. A
     * frame whose `reason` rejects the access token fires `auth_expired` as well.
     */
    error: (payload: RealtimeError) => void;
    /**
     * `session.connected`: the session is authenticated, and `local_player_id` and `wire` are
     * set. Send game messages only after this fires.
     */
    connected: (payload: Payload) => void;
    /** `session.heartbeat`: the server's heartbeat. */
    heartbeat: (payload: Payload) => void;
    /**
     * `match.state`: a match state snapshot. A `{ tick, updates }` frame has already updated
     * `entities` and fired the entity events and `tick`.
     */
    match_state: (payload: Payload) => void;
    /** `match.matched`: the matchmaker placed the player in a match, carrying its `match_id`. */
    match_matched: (payload: Payload) => void;
    /** `match.joined`: the player joined a match. */
    match_joined: (payload: Payload) => void;
    /** `match.left`: the player left the match. */
    match_left: (payload: Payload) => void;
    /** `match.list`: a list of matches. */
    match_list: (payload: Payload) => void;
    /** `match.finished`: the match ended. */
    match_finished: (payload: Payload) => void;
    /** `match.matchmaker_expired`: the matchmaker ticket expired. */
    matchmaker_expired: (payload: Payload) => void;
    /** `match.matchmaker_failed`: the match could not start, carrying a `reason`. */
    matchmaker_failed: (payload: Payload) => void;
    /** `match.vote_start`: a vote opened. */
    vote_start: (payload: Payload) => void;
    /** `match.vote_tally`: a vote's running tally. */
    vote_tally: (payload: Payload) => void;
    /** `match.vote_result`: a vote's result. */
    vote_result: (payload: Payload) => void;
    /** `match.vote_vetoed`: a vote was vetoed. */
    vote_vetoed: (payload: Payload) => void;
    /** `matchmaker.queued`: the matchmaker accepted the ticket, carrying `ticket_id` and `players_needed`. */
    matchmaker_queued: (payload: Payload) => void;
    /** `matchmaker.removed`: the ticket left the matchmaker. */
    matchmaker_removed: (payload: Payload) => void;
    /** `chat.joined`: the player joined a chat channel. */
    chat_joined: (payload: Payload) => void;
    /** `chat.left`: the player left a chat channel. */
    chat_left: (payload: Payload) => void;
    /** `chat.message`: a message in a joined channel. */
    chat_message: (payload: Payload) => void;
    /** `dm.sent`: a direct message was sent. */
    dm_sent: (payload: Payload) => void;
    /** `dm.message`: a direct message arrived. */
    dm_message: (payload: Payload) => void;
    /** `presence.updated`: a player's presence changed. */
    presence_changed: (payload: Payload) => void;
    /** `notification.new`: a new notification. */
    notification: (payload: Payload) => void;
    /**
     * `game.message` or `module.message`: a message from the game module. The server sends
     * both names for each message, and the event fires for whichever the connection saw first.
     */
    game_message: (payload: Payload) => void;
    /**
     * `game.error` or `module.error`: an error from the game module. The server sends both
     * names for each error, and the event fires for whichever the connection saw first.
     */
    game_error: (payload: Payload) => void;
    /** `module.event`: a named push from a server extension, carrying `event` and `data`. */
    module_event: (payload: Payload) => void;
    /** `vote.cast_ok`: the vote was recorded. */
    vote_cast_ok: (payload: Payload) => void;
    /** `vote.veto_ok`: the veto was recorded. */
    vote_veto_ok: (payload: Payload) => void;
    /**
     * `world.tick`: a world frame. It has already updated `entities` and fired the entity
     * events and `tick`.
     */
    world_tick: (payload: Payload) => void;
    /** `world.terrain`: the world's terrain. */
    world_terrain: (payload: Payload) => void;
    /** `world.list`: a list of worlds. */
    world_list: (payload: Payload) => void;
    /** `world.joined`: the player joined a world. `entities` is emptied first. */
    world_joined: (payload: Payload) => void;
    /** `world.left`: the player left the world. `entities` is emptied first. */
    world_left: (payload: Payload) => void;
    /** `world.phase_changed`: the world's phase changed. */
    phase_changed: (payload: Payload) => void;
    /** `world.finished`: the world ended. */
    world_finished: (payload: Payload) => void;
    /**
     * `world.ack`: the highest input `seq` the server consumed. It fires only for inputs sent
     * with a `seq`.
     */
    world_ack: (ack: WorldAck) => void;
    /**
     * The server rejected the access token: the socket closed, or an `error` frame arrived,
     * for a revoked, invalid or idle-timed-out session. Sign in again rather than retrying.
     */
    auth_expired: (reason: string) => void;
    /** The socket closed for any other reason, `"closed"` when it gave none. */
    disconnected: (reason: string) => void;
    /** An entity entered `entities`, with its full initial state. */
    entity_added: (id: string, state: Payload) => void;
    /**
     * An entity changed. `state` is its whole merged state, never a partial one, and `changed`
     * names the fields that changed.
     */
    entity_updated: (id: string, state: Payload, changed: string[]) => void;
    /** An entity left `entities`. */
    entity_removed: (id: string) => void;
    /**
     * A `world.tick` or `match.state` frame was applied, after its entity events.
     * @param tick The frame's tick, absent for a custom `match.state` that carries none.
     * @param payload The frame.
     */
    tick: (tick: number | undefined, payload: Payload) => void;
    /**
     * A `match.<name>` frame that a match script sent with `game.broadcast(name, payload)`.
     * Frames asobi itself sends keep their own events.
     */
    match_event: (name: string, payload: Payload) => void;
    /**
     * A `world.<name>` frame that a world script sent with `game.broadcast(name, payload)`.
     * Frames asobi itself sends keep their own events.
     */
    world_event: (name: string, payload: Payload) => void;
  }

  /** A client's realtime connection, `client.realtime`. */
  export interface Realtime {
    /** The client this connection belongs to. */
    readonly client: Client;
    /**
     * Every synced entity's whole state, keyed by entity id. Emptied when a world is joined or
     * left.
     */
    readonly entities: LuaMap<string, Payload>;
    /** The signed-in player's entity id, set once `connected` fires. */
    readonly local_player_id: string | undefined;
    /** Set before `connect` to ask for the binary `world.tick` encoding. */
    request_binary_wire: boolean;
    /** The encoding the server granted, read once `connected` fires. */
    readonly wire: 'json' | 'binary';
    /**
     * Set before `connect` to also open the datagram plane, which carries entity positions
     * over UDP. It never opens on HTML5, and the websocket keeps carrying everything either way.
     */
    request_datagram: boolean;

    /**
     * Registers a handler for an event. A name `RealtimeEvents` does not list raises an error,
     * and handlers for one event run in the order they were registered. The reply to a request
     * made with a callback goes to that callback rather than to an event.
     * @param event The event.
     * @param callback The handler.
     */
    on<E extends keyof RealtimeEvents>(event: E, callback: RealtimeEvents[E]): void;

    /**
     * Opens the websocket and authenticates with the client's access token. Set
     * `request_binary_wire` and `request_datagram` before calling it, and register handlers
     * first. Does nothing while connected.
     */
    connect(): void;

    /**
     * Drains the datagram plane, and is a no-op without one. Call it once per frame from
     * `update` when `request_datagram` is set.
     */
    update(): void;

    /** Closes the datagram plane and the websocket. */
    disconnect(): void;

    /**
     * Re-authenticates the open socket with the client's current access token, after a token
     * refresh. Does nothing when not connected.
     */
    reauth(): void;

    /**
     * Joins a match by id. A running match accepts joiners while it has room.
     * @param match_id The match's id.
     * @param callback Receives the `match.joined` payload, or a reason such as
     * `match_not_found` or `match_full`.
     */
    join_match(match_id: string, callback?: RequestCallback): void;
    /**
     * Joins a match by id. A running match accepts joiners while it has room.
     * @param match_id The match's id.
     * @param opts The join context the game module receives.
     * @param callback Receives the `match.joined` payload, or a reason such as
     * `match_not_found` or `match_full`.
     */
    join_match(match_id: string, opts: JoinOptions | undefined, callback?: RequestCallback): void;

    /**
     * Joins a live match of `mode`, creating one when there is none. The server resolves it,
     * so simultaneous callers converge on one match. Needs an asobi server 0.86.0 or later.
     * @param mode The match mode.
     * @param callback Receives the `match.joined` payload, or a reason such as `not_found` or
     * `quick_play_disabled`.
     */
    find_or_create_match(mode: string, callback?: RequestCallback): void;
    /**
     * Joins a live match of `mode`, creating one when there is none. The server resolves it,
     * so simultaneous callers converge on one match. Needs an asobi server 0.86.0 or later.
     * @param mode The match mode.
     * @param opts The join context the game module receives.
     * @param callback Receives the `match.joined` payload, or a reason such as `not_found` or
     * `quick_play_disabled`.
     */
    find_or_create_match(mode: string, opts: JoinOptions | undefined, callback?: RequestCallback): void;

    /**
     * Sends input to the current match.
     * @param input The input.
     */
    send_match_input(input: Payload): void;

    /** Leaves the current match. */
    leave_match(): void;

    /**
     * Lists matches.
     * @param opts A mode, or the mode and whether to list only matches with room.
     * @param callback Receives the list, or the reason it failed.
     */
    list_matches(opts?: string | ListOptions, callback?: RequestCallback): void;

    /**
     * Queues for a match with the matchmaker. Register `matchmaker_queued`, `error` and
     * `matchmaker_failed` first, or a failure goes unnoticed.
     * @param opts A mode, or the mode and its matchmaking properties. Defaults to `"default"`.
     */
    add_to_matchmaker(opts?: string | MatchmakerOptions): void;

    /**
     * Queues for a match with the matchmaker, as `add_to_matchmaker` does.
     * @param opts A mode, or the mode and its matchmaking properties. Defaults to `"default"`.
     */
    quick_play(opts?: string | MatchmakerOptions): void;

    /**
     * Takes a ticket out of the matchmaker.
     * @param ticket_id The ticket's id.
     */
    remove_from_matchmaker(ticket_id: string): void;

    /**
     * Joins a chat channel.
     * @param channel_id The channel's id.
     */
    join_chat(channel_id: string): void;

    /**
     * Sends a message to a chat channel.
     * @param channel_id The channel's id.
     * @param content The message.
     */
    send_chat_message(channel_id: string, content: string): void;

    /**
     * Leaves a chat channel.
     * @param channel_id The channel's id.
     */
    leave_chat(channel_id: string): void;

    /**
     * Casts a vote.
     * @param vote_id The vote's id.
     * @param option_id The chosen option's id.
     */
    cast_vote(vote_id: string, option_id: string): void;

    /**
     * Vetoes a vote.
     * @param vote_id The vote's id.
     */
    cast_veto(vote_id: string): void;

    /**
     * Sends a direct message.
     * @param recipient_id The recipient's player id.
     * @param content The message.
     */
    send_dm(recipient_id: string, content: string): void;

    /**
     * Sets the player's presence.
     * @param status The status. Defaults to `"online"`.
     */
    update_presence(status?: string): void;

    /** Sends a heartbeat. */
    send_heartbeat(): void;

    /**
     * Measures the round trip of one heartbeat.
     * @param callback Receives the round trip in milliseconds, or the reason it failed.
     */
    ping(callback?: (rtt_ms: number | undefined, err: string | undefined) => void): void;

    /**
     * Calls a server extension's RPC method. Calls may answer out of order.
     * @param method The method, such as `"quests.claim"`.
     * @param params The method's parameters. Defaults to an empty table.
     * @param callback Receives the method's result, or the error: an `RpcError` the method
     * answered with, or the reason the request failed.
     */
    rpc(
      method: string,
      params?: Payload,
      callback?: (result: Payload | undefined, err: RpcError | string | undefined) => void,
    ): void;

    /**
     * Lists worlds.
     * @param opts A mode, or the mode and whether to list only worlds with room.
     * @param callback Receives the list, or the reason it failed.
     */
    list_worlds(opts?: string | ListOptions, callback?: RequestCallback): void;

    /**
     * Creates a world.
     * @param mode The world mode.
     * @param callback Receives the reply, or the reason it failed.
     */
    create_world(mode: string, callback?: RequestCallback): void;

    /**
     * Joins a world by id.
     * @param world_id The world's id.
     * @param callback Receives the reply, or the reason it failed.
     */
    join_world(world_id: string, callback?: RequestCallback): void;
    /**
     * Joins a world by id.
     * @param world_id The world's id.
     * @param opts The join context the world's join callback receives, such as a lobby code.
     * @param callback Receives the reply, or the reason it failed.
     */
    join_world(world_id: string, opts: JoinOptions | undefined, callback?: RequestCallback): void;

    /**
     * Joins an open world of `mode`, creating one when there is none. The server resolves it,
     * so simultaneous callers converge on one world.
     * @param mode The world mode.
     * @param callback Receives the reply, or the reason it failed.
     */
    find_or_create_world(mode: string, callback?: RequestCallback): void;

    /**
     * Joins an open world of `mode` or hosts a new one, as `find_or_create_world` does.
     * @param mode The world mode.
     * @param callback Receives the reply, or the reason it failed.
     */
    join_or_host(mode: string, callback?: RequestCallback): void;

    /**
     * Sends input to the current world.
     * @param input The input.
     * @param seq An increasing input number for client-side prediction, which `world_ack`
     * echoes back once the server consumes it.
     */
    send_world_input(input: Payload, seq?: number): void;

    /** Leaves the current world. */
    leave_world(): void;

    /**
     * Internal. Opens the datagram plane: `_handle_message` calls it on `session.connected`
     * when `request_datagram` is set.
     */
    _datagram_open(): void;

    /** Internal. Closes the datagram plane: `disconnect` and a failed open call it. */
    _datagram_stop(): void;

    /** Internal. Applies one datagram pose to `entities`: `update` calls it. */
    _apply_pose(pose: unknown): void;

    /**
     * Internal. Splits the `host:port` endpoint a datagram mint answers with: `_datagram_open`
     * calls it.
     */
    _datagram_endpoint(endpoint: unknown): LuaMultiReturn<[host: string, port: number] | [host: undefined]>;

    /**
     * Internal. Sends `session.connect` with the access token: the open socket and `reauth`
     * call it.
     */
    _send_session_connect(): void;

    /**
     * Internal. Sends a frame with a correlation id and no callback: `leave_match`, `join_chat`
     * and the other methods that take no callback call it.
     */
    _send(msg_type: unknown, payload: unknown): void;

    /**
     * Internal. Sends a frame and records its callback for the reply: the methods taking a
     * callback call it.
     */
    _send_with_callback(msg_type: unknown, payload: unknown, callback: unknown): void;

    /**
     * Internal. Sends a frame with no correlation id: `send_match_input`, `send_world_input`,
     * `send_chat_message` and `send_heartbeat` call it.
     */
    _send_fire_and_forget(msg_type: unknown, payload: unknown, seq: unknown): void;

    /** Internal. Applies one entity delta to `entities`: `_dispatch_tick` calls it. */
    _apply_entity_update(delta: unknown, zkey: unknown): unknown;

    /**
     * Internal. Applies a `world.tick` or `match.state` frame and fires its events:
     * `_handle_message` and `_handle_binary` call it.
     */
    _dispatch_tick(payload: unknown): void;

    /** Internal. Removes the entities a keyframe left out: `_dispatch_tick` calls it. */
    _reconcile_keyframe(zkey: unknown, updates: unknown): void;

    /** Internal. Asks the server for a zone's keyframe after a gap: `_dispatch_tick` calls it. */
    _request_resync(zkey: unknown, zone: unknown): void;

    /** Internal. Decodes a binary `world.tick` frame: `_handle_message` calls it. */
    _handle_binary(raw: unknown): void;

    /** Internal. Routes one websocket message: the socket's callback calls it. */
    _handle_message(raw: unknown): void;
  }

  /**
   * Creates the realtime connection for a client. `create` calls it, so a project reaches the
   * connection as `client.realtime`.
   * @param client The client.
   */
  function new_(client: Client): Realtime;
  export { new_ as new };

  /**
   * Internal. Whether a close or error reason means the session's token was rejected:
   * `connect`'s socket callback and `_handle_message` call it to choose `auth_expired`.
   * @param reason The reason.
   */
  export function _is_auth_close(reason: unknown): boolean;
}
