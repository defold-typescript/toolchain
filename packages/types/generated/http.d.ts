/** @noSelfInFile */
declare global {
  /**
   * Functions for performing HTTP and HTTPS requests.
   */
  namespace http {
    /**
     * Perform a HTTP/HTTPS request.
     * If no timeout value is passed, the configuration value "network.http_timeout" is used. If that is not set, the timeout value is `0` (which blocks indefinitely).
     *
     * @param url - target url
     * @param method - HTTP/HTTPS method, e.g. "GET", "PUT", "POST" etc.
     * @param callback - response callback function
     * `self`
     * object The script instance
     * `id`
     * hash Internal message identifier. Do not use!
     * `response`
     * table The response data. Contains the fields:
     * - number `status`: the status of the response
     * - string `response`: the response data (if not saved on disc)
     * - table `headers`: all the returned headers (if status is 200 or 206)
     * - string `path`: the stored path (if saved to disc)
     * - string `error`: if any unforeseen errors occurred (e.g. file I/O)
     * - number `bytes_received`: the amount of bytes received/sent for a request, only if option `report_progress` is true
     * - number `bytes_total`: the total amount of bytes for a request, only if option `report_progress` is true
     * - number `range_start`: the start offset into the requested file
     * - number `range_end`: the end offset into the requested file (inclusive)
     * - number `document_size`: the full size of the requested file
     * @param headers - optional table with custom headers
     * @param post_data - optional data to send
     * @param options - optional table with request parameters. Supported entries:
     * - number `timeout`: timeout in seconds
     * - string `path`: path on disc where to download the file. Only overwrites the path if status is 200. Path should be absolute
     * - boolean `ignore_cache`: don't return cached data if we get a 304. Not available in HTML5 build
     * - boolean `chunked_transfer`: use chunked transfer encoding for https requests larger than 16kb. Defaults to true. Not available in HTML5 build
     * - boolean `report_progress`: when it is true, the amount of bytes sent and/or received for a request will be passed into the callback function
     * @example
     * ```ts
     * // Basic HTTP-GET request. The callback receives a table with the response
     * // in the fields status, the response (the data) and headers (a table).
     * export default defineScript({
     *   init() {
     *     http.request(
     *       "http://www.google.com",
     *       "GET",
     *       (self, _id, response) => {
     *         if (response.bytes_total !== undefined) {
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
    function request(url: string, method: string, callback: (self: unknown, id: unknown, response: unknown) => void, headers?: LuaMap<string, string>, post_data?: string, options?: { timeout?: number; path?: string; ignore_cache?: boolean; chunked_transfer?: boolean; report_progress?: boolean }): void;
  }
}

export {};
