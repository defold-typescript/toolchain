/** @noSelfInFile */
import type { Hash, Url } from "../src/core-types";

declare global {
  /**
   * Functions for passing messages and constructing URL objects.
   */
  namespace msg {
    /**
     * This is equivalent to `msg.url(nil)` or `msg.url("#")`, which creates an url to the current
     * script component.
     *
     * @returns a new URL
     * @example
     * ```ts
     * // Create a new URL which will address the current script:
     * const my_url = msg.url();
     * print(my_url); // => url: [current_collection:/my_instance#my_component]
     * ```
     */
    function url(): Url;
    /**
     * The format of the string must be `[socket:][path][#fragment]`, which is similar to a HTTP URL.
     * When addressing instances:
     *
     * - `socket` is the name of a valid world (a collection)
     *
     * - `path` is the id of the instance, which can either be relative the instance of the calling script or global
     *
     * - `fragment` would be the id of the desired component
     *
     * In addition, the following shorthands are available:
     *
     * - `"."` the current game object
     *
     * - `"#"` the current component
     *
     * @param urlstring - string to create the url from
     * @returns a new URL
     * @example
     * ```ts
     * const my_url = msg.url("#my_component");
     * print(my_url); // => url: [current_collection:/my_instance#my_component]
     *
     * const my_collection_url = msg.url("my_collection:/my_sub_collection/my_instance#my_component");
     * print(my_collection_url); // => url: [my_collection:/my_sub_collection/my_instance#my_component]
     *
     * const my_socket_url = msg.url("my_socket:");
     * print(my_socket_url); // => url: [my_collection:]
     * ```
     */
    function url(urlstring: string): Url;
    /**
     * creates a new URL from separate arguments
     *
     * @param socket - socket of the URL
     * @param path - path of the URL
     * @param fragment - fragment of the URL
     * @returns a new URL
     * @example
     * ```ts
     * const my_socket = "main"; // specify by valid name
     * const my_path = hash("/my_collection/my_gameobject"); // specify as string or hash
     * const my_fragment = "component"; // specify as string or hash
     * const my_url = msg.url(my_socket, my_path, my_fragment);
     *
     * print(my_url); // => url: [main:/my_collection/my_gameobject#component]
     * print(my_url.socket); // => 786443 (internal numeric value)
     * print(my_url.path); // => hash: [/my_collection/my_gameobject]
     * print(my_url.fragment); // => hash: [component]
     * ```
     */
    function url(socket?: string | Hash, path?: string | Hash, fragment?: string | Hash): Url;
  }
}

export {};
