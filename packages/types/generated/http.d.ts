/** @noSelfInFile */
import type { Hash } from "../src/core-types";

declare global {
  /**
   * Functions for performing HTTP and HTTPS requests.
   */
  namespace http {
    /**
     * HTTP request options
     */
    interface request_options {
      /**
       * timeout in seconds
       */
      timeout?: number;
      /**
       * absolute destination path; overwritten only for status 200
       */
      path?: string;
      /**
       * do not return cached data for status 304; unavailable on HTML5
       */
      ignore_cache?: boolean;
      /**
       * use chunked transfer encoding for HTTPS requests larger than 16 KB; defaults to true and is unavailable on HTML5
       */
      chunked_transfer?: boolean;
      /**
       * report transferred and total byte counts to the callback
       */
      report_progress?: boolean;
    }
    /**
     * Perform a HTTP/HTTPS request.
     * If no timeout value is passed, the configuration value "network.http_timeout" is used. If that is not set, the timeout value is `0` (which blocks indefinitely).
     *
     * @param url - target url
     * @param method - HTTP/HTTPS method, e.g. "GET", "PUT", "POST" etc.
     * @param callback - response callback function
     *
     * `self`
     * script_instance The current script instance
     * `id`
     * hash Internal message identifier. Do not use!
     * @param headers - optional table with custom headers
     * @param post_data - optional data to send
     * @param options - optional request options
     * @example
     * ```ts
     * function update_my_progress_bar(self: unknown, fraction: number) {
     *   // draw the progress bar at the given fraction
     * }
     *
     * // Basic HTTP-GET request. The callback receives a table with the response
     * // in the fields status, the response (the data) and headers (a table).
     * export default defineScript({
     *   init() {
     *     http.request(
     *       "http://www.google.com",
     *       "GET",
     *       (self, _id, response) => {
     *         if (response.bytes_received !== undefined && response.bytes_total !== undefined) {
     *           update_my_progress_bar(self, response.bytes_received / response.bytes_total);
     *         } else {
     *           print(response.status);
     *           print(response.response);
     *           pprint(response.headers);
     *         }
     *       },
     *       undefined,
     *       undefined,
     *       { report_progress: true },
     *     );
     *   },
     * });
     * ```
     */
    function request(url: string, method: string, callback: (self: unknown, id: Hash, response: { status: number; response?: string; headers?: LuaMap<string, string>; path?: string; error?: string; bytes_received?: number; bytes_total?: number; range_start?: number; range_end?: number; document_size?: number }) => void, headers?: LuaMap<string, string> | Record<string, string>, post_data?: string, options?: http.request_options): void;
  }
}

export {};
