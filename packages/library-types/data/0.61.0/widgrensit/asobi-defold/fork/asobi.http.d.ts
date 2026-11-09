/** @noSelfInFile **/

/**
 * The asobi REST transport. Each verb sends a JSON request to the client's server with its
 * access token, refreshes the token pair once and retries on a 401 outside `/auth/`, and
 * calls back with the decoded body or an error. A project reaches it as `client.http`, and
 * every `asobi.api.*` module sends through it.
 * @see {@link https://github.com/widgrensit/asobi-defold|Github Source}
 * @noResolution
 */
declare module 'asobi.http' {
  import type { Client, Payload } from 'asobi.client';

  /** A failed request, as a callback's second argument. */
  export interface HttpError {
    /** The HTTP status code, `401` when the token refresh after a 401 failed. */
    status_code: number;
    /**
     * The server's message, `HTTP <status>` when it sent none, `auth_expired` when the token
     * refresh after a 401 failed, or `invalid_response` when the body was not JSON.
     */
    error: string;
    /**
     * The server's machine-readable error code, empty when it sent none. Absent when the token
     * refresh after a 401 failed, and when the body was not JSON.
     */
    code?: string;
    /** The details the server sent with the error. */
    details?: unknown;
    /** The per-field errors a form-validation route sends. */
    fields?: unknown;
    /** The first 200 characters of a body that was not JSON. */
    raw?: string;
  }

  /**
   * Receives the decoded body, `{}` when the response had none, or the error. A request
   * without a callback sends and ignores the answer.
   */
  export type HttpCallback = (data: Payload | undefined, err: HttpError | undefined) => void;

  /** A query string. Each key and value is converted with `tostring` and url-encoded. */
  export type HttpQuery = Record<string, string | number | boolean>;

  /**
   * Sends a `GET` to the client's `base_url` plus `path`.
   * @param client The client to send as.
   * @param path The path, from its leading `/`.
   * @param query The query string.
   * @param callback Receives the decoded body, or the error.
   */
  export function get(client: Client, path: string, query?: HttpQuery, callback?: HttpCallback): void;

  /**
   * Sends a `POST` with a JSON body to the client's `base_url` plus `path`.
   * @param client The client to send as.
   * @param path The path, from its leading `/`.
   * @param body The body. Defaults to `{}`.
   * @param callback Receives the decoded body, or the error.
   */
  export function post(client: Client, path: string, body?: Payload, callback?: HttpCallback): void;

  /**
   * Sends a `PUT` with a JSON body to the client's `base_url` plus `path`.
   * @param client The client to send as.
   * @param path The path, from its leading `/`.
   * @param body The body. Defaults to `{}`.
   * @param callback Receives the decoded body, or the error.
   */
  export function put(client: Client, path: string, body?: Payload, callback?: HttpCallback): void;

  /**
   * Sends a `DELETE` with no body to the client's `base_url` plus `path`.
   * @param client The client to send as.
   * @param path The path, from its leading `/`.
   * @param callback Receives the decoded body, or the error.
   */
  function delete_(client: Client, path: string, callback?: HttpCallback): void;
  /**
   * Sends a `DELETE` to the client's `base_url` plus `path`, with a JSON body when one is
   * given.
   * @param client The client to send as.
   * @param path The path, from its leading `/`.
   * @param body The body.
   * @param callback Receives the decoded body, or the error.
   */
  function delete_(client: Client, path: string, body: Payload | undefined, callback?: HttpCallback): void;
  export { delete_ as delete };

  /**
   * Internal. Sends one request and, on a 401 outside `/auth/` while the client holds a
   * refresh token, refreshes once and replays it: every verb calls it.
   */
  export function _request(
    client: unknown,
    method: unknown,
    path: unknown,
    url: unknown,
    data: unknown,
    callback: unknown,
    retried: unknown,
  ): void;

  /**
   * Internal. Refreshes the token pair through `client.auth.refresh` and replays the request,
   * or calls back with `auth_expired`: `_request` calls it.
   */
  export function _refresh_and_retry(
    client: unknown,
    method: unknown,
    path: unknown,
    url: unknown,
    data: unknown,
    callback: unknown,
  ): void;

  /** Internal. Shapes a failed response's body into an `HttpError`: `_handle_response` calls it. */
  export function _error(body: unknown, status: unknown): HttpError;

  /** Internal. Whether a path is an `/auth/` route, which never refreshes: `_request` calls it. */
  export function _is_auth_path(path: unknown): boolean;

  /**
   * Internal. The JSON content type and, while the client holds an access token, its bearer
   * header: `_request` calls it.
   */
  export function _headers(client: unknown): Record<string, string>;

  /**
   * Internal. Url-encodes a value after `tostring`: `_build_url` and `asobi.api.auth`'s
   * `unlink_provider` call it.
   */
  export function _urlencode(str: unknown): string;

  /** Internal. Joins the client's `base_url`, the path and the query string: every verb calls it. */
  export function _build_url(client: unknown, path: unknown, query: unknown): string;

  /**
   * Internal. Decodes a response's body and calls back with it, or with an error for a status
   * of 400 or more or a body that is not JSON: `_request` calls it.
   */
  export function _handle_response(response: unknown, callback: unknown): void;
}
