/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as lu from "live_unbundler.live_unbundler";

// Compile-only proof that the live_unbundler LuaLS golden is callable the way the
// upstream README integrates it. No assertions execute; the `dts-declaration-validity`
// compile (skipLibCheck: false) is the gate.

lu.add_listener();
lu.set_save_cache_key("liveupdate_saved_files");

// `modules` is a Lua `table<string, liveupdater.module>`, so TypeScript builds it as
// a `LuaTable` rather than the README's object literal.
const modules = new LuaTable<string, lu.liveupdater_module>();
modules.set("level1", { files: ["level1"], priority: 1, res_mode: lu.RES_BOTH });
lu.init({ modules, lowres_server_path: "/lr" }, (ok: boolean, err: string | undefined) => {
  void ok;
  void err;
});

// The message ids are hashes, compared against the id `on_message` receives.
const allLoaded: Hash = lu.MSG_ALL_LOADED;
function onMessage(message_id: Hash): boolean {
  return message_id === lu.MSG_ALL_LOADED || message_id === lu.MSG_NETWORK_ERROR;
}

// The log levels are the numbers the injected log function receives.
const errorLevel: number = lu.ERROR;
lu.set_log_function((level, message) => {
  const isError: boolean = level === lu.ERROR;
  void isError;
  void message;
});

const lowProgress: number = lu.get_download_progress().low.progress;

// The module progress is absent for an unknown module, so it needs a check.
// @ts-expect-error get_module_progress may return undefined
void lu.get_module_progress("x").files;

lu.request_module_load("level1");

void allLoaded;
void onMessage;
void errorLevel;
void lowProgress;
