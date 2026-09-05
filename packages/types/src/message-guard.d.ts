/** @noSelfInFile */
import type { Hash } from "./core-types";

declare global {
  // Receive-side mirror of `msg.post`'s send-side narrowing (msg-overloads.d.ts).
  // Defold delivers `message_id` as a pre-hashed `Hash`, so the literal a
  // discriminated union would need is gone; re-introducing it here lets the
  // untyped `message` record narrow to its `BuiltinMessages` payload. The
  // transpiler lowers the call to `message_id == hash("...")`
  // (message-guard-lowering.ts), keeping this package free of runtime Lua.
  /**
   * Type guard for an `on_message` handler: narrows the untyped `message` record
   * to its `BuiltinMessages` payload when `message_id` matches a known builtin
   * message id. The engine delivers `message_id` as a pre-hashed `Hash`, so this
   * guard re-introduces the literal a discriminated union would otherwise need.
   *
   * @param message_id - the hashed message id `on_message` received.
   * @param message - the untyped message record `on_message` received.
   * @param expected - the builtin message id to test against (e.g. `"contact_point_response"`).
   * @returns `true` when `message_id` matches `expected`, narrowing `message` to that payload.
   * @example
   * ```ts
   * function on_message(this: void, message_id: Hash, message: object, sender: Url) {
   *   if (isMessage(message_id, message, "contact_point_response")) {
   *     print(message.other_group);
   *   }
   * }
   * ```
   */
  function isMessage<K extends MessageId>(
    message_id: Hash,
    message: Record<string | number, unknown>,
    expected: K,
  ): message is MessagePayload<K>;
}
