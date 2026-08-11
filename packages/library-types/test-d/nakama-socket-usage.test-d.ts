/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as nakama from "nakama.nakama";
import * as socket from "nakama.socket";

// Compile-only proof for the realtime socket surface the residual nakama slice withdrew
// and this target re-homes. No assertions execute; `tsc --noEmit` under
// tsconfig.dts-check.json is the gate.

const _client = nakama.create_client({
  host: "127.0.0.1",
  port: 7350,
  username: "defaultkey",
  password: "defaultkey",
  engine: {},
});

// `nakama.create_socket` is the core module's one door onto this surface and returns
// `unknown`, so the typed instance comes from this module's own `create`.
const _socket = socket.create(_client);

// `connect` branches on the callback and returns the result through `async` when none is
// given, so both forms have to compile.
socket.connect(_socket);
socket.connect(_socket, (success, error) => {
  const _ok: boolean = success;
  const _why: string | undefined = error;
});

// The same call in both forms: the module function taking the socket first, and the
// method `create` bound onto the instance with the socket already applied.
socket.channel_join(_socket, "room", socket.CHANNELTYPE_ROOM, true, false);
_socket.channel_join("room", socket.CHANNELTYPE_ROOM, true, false, (message) => {
  const _payload: unknown = message;
});

// Registering a listener is the one form that takes no callback tail, and its function
// receives the whole message table.
socket.on_match_data(_socket, (message) => {
  const _payload: unknown = message;
});
_socket.on_channel_message((message) => {
  const _payload: unknown = message;
});

// The engine calls `socket.on_disconnect()` with no arguments, so a handler declaring a
// parameter would be reading something that never arrives.
socket.on_disconnect(_socket, () => {});

// The constants keep their numeric literal types, so one cannot stand in for the channel
// id string `channel_leave` wants. Widening them to `number` would make this compile.
// @ts-expect-error a CHANNELTYPE_* constant is not a channel id
socket.channel_leave(_socket, socket.CHANNELTYPE_ROOM);

const _channelType: 1 = socket.CHANNELTYPE_ROOM;
const _errorCode: 4 = socket.ERROR_MATCH_NOT_FOUND;

// `create` is the one export the instance does not carry: the bound-method loop skips it
// by name.
// @ts-expect-error create is not bound onto the socket instance
_socket.create(_client);

void _socket;
void _channelType;
void _errorCode;
