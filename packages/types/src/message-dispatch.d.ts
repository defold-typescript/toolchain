/** @noSelfInFile */
import type { Hash, Url } from "./core-types";

declare global {
  // DU-style dispatcher built on `isMessage`'s receive-side narrowing
  // (message-guard.d.ts): each catalog handler key is a `MessageId` and its
  // `message` param narrows to that id's `MessagePayload`; any other key is a
  // script-local id declared by its annotated `message`. It returns
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
   * A key outside the catalogs declares a script-local message when its handler
   * annotates `message`; the returned dispatcher carries those ids so
   * {@link ScriptMessages} can hand them to senders.
   *
   * @param handlers - a partial map from message id to its handler; a catalog id's `message` is narrowed to that id's payload, and an annotated handler under any other key declares a script-local id.
   * @returns the `on_message` lifecycle handler that dispatches to the matching entry.
   * @example
   * ```ts
   * defineScript({
   *   on_message: onMessage({
   *     contact_point_response(self, message, sender) {
   *       print(message.other_group);
   *     },
   *     spawn_wave(self, message: { count: number }) {
   *       print(message.count);
   *     },
   *   }),
   * });
   * ```
   */
  function onMessage<TSelf = Record<never, never>, H extends object = Record<never, never>>(
    handlers: H &
      Partial<{
        [K in MessageId]: (self: TSelf, message: MessagePayload<K>, sender: Url) => void;
      }> &
      OnMessageLocalHandlers<TSelf, H>,
  ): MessageDispatcher<TSelf, OnMessageLocalMessages<H>>;

  // A key outside `MessageId` is a script-local id only when its handler
  // annotates `message`; an unannotated one infers no payload and reds as an
  // implicit `any`, which is the typo guard.
  type OnMessageHandlerPayload<F> = F extends (
    self: never,
    message: infer M,
    ...rest: never[]
  ) => unknown
    ? M
    : never;

  type OnMessageLocalHandlers<TSelf, H> = {
    [K in Exclude<keyof H, MessageId>]: (
      self: TSelf,
      message: OnMessageHandlerPayload<H[K]>,
      sender: Url,
    ) => void;
  };

  // A numeric key is sent under its JavaScript property key (`1e3` is "1000"),
  // the id the transpiler hashes.
  type OnMessageLocalMessages<H> = {
    [K in Exclude<keyof H, MessageId> as K extends number ? `${K}` : K]: OnMessageHandlerPayload<
      H[K]
    >;
  };

  /**
   * The `on_message` handler {@link onMessage} returns. `__messages` is a
   * type-only record of the script-local ids its handlers declared; it never
   * exists at runtime.
   */
  interface MessageDispatcher<TSelf, TLocal = Record<never, never>> {
    (self: TSelf, message_id: Hash, message: Record<string | number, unknown>, sender: Url): void;
    readonly __messages?: TLocal;
  }
}
