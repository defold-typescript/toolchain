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
  function onMessage<TSelf = Record<never, never>>(
    handlers: Partial<{
      [K in BuiltinMessageId]: (self: TSelf, message: BuiltinMessages[K], sender: Url) => void;
    }>,
  ): (
    self: TSelf,
    message_id: Hash,
    message: Record<string | number, unknown>,
    sender: Url,
  ) => void;
}
