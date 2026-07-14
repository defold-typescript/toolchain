/// <reference path="../index.d.ts" />
import type { Hash } from "../src/core-types";

// A top-level ref-doc `nil` return alternative now projects as `undefined`, so a
// nil-bearing return is a genuine `T | undefined` that TypeScript narrows with an
// explicit `!== undefined` check. The check is used because it precisely tests
// absence and lowers to `~= nil` in Lua — the not-equal counterpart of the
// `== nil` the equal `=== undefined` / `=== null` checks emit — independent of
// the divergent TS/Lua truthiness, not because truthiness would drop a falsy value.

// crash.load_previous(): number | undefined
const handle = crash.load_previous();
// @ts-expect-error the handle may be undefined before the guard
const _handleEarly: number = handle;
if (handle !== undefined) {
  const handleId: number = handle;
  void handleId;
}

// go.get_parent(id?): Hash | undefined
const parent = go.get_parent();
// @ts-expect-error the parent id may be undefined before the guard
const _parentEarly: Hash = parent;
if (parent !== undefined) {
  const parentId: Hash = parent;
  void parentId;
}

// socket.connect(...): LuaMultiReturn<[client | undefined, string | undefined]>
// The value and error slots are independent `| undefined` unions, so each narrows
// on its own guard and neither is usable before it.
const [conn, err] = socket.connect("localhost", 80);
// @ts-expect-error the connection is undefined on failure, not usable before the guard
const _connEarly: socket.client = conn;
// @ts-expect-error the error string is undefined on success, not usable before the guard
const _errEarly: string = err;
if (conn !== undefined) {
  const client: socket.client = conn;
  void client;
}
if (err !== undefined) {
  const message: string = err;
  void message;
}
