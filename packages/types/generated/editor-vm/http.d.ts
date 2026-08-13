/** @noSelfInFile */
declare global {
  /**
   * Editor scripting documentation
   */
  namespace http {
    /**
     * Perform an HTTP request
     *
     * @param url - request URL
     * @param opts - Additional request options, a table with the following keys:`method string`request method, defaults to `"GET"``headers table`request headers, a table with string keys and values`body string`request body`as string`response body converter, either `"string"` or `"json"`
     * @returns HTTP response, a table with the following keys:`status integer`response code`headers table`response headers, a table where each key is a lower-cased string, and each value is either a string or an array of strings if the header was repeated`body string, any, nil`response body, present only when `as` option was provided, either a string or a parsed json value
     */
    function request(url: string, opts?: Record<string | number, unknown>): Record<string | number, unknown>;
    namespace server {
      /**
       * Create HTTP response that will stream the content of a file defined by the path
       *
       * @param path - External file path, resolved against project root if relative
       * @param status - HTTP status code, an integer, default 200
       * @param headers - HTTP response headers, a table from lower-case header names to header values
       * @returns HTTP response value, userdata
       */
      function external_file_response(path: string, status?: number, headers?: unknown): unknown;
      /**
       * Create HTTP response with a JSON value
       *
       * @param value - Any Lua value that may be represented as JSON
       * @param status - HTTP status code, an integer, default 200
       * @param headers - HTTP response headers, a table from lower-case header names to header values
       * @returns HTTP response value, userdata
       */
      function json_response(value: unknown, status?: number, headers?: unknown): unknown;
      /**
       * Create HTTP response that will stream the content of a resource defined by the resource path
       *
       * @param resource_path - Resource path (starting with `/`)
       * @param status - HTTP status code, an integer, default 200
       * @param headers - HTTP response headers, a table from lower-case header names to header values
       * @returns HTTP response value, userdata
       */
      function resource_response(resource_path: string, status?: number, headers?: unknown): unknown;
      /**
       * Create HTTP response
       *
       * @param status - HTTP status code, an integer, default 200
       * @param headers - HTTP response headers, a table from lower-case header names to header values
       * @param body - HTTP response body
       * @returns HTTP response value, userdata
       */
      function response(status?: number, headers?: unknown, body?: string): unknown;
      /**
       * Create route definition for the editor's HTTP server
       *
       * @param path - HTTP URI path, starts with `/`; may include path patterns (`{name}` for a single segment and `{*name}` for the rest of the request path) that will be extracted from the path and provided to the handler as a part of the request
       * @param method - HTTP request method, default `"GET"`
       * @param as - Request body converter, either `"string"` or `"json"`; the body will be discarded if not specified
       * @param openapi - Optional OpenAPI Operation Object for this route method, exposed from `/openapi.json`. Must follow `https://spec.openapis.org/oas/v3.0.3.html#operation-object`.
       * @param handler - Request handler function, will receive request argument, a table with the following keys:`path string`full matched path, a string starting with `/``method string`HTTP request method, e.g. `"POST"``headers table<string,(string|string[])>`HTTP request headers, a table from lower-case header names to header values`query string`optional query string`body string, any`optional request body, depends on the `as` argument Handler function should return either a single response value, or 0 or more arguments to the `http.server.response()` function
       * @returns HTTP server route
       * @example
       * ```lua
       * Receive JSON and respond with JSON:
       * http.server.route(
       *   "/json", "POST", "json",
       *   function(request)
       *     pprint(request.body)
       *     return 200
       *   end
       * )
       *
       * Extract parts of the path:
       * http.server.route(
       *   "/users/{user}/orders",
       *   function(request)
       *     print(request.user)
       *   end
       * )
       *
       * Simple file server:
       * http.server.route(
       *   "/files/{*file}",
       *   function(request)
       *     local attrs = editor.external_file_attributes(request.file)
       *     if attrs.is_file then
       *       return http.server.external_file_response(request.file)
       *     elseif attrs.is_directory then
       *       return 400
       *     else
       *       return 404
       *     end
       *   end
       * )
       * ```
       */
      function route(path: string, method: string | undefined, as: string | undefined, openapi: Record<string | number, unknown> | undefined, handler: (...args: unknown[]) => unknown): unknown;
    }
  }
}

export {};
