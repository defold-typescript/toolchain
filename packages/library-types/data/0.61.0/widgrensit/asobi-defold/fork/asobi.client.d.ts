/** @noSelfInFile **/

/**
 * The asobi client. `create` builds a client for one asobi server, carrying its tokens and
 * the realtime connection, and `quick_start` signs a guest in, connects and queues for a
 * match in one call.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.client' {
  import * as auth from 'asobi.api.auth';
  import * as dm from 'asobi.api.dm';
  import * as economy from 'asobi.api.economy';
  import * as iap from 'asobi.api.iap';
  import * as inventory from 'asobi.api.inventory';
  import * as leaderboards from 'asobi.api.leaderboards';
  import * as matches from 'asobi.api.matches';
  import * as matchmaker from 'asobi.api.matchmaker';
  import * as notifications from 'asobi.api.notifications';
  import * as players from 'asobi.api.players';
  import * as social from 'asobi.api.social';
  import * as storage from 'asobi.api.storage';
  import * as tournaments from 'asobi.api.tournaments';
  import * as votes from 'asobi.api.votes';
  import * as worlds from 'asobi.api.worlds';
  import * as http from 'asobi.http';
  import type { Realtime } from 'asobi.realtime';

  /** A table the server sends, which the SDK passes on without shaping it. */
  export type Payload = Record<string, unknown>;

  /** A client bound to one asobi server, made by `create`. */
  export interface Client {
    /** The server's host name. */
    host: string;
    /** The server's port. */
    port: number;
    /** Whether the client connects over `https` and `wss`. */
    use_ssl: boolean;
    /** The REST base url, without the port when it is the scheme's default. */
    base_url: string;
    /** The realtime websocket url, `<base>/ws`, without the port when it is the scheme's default. */
    ws_url: string;
    /** The access token, kept in memory only. */
    access_token?: string;
    /**
     * The refresh token. `create` loads the one an earlier session saved with `sys.save`, and
     * `set_tokens` and `clear_tokens` save it again.
     */
    refresh_token?: string;
    /** The signed-in player's id. */
    player_id?: string;
    /** The realtime connection, created with the client. */
    readonly realtime: Realtime;
    /** The REST transport every module below sends through. */
    readonly http: typeof http;
    /** Sign-in, guest devices, linked providers and the token pair. */
    readonly auth: typeof auth;
    /** Player profiles and account erasure. */
    readonly players: typeof players;
    /** The matchmaker queue. */
    readonly matchmaker: typeof matchmaker;
    /** Match listings. */
    readonly matches: typeof matches;
    /** Leaderboard entries and score submission. */
    readonly leaderboards: typeof leaderboards;
    /** Wallets and the store. */
    readonly economy: typeof economy;
    /** The player's items. */
    readonly inventory: typeof inventory;
    /** Friends, groups and chat history. */
    readonly social: typeof social;
    /** Tournament listings and entry. */
    readonly tournaments: typeof tournaments;
    /** The player's notifications. */
    readonly notifications: typeof notifications;
    /** Cloud saves and key-value storage. */
    readonly storage: typeof storage;
    /** In-app purchase verification. */
    readonly iap: typeof iap;
    /** Match votes. */
    readonly votes: typeof votes;
    /** World listings and creation. */
    readonly worlds: typeof worlds;
    /** Direct messages. */
    readonly dm: typeof dm;

    /**
     * Stores a new token pair and saves the refresh token with `sys.save`, so it survives a
     * restart.
     * @param access_token The access token.
     * @param refresh_token The refresh token.
     */
    set_tokens(this: void, access_token: string | undefined, refresh_token: string | undefined): void;

    /** Forgets both tokens and erases the saved refresh token. */
    clear_tokens(this: void): void;
  }

  /** What `quick_start` takes. Every callback is optional. */
  export interface QuickStartOptions {
    /** The server's host name. */
    host: string;
    /** Whether to connect over `https` and `wss`. Defaults to `true`. */
    ssl?: boolean;
    /** The server's port. Defaults to `443` with `ssl`, `8084` without. */
    port?: number;
    /** The matchmaker mode to queue for. Defaults to `"default"`. */
    mode?: string;
    /** Called when the matchmaker accepts the ticket, with `ticket_id` and `players_needed`. */
    on_queued?: (payload: Payload) => void;
    /** Called when the matchmaker places the player in a match, with its `match_id`. */
    on_matched?: (payload: Payload) => void;
    /** Called with each match state snapshot. */
    on_state?: (state: Payload) => void;
    /**
     * Called when the guest sign-in fails, when the match cannot start, and on every realtime
     * `error`, with the failure's `reason`.
     */
    on_failed?: (payload: Payload & { reason?: string }) => void;
    /** Called after the guest sign-in succeeds, before the client connects. */
    on_signed_in?: (data: Payload) => void;
  }

  /**
   * Creates a client for an asobi server, with its realtime connection. Nothing connects
   * until `realtime.connect` is called.
   * @param host The server's host name.
   * @param port The server's port. Defaults to `8084`.
   * @param use_ssl Whether to use `https` and `wss`. Defaults to `false`.
   */
  export function create(host: string, port?: number, use_ssl?: boolean): Client;

  /**
   * Signs a guest in, connects and queues for a match in one call, registering every handler
   * before it connects. The sign-in runs asynchronously, so the client returns at once; use
   * `create` and the realtime connection directly for entity sync or custom match state.
   * @param opts The server, the mode and the callbacks.
   * @returns The client, for disconnecting later or reaching the rest of the API.
   */
  export function quick_start(opts: QuickStartOptions): Client;
}
