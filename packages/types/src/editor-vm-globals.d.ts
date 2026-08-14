/** @noSelfInFile */

import type {
  HttpRouteHandler,
  ZipEntries,
  ZipPackOptions,
  ZipUnpackOptions,
} from "./editor-vm-types";

// The editor VM surfaces the emit leaves behind, hand-authored and pinned to
// their vendored fixtures by `test/editor-vm-globals-parity.test.ts`. Three
// shapes land here: `pprint` is a bare global function with no namespace to hang
// off; the two-segment VARIABLEs (`zip.METHOD.*`, `http.server.*`) are reachable
// by the emitter's nested pass but deliberately withheld, because a VARIABLE
// carries no type and would emit as `unknown` — useless to `ZipPackOptions`,
// which types `method` as a string — while its brief is an unreliable literal
// (upstream's own `zip.ON_CONFLICT.OVERWRITE` reads `"skip"`); and the functions
// whose *vendored signature* cannot be rendered soundly — an optional parameter
// sitting before a required one, or an empty `returnvalues` on a function
// upstream's own prose says returns a value — are written out here as overload
// sets. All three are withheld from the emit by `EDITOR_VM_SKIP_FUNCTIONS`. The
// contract is unchanged and still derived: this file declares exactly what the
// emit leaves behind. The namespaces below merge with the emitted
// `generated/editor-vm/` bodies rather than replacing them. Upstream records no
// type for a VARIABLE, so those annotations are read from each member's prose.

declare global {
  /**
   * Pretty-print a Lua value
   */
  function pprint(value: unknown): void;

  namespace http {
    namespace server {
      /**
       * Editor's HTTP server local url
       */
      const local_url: string;
      /**
       * Editor's HTTP server port
       */
      const port: number;
      /**
       * Editor's HTTP server url
       */
      const url: string;
      /**
       * Create route definition for the editor's HTTP server
       *
       * `method`, `as` and `openapi` are optional but sit before the required
       * `handler`, so each documented call shape is its own overload. An optional
       * is supplied only when every earlier optional is: `method` and `as` are
       * both strings, so a form that skipped `method` alone would be
       * indistinguishable from one that supplied it.
       *
       * @param path - HTTP URI path, starts with `/`; may include path patterns (`{name}` for a single segment and `{*name}` for the rest of the request path) that will be extracted from the path and provided to the handler as a part of the request
       * @param method - HTTP request method, default `"GET"`
       * @param as - Request body converter, either `"string"` or `"json"`; the body will be discarded if not specified
       * @param openapi - Optional OpenAPI Operation Object for this route method, exposed from `/openapi.json`
       * @param handler - Request handler function, receives the request table and returns either a single response value, or 0 or more arguments to `http.server.response()`
       * @returns HTTP server route
       * @example
       * ```ts
       * // Receive JSON and respond with JSON:
       * http.server.route("/json", "POST", "json", (request) => {
       *   pprint(request);
       *   return 200;
       * });
       *
       * // Extract parts of the path:
       * http.server.route("/users/{user}/orders", (request) => {
       *   print((request as { user: string }).user);
       * });
       * ```
       */
      function route(path: string, handler: HttpRouteHandler): unknown;
      function route(path: string, method: string, handler: HttpRouteHandler): unknown;
      function route(path: string, method: string, as: string, handler: HttpRouteHandler): unknown;
      function route(
        path: string,
        method: string,
        as: string,
        openapi: Record<string | number, unknown>,
        handler: HttpRouteHandler,
      ): unknown;
    }
  }

  namespace json {
    /**
     * Decode JSON string to Lua value
     *
     * Upstream records no return value while its own brief names one, so the
     * return is written here. `unknown` is the honest answer: `options.all`
     * makes the result an array, and a JSON document may be a scalar.
     *
     * @param json - json data
     * @param options - A table with the following keys:`all boolean`if `true`, decodes all json values in a string and returns an array
     * @returns the decoded value
     */
    function decode(json: string, options?: Record<string | number, unknown>): unknown;
    /**
     * Encode Lua value to JSON string
     *
     * @param value - any Lua value that may be represented as JSON
     * @returns the encoded document
     */
    function encode(value: unknown): string;
  }

  namespace zip {
    namespace METHOD {
      /**
       * `"deflated"` compression method
       */
      const DEFLATED: string;
      /**
       * `"stored"` compression method, i.e. no compression
       */
      const STORED: string;
    }
    namespace ON_CONFLICT {
      /**
       * `"error"`, any conflict aborts extraction
       */
      const ERROR: string;
      /**
       * `"skip"`, existing file is preserved
       */
      const SKIP: string;
      /**
       * `"skip"`, existing file is overwritten
       */
      const OVERWRITE: string;
    }
    /**
     * Create a ZIP archive
     *
     * `opts` is optional but sits before the required `entries`, so the two
     * documented call shapes are separate overloads.
     *
     * @param output_path - output zip file path, resolved against project root if relative
     * @param opts - compression options
     * @param entries - entries to compress, either a relative path or a list of entries
     * @example
     * ```ts
     * // Archive a file and a folder:
     * zip.pack("build.zip", ["build", "game.project"]);
     *
     * // Change the location of the files within the archive:
     * zip.pack("build.zip", [
     *   ["build/wasm-web", "."],
     *   ["configs/prod.json", "config.json"],
     * ]);
     *
     * // Create archive without compression:
     * zip.pack("build.zip", { method: zip.METHOD.STORED }, ["build", "resources"]);
     *
     * // Don't compress one of the folders:
     * zip.pack("build.zip", [{ 1: "assets", method: zip.METHOD.STORED }, "build/wasm-web"]);
     * ```
     */
    function pack(output_path: string, entries: ZipEntries): void;
    function pack(output_path: string, opts: ZipPackOptions, entries: ZipEntries): void;
    /**
     * Extract a ZIP archive
     *
     * `target_path`, `opts` and `paths` are all optional and share the second
     * slot, so the shape-discriminated forms come first: an all-optional
     * `ZipUnpackOptions` cannot absorb a paths array, and vice versa.
     *
     * @param archive_path - zip file path, resolved against project root if relative
     * @param target_path - target path for extraction, defaults to parent of `archive_path` if omitted
     * @param opts - extraction options
     * @param paths - entries to extract, relative string paths
     * @example
     * ```ts
     * // Extract everything next to the archive:
     * zip.unpack("build/dev/resources.zip");
     *
     * // Extract to a different directory:
     * zip.unpack("build/dev/resources.zip", "build/dev/tmp");
     *
     * // Extract while overwriting existing files on conflict:
     * zip.unpack("build/dev/resources.zip", { on_conflict: zip.ON_CONFLICT.OVERWRITE });
     *
     * // Extract a single file:
     * zip.unpack("build/dev/resources.zip", ["config.json"]);
     * ```
     */
    function unpack(archive_path: string, paths: readonly string[]): void;
    function unpack(archive_path: string, opts: ZipUnpackOptions, paths?: readonly string[]): void;
    function unpack(
      archive_path: string,
      target_path?: string,
      opts?: ZipUnpackOptions,
      paths?: readonly string[],
    ): void;
  }
}
