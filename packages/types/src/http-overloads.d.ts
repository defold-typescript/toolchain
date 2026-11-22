/** @noSelfInFile */
import type { Hash, Url } from "./core-types";

declare global {
  namespace http {
    /**
     * Perform a HTTP/HTTPS request.
     * If no timeout value is passed, the configuration value "network.http_timeout" is used. If that is not set, the timeout value is `0` (which blocks indefinitely).
     *
     * @param url - target url
     * @param method - HTTP/HTTPS method, e.g. "GET", "PUT", "POST" etc.
     * @param callback - response callback function, called once with the final response. `id` is an internal message identifier; do not use it.
     * @param headers - optional table with custom headers
     * @param post_data - optional data to send
     * @param options - optional request options
     * @example
     * ```ts
     * // Basic HTTP-GET request. The callback receives a table with the response
     * // in the fields status, the response (the data) and headers (a table).
     * export default defineScript({
     *   init() {
     *     http.request("http://www.google.com", "GET", (self, _id, response) => {
     *       print(response.status);
     *       print(response.response);
     *       pprint(response.headers);
     *     });
     *   },
     * });
     * ```
     */
    function request(
      url: string,
      method: string,
      callback: (
        self: unknown,
        id: Hash,
        response: {
          status: number;
          url: string;
          response?: string;
          headers?: LuaMap<string, string>;
          path?: string;
          error?: string;
          bytes_sent?: number;
          bytes_received?: number;
          bytes_total?: number;
          range_start?: number;
          range_end?: number;
          document_size?: number;
        },
        sender: Url,
      ) => void,
      headers?: LuaMap<string, string> | Record<string, string>,
      post_data?: string,
      options?: {
        timeout?: number;
        path?: string;
        ignore_cache?: boolean;
        chunked_transfer?: boolean;
        report_progress?: false;
        proxy?: string;
      },
    ): void;
    /**
     * Perform a HTTP/HTTPS request that reports its progress. The callback receives a progress event for each transferred chunk, then the final response.
     *
     * @param url - target url
     * @param method - HTTP/HTTPS method, e.g. "GET", "PUT", "POST" etc.
     * @param callback - response callback function. A progress event carries `bytes_sent`, `bytes_received`, `bytes_total` and `url` but no `status`, so `response.status === undefined` marks one. `id` is an internal message identifier; do not use it.
     * @param headers - optional table with custom headers
     * @param post_data - optional data to send
     * @param options - request options with `report_progress` set to `true` or to a `boolean` value, for example one from an `http.RequestOptions`
     * @example
     * ```ts
     * function update_my_progress_bar(self: unknown, fraction: number) {
     *   // draw the progress bar at the given fraction
     * }
     *
     * export default defineScript({
     *   init() {
     *     http.request(
     *       "http://www.google.com",
     *       "GET",
     *       (self, _id, response) => {
     *         if (response.status === undefined) {
     *           update_my_progress_bar(self, response.bytes_received / response.bytes_total);
     *         } else {
     *           print(response.status);
     *         }
     *       },
     *       undefined,
     *       undefined,
     *       { report_progress: true },
     *     );
     *   },
     * });
     * ```
     *
     * @remarks
     * script_http.cpp:PostProgress posts `bytes_sent`, `bytes_received`,
     * `bytes_total` and `url` on each progress event, and sets no `status`.
     */
    function request(
      url: string,
      method: string,
      callback: (
        self: unknown,
        id: Hash,
        response:
          | {
              status: number;
              url: string;
              response?: string;
              headers?: LuaMap<string, string>;
              path?: string;
              error?: string;
              bytes_sent?: number;
              bytes_received?: number;
              bytes_total?: number;
              range_start?: number;
              range_end?: number;
              document_size?: number;
            }
          | {
              status?: undefined;
              url: string;
              response?: undefined;
              headers?: undefined;
              path?: undefined;
              error?: undefined;
              bytes_sent: number;
              bytes_received: number;
              bytes_total: number;
              range_start?: undefined;
              range_end?: undefined;
              document_size?: undefined;
            },
        sender: Url,
      ) => void,
      headers: LuaMap<string, string> | Record<string, string> | undefined,
      post_data: string | undefined,
      options: {
        timeout?: number;
        path?: string;
        ignore_cache?: boolean;
        chunked_transfer?: boolean;
        report_progress?: boolean;
        proxy?: string;
      },
    ): void;
  }
}
