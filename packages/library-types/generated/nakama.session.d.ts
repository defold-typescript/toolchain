/** @noSelfInFile **/

/**
 * @see {@link https://github.com/heroiclabs/nakama-defold|Github Source}
 * @noResolution
 */
declare module 'nakama.session' {
  /**
   * A session built from an authentication response. `create` fills the refresh half
   * only when the response carried a refresh token, and `vars` only when the access
   * token carried a `vrs` claim, so those six are absent as often as they are present.
   */
  interface Session {
    /** When `create` built this session, from `os.time()`. */
    created: number;
    /** The access token the server issued, as the JWT string it arrived as. */
    token: string;
    /** The access token's `exp` claim, in seconds since the epoch. */
    expires: number;
    /** The username the access token's `usn` claim carries. */
    username: string;
    /** The user id the access token's `uid` claim carries. */
    user_id: string;
    /** The session variables the access token's `vrs` claim carries, if any. */
    vars?: unknown;
    /** The refresh token the server issued, if the response carried one. */
    refresh_token?: string;
    /** The refresh token's `exp` claim, in seconds since the epoch. */
    refresh_token_expires?: number;
    /** The username the refresh token's `usn` claim carries. */
    refresh_token_username?: string;
    /** The user id the refresh token's `uid` claim carries. */
    refresh_token_user_id?: string;
    /** The session variables the refresh token's `vrs` claim carries. */
    refresh_token_vars?: unknown;
  }

  /**
   * The authentication response `create` reads. Only `token` is required; the refresh
   * token is decoded when present, and every other key of the response is ignored.
   */
  interface SessionData {
    token: string;
    refresh_token?: string;
  }

  /**
   * Whether the session's access token expires within the next twenty-four hours.
   * Refresh the session while this is true rather than waiting for it to expire.
   * @param session A session created with `create`.
   */
  function is_token_expired_soon(session: Session): boolean;

  /**
   * Whether the session's access token has already expired.
   * @param session A session created with `create`.
   */
  function is_token_expired(session: Session): boolean;

  /**
   * Upstream's backwards-compatible alias of `is_token_expired`, kept because older
   * code calls it. New code should call `is_token_expired`.
   * @param session A session created with `create`.
   */
  function expired(session: Session): boolean;

  /**
   * Whether the session's refresh token has expired. A session created without a
   * refresh token counts as expired, there being nothing left to refresh with.
   * @param session A session created with `create`.
   */
  function is_refresh_token_expired(session: Session): boolean;

  /**
   * Builds a session from an authentication response, decoding the tokens it carries
   * to read their expiry, username, user id and session variables.
   * @param data The authentication response, which must carry a `token`.
   */
  function create(data: SessionData): Session;

  /**
   * Writes a session to disk under the project title, so it survives a restart.
   * @param session The session to store.
   * @param id Names the saved session. Defaults to `nakama`.
   * @returns Whether the save succeeded.
   */
  function store(session: Session, id?: string): boolean;

  /**
   * Reads back a session written by `store`.
   * @param id The name the session was stored under. Defaults to `nakama`.
   * @returns The stored session, or `nil` if nothing usable was stored under that name.
   */
  function restore(id?: string): Session | undefined;
}
