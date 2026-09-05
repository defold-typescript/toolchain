/** @noSelfInFile */
import type { Hash, Url } from "./core-types";

declare global {
  // DU-style dispatcher built on `isMessage`'s receive-side narrowing
  // (message-guard.d.ts): each handler key is a `BuiltinMessageId` and its
  // `message` param narrows to that id's `BuiltinMessages` payload. It returns
  // an `on_message` handler so it reads as `on_message: onMessage<Self>({ ... })`;
  // `self` threads via the explicit type argument, mirroring `defineScript<Self>`.
  // The transpiler lowers the call to a flat `message_id == hash("...")`
  // if/elseif chain (message-dispatch-lowering.ts), keeping this package free of
  // runtime Lua.
  /**
   * Discriminated-union dispatcher for `on_message`: takes a record of per-message
   * handlers keyed by builtin message id, each receiving its `BuiltinMessages`
   * payload already narrowed, and returns the `on_message` handler that routes to
   * them. Reads as `on_message: onMessage<Self>({ ... })`; `self` threads via the
   * explicit type argument, mirroring `defineScript<Self>`. The transpiler lowers
   * it to a flat `if/elseif message_id == hash("...")` chain.
   *
   * @param handlers - a partial map from builtin message id to its handler; each handler's `message` is narrowed to that id's payload.
   * @returns the `on_message` lifecycle handler that dispatches to the matching entry.
   * @example
   * ```ts
   * defineScript({
   *   on_message: onMessage({
   *     contact_point_response(self, message, sender) {
   *       print(message.other_group);
   *     },
   *   }),
   * });
   * ```
   */
  function onMessage<TSelf = Record<never, never>>(
    handlers: Partial<{
      [K in MessageId]: (self: TSelf, message: MessagePayload<K>, sender: Url) => void;
    }>,
  ): (
    self: TSelf,
    message_id: Hash,
    message: Record<string | number, unknown>,
    sender: Url,
  ) => void;
}
