/** @noSelfInFile **/

/**
 * @see {@link https://github.com/colyseus/colyseus-defold|Github Source}
 * @see {@link https://docs.colyseus.io/getting-started/defold|Colyseus Defold getting started docs}
 * @noResolution
 */
declare module 'colyseus.sdk' {
  /**
   * The payload the websocket extension hands its callback, which a `Connection` forwards
   * with its `close` and `error` events.
   */
  export interface WebSocketEvent {
    /** One of the `websocket.EVENT_*` constants. */
    event: number;
    /** The received data on a message, the error message otherwise. */
    message?: string;
    /** The status code the server closed the connection with, present on a disconnect only. */
    code?: number;
    /** The handshake response information (status, headers), present on a connect. */
    handshake_response?: unknown;
  }

  /**
   * A failed HTTP request. It concatenates and converts with `tostring` to its `message`, so
   * `print("ERROR: " .. err)` reads the same on every path.
   */
  export interface HTTPError {
    /** The HTTP status, or `0` when the request never reached a server. */
    status: number;
    /** What went wrong. */
    message: string;
  }

  /** An error the server sent to the room. */
  export interface RoomError {
    /** The error code. */
    code: number;
    /** The error message. */
    error: string;
  }

  /**
   * What a matchmaking callback receives as `err`: the failed matchmaking request, an error
   * the room sent while joining, or the websocket's error.
   */
  export type MatchmakeError = HTTPError | RoomError | WebSocketEvent;

  /**
   * Receives the outcome of a matchmaking call: `err` when it failed, the joined `room` when
   * it succeeded, never both.
   */
  export type MatchmakeCallback<State = unknown> = (err?: MatchmakeError, room?: Room<State>) => void;

  /**
   * Receives the outcome of an HTTP request: `err` when the request failed or the server
   * answered with an error, and the response body, decoded when it is JSON.
   */
  export type HTTPCallback = (err: HTTPError | undefined, data: unknown) => void;

  /** Where a client connects. */
  export interface ClientSettings {
    /** The server's host name, without a trailing `/`. */
    hostname: string;
    /** The server's port. */
    port: number;
    /** Whether to connect over `wss://` and `https://`. */
    use_ssl?: boolean;
    /** A path prefix the server is mounted under, without a trailing `/`. */
    pathname?: string;
  }

  /** What `Client.reconnect` takes to rejoin a room, read from `Room.reconnection_token`. */
  export interface ReconnectionToken {
    /** The id of the room to rejoin. */
    room_id: string;
    /** The token the server issued when the room was joined. */
    reconnection_token: string;
  }

  /** A seat a matchmaker reserved on the server, which `Client.consume_seat_reservation` joins. */
  export interface SeatReservation {
    /** The room's name. */
    name: string;
    /** The room's id. */
    roomId: string;
    /** The session id reserved for this client. */
    sessionId: string;
    /** The id of the server process the room runs in. */
    processId: string;
    /** The address to connect to instead of the client's own endpoint. */
    publicAddress?: string;
    /** A reconnection token, when the seat rejoins a room. */
    reconnectionToken?: string;
  }

  /** A Colyseus client bound to one server endpoint. Create one with `Client(endpoint)`. */
  export interface Client {
    /** The endpoint the client connects to, parsed from the URL or taken as given. */
    readonly settings: ClientSettings;
    /** The authentication helper, which keeps the session token. */
    readonly auth: Auth;
    /** The HTTP helper, which sends requests to the server's routes. */
    readonly http: HTTP;

    /**
     * Joins a room of `room_name`, creating one when none is available.
     * @param room_name The room type, as the server defines it.
     * @param callback Receives the joined room, or the error.
     */
    join_or_create<State = unknown>(room_name: string, callback: MatchmakeCallback<State>): void;
    /**
     * Joins a room of `room_name`, creating one when none is available.
     * @param room_name The room type, as the server defines it.
     * @param options Join options the server's room receives.
     * @param callback Receives the joined room, or the error.
     */
    join_or_create<State = unknown>(
      room_name: string,
      options: object,
      callback: MatchmakeCallback<State>,
    ): void;

    /**
     * Creates a new room of `room_name` and joins it.
     * @param room_name The room type, as the server defines it.
     * @param callback Receives the joined room, or the error.
     */
    create<State = unknown>(room_name: string, callback: MatchmakeCallback<State>): void;
    /**
     * Creates a new room of `room_name` and joins it.
     * @param room_name The room type, as the server defines it.
     * @param options Create options the server's room receives.
     * @param callback Receives the joined room, or the error.
     */
    create<State = unknown>(room_name: string, options: object, callback: MatchmakeCallback<State>): void;

    /**
     * Joins an existing room of `room_name`, failing when none is available.
     * @param room_name The room type, as the server defines it.
     * @param callback Receives the joined room, or the error.
     */
    join<State = unknown>(room_name: string, callback: MatchmakeCallback<State>): void;
    /**
     * Joins an existing room of `room_name`, failing when none is available.
     * @param room_name The room type, as the server defines it.
     * @param options Join options the server's room receives.
     * @param callback Receives the joined room, or the error.
     */
    join<State = unknown>(room_name: string, options: object, callback: MatchmakeCallback<State>): void;

    /**
     * Joins the room with id `room_id`.
     * @param room_id The id of the room to join.
     * @param callback Receives the joined room, or the error.
     */
    join_by_id<State = unknown>(room_id: string, callback: MatchmakeCallback<State>): void;
    /**
     * Joins the room with id `room_id`.
     * @param room_id The id of the room to join.
     * @param options Join options the server's room receives.
     * @param callback Receives the joined room, or the error.
     */
    join_by_id<State = unknown>(
      room_id: string,
      options: object,
      callback: MatchmakeCallback<State>,
    ): void;

    /**
     * Rejoins a room this client was in, with the token it issued.
     * @param reconnection_token The room's `reconnection_token`, kept from the earlier session.
     * @param callback Receives the rejoined room, or the error.
     */
    reconnect<State = unknown>(
      reconnection_token: ReconnectionToken,
      callback: MatchmakeCallback<State>,
    ): void;

    /**
     * Joins the room a seat was reserved in, such as a seat a matchmaking queue room sent.
     * @param response The seat reservation.
     * @param callback Receives the joined room, or the error.
     */
    consume_seat_reservation<State = unknown>(
      response: SeatReservation,
      callback: MatchmakeCallback<State>,
    ): void;

    /**
     * Measures the latency of one ping to the server. Always calls back: with the latency,
     * or with an error when the connection fails, the server closes it first, or the
     * measurement times out.
     * @param callback Receives the latency in milliseconds, or the error.
     * @param timeout Seconds to wait before failing (default: 1.5).
     */
    get_latency(callback: (err?: string, latency?: number) => void, timeout?: number): void;
    /**
     * Measures the latency of the connection to the server, averaged over `ping_count`
     * pings. Always calls back: with the latency, or with an error when the connection
     * fails, the server closes it before every pong arrives, or the measurement times out.
     * @param ping_count The number of pings to send.
     * @param callback Receives the average latency in milliseconds, or the error.
     * @param timeout Seconds to wait before failing (default: 1.5).
     */
    get_latency(
      ping_count: number,
      callback: (err?: string, latency?: number) => void,
      timeout?: number,
    ): void;
  }

  /** Creates clients, and picks the fastest of several endpoints. */
  export interface ClientConstructor {
    /**
     * Creates a client for a server endpoint.
     * @param endpoint_or_settings A `ws://`, `wss://`, `http://` or `https://` URL, or the
     * settings it would parse to.
     */
    (endpoint_or_settings: string | ClientSettings): Client;

    /**
     * Measures the latency of each endpoint and calls back with a client for the fastest.
     * @param endpoints The endpoints to compare, each a URL or its settings.
     * @param callback Receives the fastest endpoint's client, or an error when the list is
     * empty or no endpoint responded.
     * @param timeout Seconds to wait for each endpoint (default: 1.5).
     */
    select_by_latency(
      this: void,
      endpoints: Array<string | ClientSettings>,
      callback: (err?: string, client?: Client) => void,
      timeout?: number,
    ): void;
  }

  /**
   * The automatic reconnection settings of a room. Change a field to tune them.
   * @noSelf
   */
  export interface ReconnectionSettings {
    /** Whether the room reconnects after a drop (default: `true`). */
    enabled: boolean;
    /** The number of the current reconnection attempt. */
    retry_count: number;
    /** The attempts made before the room gives up and leaves (default: 15). */
    max_retries: number;
    /** The base delay `backoff` scales, in milliseconds (default: 100). */
    delay: number;
    /** The shortest delay between attempts, in milliseconds (default: 100). */
    min_delay: number;
    /** The longest delay between attempts, in milliseconds (default: 5000). */
    max_delay: number;
    /** How long the room must have been joined before a drop reconnects, in milliseconds (default: 5000). */
    min_uptime: number;
    /** Computes the delay before an attempt from its number and `delay` (default: exponential). */
    backoff: (attempt: number, delay: number) => number;
    /** How many outgoing messages are buffered while disconnected (default: 10). */
    max_enqueued_messages: number;
    /** The outgoing messages buffered while disconnected, sent once reconnected. */
    enqueued_messages: { data: string }[];
    /** Whether a reconnection is in progress. */
    is_reconnecting: boolean;
  }

  /**
   * The events a room emits, with the arguments each listener receives.
   * @noSelf
   */
  export interface RoomEvents<State = unknown> {
    /** The room was joined. */
    join: () => void;
    /** The room reconnected after a drop. */
    reconnect: (retry_count: number) => void;
    /** The connection dropped with a code that allows reconnecting, and reconnection starts. */
    drop: (event: WebSocketEvent) => void;
    /**
     * The room was left. Receives the websocket's close data when the server closed the
     * connection, `{ code }` when reconnection gave up or was disabled, and nothing when
     * `leave` was called on a closed connection.
     */
    leave: (event?: WebSocketEvent | { code: number }) => void;
    /** The server sent an error, or the websocket failed. */
    error: (error: RoomError | WebSocketEvent) => void;
    /** The state changed. */
    statechange: (state: State) => void;
  }

  /**
   * Options for `Room.input`.
   * @noSelf
   */
  export interface InputOptions<Data extends object> {
    /** The input schema class. Optional when the server room called `defineInput()`. */
    type?: object;
    /**
     * `"reliable"` (the default) sends one delta per `send`; `"unreliable"` sends a ring of
     * the latest deltas, over the same websocket.
     */
    mode?: "reliable" | "unreliable";
    /** The size of the `"unreliable"` ring (default: 3). */
    history_size?: number;
    /** How far in the past this client draws remote entities, in milliseconds. */
    render_delay?: number;
    /** Decides, per reliable send, whether the input carries a lag-compensation stamp. */
    allow_rewind?: (data: Data) => boolean;
  }

  /**
   * The input handle of a room, from `Room.input`. Change the fields of `data`, then call
   * `send` to encode the change and transmit it.
   */
  export interface InputHandle<Data extends object = Record<string, unknown>> {
    /** The staged input: change its fields, then call `send`. */
    readonly data: Data;

    /**
     * How far in the past this client draws remote entities, in milliseconds. A
     * lag-compensating server rewinds its targets by this much plus half the round trip.
     */
    render_delay(): number;

    /**
     * Sets how far in the past this client draws remote entities.
     * @param ms The delay in milliseconds; `0` when omitted or negative.
     */
    set_render_delay(ms?: number): void;

    /** The number of inputs sent but not yet acknowledged. */
    pending_count(): number;

    /**
     * Encodes the staged input and sends it. Sends one input on every call while the
     * connection is open, an empty frame when nothing changed.
     * @returns The sequence number assigned to the input, or `0` when nothing was sent.
     */
    send(): number;

    /**
     * Calls `listener` with the sequence number at the end of each `send`.
     * @returns A function that unsubscribes the listener.
     */
    on_send(listener: (seq: number) => void): () => void;

    /**
     * Resets the encoder and the round-trip state, as a reconnection does: the next `send`
     * transmits a full snapshot.
     */
    reset(): void;

    /**
     * The buffered snapshot of reliable input `seq`, for replaying it during
     * reconciliation. The instance is reused, so read it right away.
     * @returns The snapshot, or `undefined` when `seq` is acknowledged, unsent, or aged out.
     */
    at(seq: number): Data | undefined;

    /**
     * The server-clock instant, in milliseconds, stamped onto reliable input `seq`.
     * @returns The instant, or `0` when reckon stamping is off or `seq` is out of range.
     */
    reckon_time_at(seq: number): number;

    /**
     * Records the last input sequence number the server processed.
     * @returns The round-trip sample for that acknowledgement in milliseconds, or `-1`
     * when it is unknown.
     */
    ack_input(seq: number): number;
  }

  /** A joined room: its synchronized state, its messages, and its connection. */
  export interface Room<State = unknown> {
    /** The room's synchronized state. */
    readonly state: State;
    /** This client's session id in the room. */
    readonly session_id: string;
    /** The room's id. */
    readonly room_id: string;
    /** The room's name. */
    readonly name: string;
    /** The room's websocket connection. */
    readonly connection: Connection;
    /** The automatic reconnection settings. */
    readonly reconnection: ReconnectionSettings;
    /** What `Client.reconnect` takes to rejoin this room. */
    readonly reconnection_token: ReconnectionToken;

    /**
     * Calls `listener` every time the room emits `event`.
     * @returns The listener, to pass to `off`.
     */
    on<E extends keyof RoomEvents<State>>(event: E, listener: RoomEvents<State>[E]): RoomEvents<State>[E];

    /**
     * Calls `listener` the next time the room emits `event`.
     * @returns The listener, to pass to `off`.
     */
    once<E extends keyof RoomEvents<State>>(event: E, listener: RoomEvents<State>[E]): RoomEvents<State>[E];

    /** Removes the most recently added listener of every event. */
    off(): void;
    /**
     * Removes `listener` from `event`, or the most recently added listener of `event` when
     * `listener` is omitted.
     */
    off<E extends keyof RoomEvents<State>>(event: E, listener?: RoomEvents<State>[E]): void;

    /**
     * Handles every message whose type has no handler of its own.
     * @returns A function that removes the handler.
     */
    on_message(type: "*", handler: (message_type: string | number, message: unknown) => void): () => void;
    /**
     * Handles the messages of one type the server sends, replacing any handler the type had.
     * @param type The message type.
     * @returns A function that removes the handler.
     */
    on_message<T = unknown>(type: string | number, handler: (message: T) => void): () => void;

    /**
     * Leaves the room.
     * @param consented Whether the leave is deliberate (default: `true`). `false` closes the
     * connection without telling the server, as a drop would.
     */
    leave(consented?: boolean): void;

    /**
     * Measures the round trip to the server. Does nothing while the connection is not open.
     * @param callback Receives the round trip in whole milliseconds.
     */
    ping(callback: (latency: number) => void): void;

    /**
     * Returns the room's input handle, creating it on the first call. Later calls return
     * the same handle and ignore their options.
     */
    input<Data extends object = Record<string, unknown>>(options?: InputOptions<Data>): InputHandle<Data>;

    /**
     * Sends a message to the server, or buffers it while reconnecting.
     * @param message_type The message type the server's room handles.
     * @param message The payload, encoded with MessagePack.
     */
    send(message_type: string | number, message?: object | boolean | number | string): void;

    /**
     * Sends raw bytes to the server, or buffers them while reconnecting.
     * @param message_type The message type the server's room handles.
     * @param bytes The bytes, each a number from 0 to 255.
     */
    send_bytes(message_type: string | number, bytes: number[]): void;

    /**
     * Sends a message and waits for the value the server's handler returns. The callback
     * receives exactly one of `response` and `err`: `err` when the handler rejects or
     * throws, the connection closes first, or no reply arrives in time.
     * @param message_type The message type the server's room handles.
     * @param payload The payload, encoded with MessagePack.
     * @param callback Receives the response, or the error.
     * @param timeout_ms Milliseconds to wait for the reply (default: 10000).
     */
    request(
      message_type: string | number,
      payload: unknown,
      callback: (response: unknown, err: unknown) => void,
      timeout_ms?: number,
    ): void;
  }

  /**
   * The events a connection emits, with the arguments each listener receives.
   * @noSelf
   */
  export interface ConnectionEvents {
    /** The websocket connected. */
    open: () => void;
    /** The websocket closed. */
    close: (event: WebSocketEvent) => void;
    /** The websocket failed. */
    error: (event: WebSocketEvent) => void;
    /** A message arrived. */
    message: (message: string) => void;
  }

  /** The websocket connection of a room. */
  export interface Connection {
    /** The connection's state. */
    readonly state: "CONNECTING" | "OPEN" | "CLOSING" | "CLOSED";

    /**
     * Calls `listener` every time the connection emits `event`.
     * @returns The listener, to pass to `off`.
     */
    on<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEvents[E]): ConnectionEvents[E];

    /**
     * Calls `listener` the next time the connection emits `event`.
     * @returns The listener, to pass to `off`.
     */
    once<E extends keyof ConnectionEvents>(event: E, listener: ConnectionEvents[E]): ConnectionEvents[E];

    /** Removes the most recently added listener of every event. */
    off(): void;
    /**
     * Removes `listener` from `event`, or the most recently added listener of `event` when
     * `listener` is omitted.
     */
    off<E extends keyof ConnectionEvents>(event: E, listener?: ConnectionEvents[E]): void;

    /** Sends data over the websocket. Does nothing while the connection is not open. */
    send(data: string): void;

    /** Connects to `endpoint`. Does nothing when the connection is already open. */
    open(endpoint: string): void;

    /**
     * Connects again to the last endpoint, replacing its reconnection query parameters.
     * @param query_params The query parameters to append.
     */
    reconnect(query_params: Record<string, string | number>): void;

    /**
     * Closes the connection.
     * @param close_code The code the `close` event reports, for testing reconnection.
     */
    close(close_code?: number): void;
  }

  /** The schema change callbacks of a room's state, from `callbacks(room)`. */
  export interface Callbacks {
    /**
     * Calls `callback` for each item added to the collection `field` of the root state.
     * @param immediate Whether to call it at once for the items already there (default: `true`).
     * @returns A function that removes the callback.
     */
    on_add<T = unknown, K = unknown>(
      field: string,
      callback: (value: T, key: K) => void,
      immediate?: boolean,
    ): () => void;
    /**
     * Calls `callback` for each item added to the collection `field` of `instance`.
     * @param immediate Whether to call it at once for the items already there (default: `true`).
     * @returns A function that removes the callback.
     */
    on_add<T = unknown, K = unknown>(
      instance: object,
      field: string,
      callback: (value: T, key: K) => void,
      immediate?: boolean,
    ): () => void;

    /**
     * Calls `callback` for each item that changes in the collection `field` of the root
     * state.
     * @returns A function that removes the callback.
     */
    on_change<T = unknown, K = unknown>(field: string, callback: (value: T, key: K) => void): () => void;
    /**
     * Calls `callback` for each item that changes in the collection `field` of `instance`.
     * @returns A function that removes the callback.
     */
    on_change<T = unknown, K = unknown>(
      instance: object,
      field: string,
      callback: (value: T, key: K) => void,
    ): () => void;
    /**
     * Calls `callback` once per patch in which any field of `instance` changed.
     * @returns A function that removes the callback.
     */
    on_change(instance: object, callback: (changes: unknown) => void): () => void;

    /**
     * Calls `callback` for each item removed from the collection `field` of the root state.
     * @returns A function that removes the callback.
     */
    on_remove<T = unknown, K = unknown>(field: string, callback: (value: T, key: K) => void): () => void;
    /**
     * Calls `callback` for each item removed from the collection `field` of `instance`.
     * @returns A function that removes the callback.
     */
    on_remove<T = unknown, K = unknown>(
      instance: object,
      field: string,
      callback: (value: T, key: K) => void,
    ): () => void;

    /**
     * Calls `callback` whenever the field `field` of the root state changes.
     * @param immediate Whether to call it at once when the field is already set (default: `true`).
     * @returns A function that removes the callback.
     */
    listen<T = unknown>(
      field: string,
      callback: (value: T, previous_value: T | undefined) => void,
      immediate?: boolean,
    ): () => void;
    /**
     * Calls `callback` whenever the field `field` of `instance` changes.
     * @param immediate Whether to call it at once when the field is already set (default: `true`).
     * @returns A function that removes the callback.
     */
    listen<T = unknown>(
      instance: object,
      field: string,
      callback: (value: T, previous_value: T | undefined) => void,
      immediate?: boolean,
    ): () => void;
  }

  /** Returns the schema change callbacks of a room. */
  export interface CallbacksModule {
    /** Returns the schema change callbacks of a joined room's state. */
    <State>(room: Room<State>): Callbacks;

    /** Returns the schema change callbacks of a joined room's state, as calling the module does. */
    get<State>(this: void, room: Room<State>): Callbacks;
  }

  /** What an auth change carries. */
  export interface AuthData {
    /** The session token, or `undefined` when signed out. */
    token?: string;
    /** The signed-in user's data, or `undefined` when signed out. */
    user?: unknown;
  }

  /** The authentication helper of a client, which keeps the session token. */
  export interface Auth {
    /**
     * The session token, saved on the device and sent with every request; `undefined` when
     * there is none.
     */
    token: string | undefined;
    /** The HTTP helper the requests go through. */
    readonly http: HTTP;
    /** The route settings: `path` is the server's auth route prefix (default: `"auth"`). */
    readonly settings: { path: string };

    /**
     * Calls `handler` every time the user signs in or out. The first call also fetches the
     * user's data.
     * @returns A function that removes the handler.
     */
    on_change(handler: (auth_data: AuthData) => void): () => void;

    /**
     * Fetches the signed-in user's data.
     * @param callback Receives the data, or `"missing auth token"` when signed out, or the
     * request's error.
     */
    get_user_data(callback: (err: HTTPError | string | undefined, user_data: unknown) => void): void;

    /** Registers a user with an email and a password, and signs them in. */
    register_with_email_and_password(email: string, password: string, callback: HTTPCallback): void;
    /**
     * Registers a user with an email and a password, and signs them in.
     * @param options Request options, such as `headers`, merged into the request.
     */
    register_with_email_and_password(
      email: string,
      password: string,
      options: HTTPRequestOptions,
      callback: HTTPCallback,
    ): void;

    /** Signs a user in with an email and a password. */
    sign_in_with_email_and_password(email: string, password: string, callback: HTTPCallback): void;

    /** Signs in an anonymous user. */
    sign_in_anonymously(callback: HTTPCallback): void;
    /**
     * Signs in an anonymous user.
     * @param options Options sent to the server with the request.
     */
    sign_in_anonymously(options: object, callback: HTTPCallback): void;

    /** Asks the server to email a password reset link. */
    send_password_reset_email(email: string, callback: HTTPCallback): void;

    /**
     * Not implemented: prints a notice and calls `callback` with `"not_implemented"`.
     * @param settings Ignored.
     */
    sign_in_with_provider(
      provider_name: string,
      settings: object | undefined,
      callback: (err: string, data: undefined) => void,
    ): void;

    /** Signs the user out, clearing the token. */
    sign_out(): void;
  }

  /** Options for an HTTP request. */
  export interface HTTPRequestOptions {
    /** Extra request headers, merged over the JSON defaults. */
    headers?: Record<string, string>;
    /** The request body, sent encoded as JSON. */
    body?: unknown;
  }

  /** The HTTP helper of a client, which sends requests to the server's routes. */
  export interface HTTP {
    /** The bearer token sent with every request; `Auth.token` sets it. */
    auth_token: string | undefined;

    /** Sends a `GET` request to the route `segments`. */
    get(segments: string, callback: HTTPCallback): void;
    /** Sends a `GET` request to the route `segments`. */
    get(segments: string, options: HTTPRequestOptions, callback: HTTPCallback): void;

    /** Sends a `POST` request to the route `segments`. */
    post(segments: string, callback: HTTPCallback): void;
    /** Sends a `POST` request to the route `segments`. */
    post(segments: string, options: HTTPRequestOptions, callback: HTTPCallback): void;

    /** Sends a `PUT` request to the route `segments`. */
    put(segments: string, callback: HTTPCallback): void;
    /** Sends a `PUT` request to the route `segments`. */
    put(segments: string, options: HTTPRequestOptions, callback: HTTPCallback): void;

    /** Sends a `DELETE` request to the route `segments`. */
    delete(segments: string, callback: HTTPCallback): void;
    /** Sends a `DELETE` request to the route `segments`. */
    delete(segments: string, options: HTTPRequestOptions, callback: HTTPCallback): void;

    /** Sends a request with `method` to the route `segments`. */
    request(method: string, segments: string, callback: HTTPCallback): void;
    /** Sends a request with `method` to the route `segments`. */
    request(method: string, segments: string, options: HTTPRequestOptions, callback: HTTPCallback): void;
  }

  /** Creates a client: `Client("ws://localhost:2567")`. */
  export const Client: ClientConstructor;

  /** Returns the schema change callbacks of a room: `callbacks(room)` or `callbacks.get(room)`. */
  export const callbacks: CallbacksModule;

  /** The protocol codes the client and the server exchange. */
  export const protocol: {
    /** A room was joined. */
    readonly JOIN_ROOM: 10;
    /** The server sent an error. */
    readonly ERROR: 11;
    /** The room is being left. */
    readonly LEAVE_ROOM: 12;
    /** A room message. */
    readonly ROOM_DATA: 13;
    /** A full room state. */
    readonly ROOM_STATE: 14;
    /** A room state patch. */
    readonly ROOM_STATE_PATCH: 15;
    /** Deprecated in 0.18, and never dispatched. */
    readonly ROOM_DATA_SCHEMA: 16;
    /** A room message of raw bytes. */
    readonly ROOM_DATA_BYTES: 17;
    /** A ping, and the pong the server echoes. */
    readonly PING: 18;
    /** A reliable input. */
    readonly ROOM_INPUT_RELIABLE: 19;
    /** An unreliable input. */
    readonly ROOM_INPUT_UNRELIABLE: 20;
    /** A request awaiting a response. */
    readonly ROOM_REQUEST: 21;
    /** The response to a request. */
    readonly ROOM_RESPONSE: 22;
    /** Isolates the base protocol code (the low 5 bits). */
    readonly CODE_MASK: 0x1f;
    /** Isolates the modifier bits (the high 3 bits). */
    readonly MODIFIER_MASK: 0xe0;
    /** Marks a body prefixed with the server time and the last processed input. */
    readonly MODIFIER_TIMED: 0x80;
    /** The status byte of a response. */
    readonly RESPONSE_STATUS: {
      /** The handler replied. */
      readonly OK: 0;
      /** The handler rejected the request; the reason is the payload. */
      readonly REJECTED: 1;
      /** The handler threw, or there is none; the payload is `{ name, message, code? }`. */
      readonly ERROR: 2;
    };
    /** The tags of the sections that follow a join handshake. */
    readonly HANDSHAKE_SECTION: {
      /** The reflection of the room's input schema. */
      readonly INPUT_REFLECTION: 1;
      /** The input feature flags and rates. */
      readonly INPUT_OPTIONS: 2;
    };
    /** The flags of an input options section. */
    readonly INPUT_FLAGS: {
      /** Reliable inputs carry the snapshot-timeline stamp. */
      readonly RENDER_TIME: 1;
      /** A tick rate in Hz follows. */
      readonly FIXED_TIMESTEP: 2;
      /** A patch rate in milliseconds follows. */
      readonly PATCH_RATE: 4;
      /** A sub-step count follows. */
      readonly SUB_STEPS: 8;
      /** Reliable inputs carry the reckon-timeline stamp. */
      readonly RECKON_TIME: 16;
    };
    /** The websocket close codes. */
    readonly CLOSE_CODE: {
      /** A normal close. */
      readonly NORMAL_CLOSURE: 1000;
      /** The endpoint is going away. */
      readonly GOING_AWAY: 1001;
      /** No status code was received. */
      readonly NO_STATUS_RECEIVED: 1005;
      /** The connection closed abnormally. */
      readonly ABNORMAL_CLOSURE: 1006;
      /** The client left deliberately. */
      readonly CONSENTED: 4000;
      /** The server shut down. */
      readonly SERVER_SHUTDOWN: 4001;
      /** The room closed with an error. */
      readonly WITH_ERROR: 4002;
      /** Reconnection failed. */
      readonly FAILED_TO_RECONNECT: 4003;
      /** The client may try to reconnect. */
      readonly MAY_TRY_RECONNECT: 4010;
    };
  };
}
