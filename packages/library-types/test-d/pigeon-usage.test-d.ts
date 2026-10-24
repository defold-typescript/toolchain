/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as pigeon from "pigeon.pigeon";

// Compile-only proof that the pigeon LuaLS golden is callable with the types
// upstream documents. No assertions execute; tsc --noEmit under
// tsconfig.dts-check.json (skipLibCheck: false) is the gate.

// A receiver is a string, an engine `Url`, or a `hash`. Reds if the local `hash`
// alias resolves to itself or the local `Url` alias hides the engine `Url`.
const sentToPath: boolean = pigeon.send_to("main:/camera", "set_camera", new LuaTable());
const sentToUrl: boolean = pigeon.send_to(msg.url(), hash("x"));

const subscription: number | boolean = pigeon.subscribe(
  "my_message",
  (message_id, message, sender) => {
    void message_id;
    void message;
    void sender;
  },
);

// `new` is a reserved word, declared under an internal alias and re-exported under
// its real name.
const instance = pigeon.new(new LuaMap());

void sentToPath;
void sentToUrl;
void subscription;
void instance;
