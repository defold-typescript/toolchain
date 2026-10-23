/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as token from "token.token";

// Compile-only proof that the token LuaLS golden is callable with the types
// upstream documents. No assertions execute; tsc --noEmit under
// tsconfig.dts-check.json (skipLibCheck: false) is the gate.

const wallet = token.container("wallet", undefined);

// Upstream restates event's `subscribe` as `fun(_, callback, _)`; emitted as-is the
// call would need a dummy first argument. With the restated field dropped the
// per-container event inherits event's own `subscribe`, which takes the callback
// alone.
const subscribed: boolean = wallet.on_token_change.subscribe((token_id: string, amount: number) => {
  void token_id;
  void amount;
});

// Reds if `container`'s return degrades to `unknown`.
const walletId: string = wallet.id;

void subscribed;
void walletId;
