/** @noSelfInFile */
import type { Hash, Url } from "./core-types";

type MsgPostPayload<K> = K extends BuiltinMessageId
  ? BuiltinMessages[K]
  : Record<string | number, unknown>;

declare global {
  namespace msg {
    /**
     * Post a message to a receiving URL. The most common case is to send messages
     * to a component. If the component part of the receiver is omitted, the message
     * is broadcast to all components in the game object.
     * The following receiver shorthands are available:
     *
     * - `"."` the current game object
     *
     * - `"#"` the current component
     *
     * There is a 2 kilobyte limit to the message parameter table size.
     *
     * @param receiver - The receiver must be a string in URL-format, a URL object or a hashed string.
     * @param message_id - The id must be a string or a hashed string.
     * @param message - a lua table with message parameters to send.
     * @example
     * ```ts
     * msg.post("#collisionobject", "apply_force", {
     *   force: vmath.vector3(0, 1000, 0),
     *   position: go.get_world_position(),
     * });
     * ```
     */
    function post<K extends string>(
      receiver: string | Url | Hash,
      message_id: K,
      message?: MsgPostPayload<K>,
    ): void;
    function post(
      receiver: string | Url | Hash,
      message_id: Hash,
      message?: Record<string | number, unknown>,
    ): void;
    /**
     * Construct a URL. A URL is `[socket:][path][#fragment]`.
     *
     * @remarks
     * Only the following arities are supported at runtime:
     *
     * - `msg.url()` — no-arg.
     * - `msg.url("[socket:][path][#fragment]")` — one string, the full URL.
     * - `msg.url(socket, path, fragment)` — three required args.
     *
     * The two-arg form `msg.url(socket, path)` is a runtime error.
     *
     * In the same world, address a sibling **relatively** — by bare id
     * (`msg.url("camera")`), absolute path (`msg.url("/camera")`), or
     * component (`msg.url("#main")`). The `socket:` prefix only crosses
     * into a collection-proxy-loaded world.
     *
     * @example
     * ```ts
     * // No-arg, then take the current game object's URL.
     * const self: Url = msg.url();
     *
     * // A sibling in the same world — bare id, no socket prefix.
     * const sibling: Url = msg.url("camera");
     *
     * // An absolute path in the same world.
     * const absSibling: Url = msg.url("/camera");
     *
     * // A component on a sibling.
     * const comp: Url = msg.url("camera#script");
     *
     * // Crossing into a proxy-loaded world — `socket` is the world name.
     * const proxied: Url = msg.url(hash("level1"), hash("/door"), hash("script"));
     * ```
     */
    function url(): Url;
    function url(urlstring: string): Url;
    function url(socket: string | Hash, path: string | Hash, fragment: string | Hash): Url;
  }
}
