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
     * - `"."` the current game object
     * - `"#"` the current component
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
  }
}
