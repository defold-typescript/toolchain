/** @noSelfInFile */
import type { Hash, Url } from "../src/core-types";

declare global {
  namespace msg {
    /**
     * This is equivalent to `msg.url(nil)` or `msg.url("#")`, which creates an url to the current
     * script component.
     *
     * @returns a new URL
     */
    function url(): Url;
    /**
     * The format of the string must be `[socket:][path][#fragment]`, which is similar to a HTTP URL.
     * When addressing instances:
     * - `socket` is the name of a valid world (a collection)
     * - `path` is the id of the instance, which can either be relative the instance of the calling script or global
     * - `fragment` would be the id of the desired component
     * In addition, the following shorthands are available:
     * - `"."` the current game object
     * - `"#"` the current component
     *
     * @param urlstring - string to create the url from
     * @returns a new URL
     */
    function url(urlstring: string): Url;
    /**
     * creates a new URL from separate arguments
     *
     * @param socket - socket of the URL
     * @param path - path of the URL
     * @param fragment - fragment of the URL
     * @returns a new URL
     */
    function url(socket?: string | Hash, path?: string | Hash, fragment?: string | Hash): Url;
  }
}

export {};
