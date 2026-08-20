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
     * @param opts - Additional request options, a table with the following keys:`method string`request method, defaults to `"GET"``headers table`request headers, a table with string keys and values`body string`request body`as string`response body converter, either `"string"` or `"json"`; mutually exclusive with `path``path string`destination file path, resolved against project root if relative; mutually exclusive with `as`
     * @returns HTTP response, a table with the following keys:`status integer`response code`headers table`response headers, a table where each key is a lower-cased string, and each value is either a string or an array of strings if the header was repeated`body string, any, nil`response body, present only when `as` option was provided, either a string or a parsed json value`path string, nil`resolved absolute destination path, present only after a successful response was written when the `path` option was provided
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
    }
  }
}

export {};
