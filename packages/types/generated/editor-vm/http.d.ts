/** @noSelfInFile */
import type { Opaque } from "../../src/core-types";

declare global {
  /**
   * Editor scripting documentation
   */
  namespace http {
    type response = Opaque<"http.response">;
    type route = Opaque<"http.route">;
    /**
     * Perform an HTTP request
     *
     * @param url - request URL
     * @param opts - request options
     * @returns HTTP response
     */
    function request(url: string, opts?: http.request.options): http.request.response;
    namespace request {
      type method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS" | string;
      /**
       * Options for http.request
       */
      interface options {
        /**
         * request method, defaults to `"GET"`
         */
        method?: http.request.method;
        /**
         * request headers
         */
        headers?: LuaTable<string, string>;
        /**
         * request body
         */
        body?: string;
        /**
         * response body converter; mutually exclusive with `path`
         */
        as?: "string" | "json";
        /**
         * destination file path, resolved against project root if relative; mutually exclusive with `as`
         */
        path?: string;
      }
      /**
       * Response returned by http.request
       */
      interface response {
        /**
         * response code
         */
        status: number;
        /**
         * response headers, where keys are lowercase and repeated headers have arrays of values
         */
        headers: LuaTable<string, string | string[]>;
        /**
         * response body, present only when the `as` option was provided
         */
        body?: unknown;
        /**
         * resolved absolute destination path, present after a successful response was written using the `path` option
         */
        path?: string;
      }
    }
    namespace server {
      type handler = (request: http.server.request) => LuaMultiReturn<[http.response | number | undefined, LuaTable<string, string> | undefined, string | undefined]>;
      /**
       * HTTP server request
       */
      interface request {
        /**
         * route path parameter extracted from a path pattern
         */
        "[string]": unknown;
        /**
         * full matched path, starting with `/`
         */
        path: string;
        /**
         * HTTP request method, e.g. `"POST"`
         */
        method: string;
        /**
         * request headers, keyed by lowercase header name
         */
        headers: LuaTable<string, string | string[]>;
        /**
         * query string
         */
        query?: string;
        /**
         * request body, whose type depends on the route's `as` argument
         */
        body?: unknown;
      }
      /**
       * Create HTTP response that will stream the content of a file defined by the path
       *
       * @param path - External file path, resolved against project root if relative
       * @param status - HTTP status code, an integer, default 200
       * @param headers - HTTP response headers, a table from lower-case header names to header values
       * @returns HTTP response value, userdata
       */
      function external_file_response(path: string, status?: number, headers?: LuaMap<string, string> | Record<string, string>): http.response;
      /**
       * Create HTTP response with a JSON value
       *
       * @param value - Any Lua value that may be represented as JSON
       * @param status - HTTP status code, an integer, default 200
       * @param headers - HTTP response headers, a table from lower-case header names to header values
       * @returns HTTP response value, userdata
       */
      function json_response(value: unknown, status?: number, headers?: LuaMap<string, string> | Record<string, string>): http.response;
      /**
       * Create HTTP response that will stream the content of a resource defined by the resource path
       *
       * @param resource_path - Resource path (starting with `/`)
       * @param status - HTTP status code, an integer, default 200
       * @param headers - HTTP response headers, a table from lower-case header names to header values
       * @returns HTTP response value, userdata
       */
      function resource_response(resource_path: string, status?: number, headers?: LuaMap<string, string> | Record<string, string>): http.response;
      /**
       * Create HTTP response
       *
       * @param status - HTTP status code, an integer, default 200
       * @param headers - HTTP response headers, a table from lower-case header names to header values
       * @param body - HTTP response body
       * @returns HTTP response value, userdata
       */
      function response(status?: number, headers?: LuaMap<string, string> | Record<string, string>, body?: string): http.response;
    }
  }
}

export {};
