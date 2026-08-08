/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as nakama from "nakama.nakama";

// Compile-only proof for the severed nakama core surface, replacing the nakama
// block retired from library-types.test-d.ts — the last block that file held,
// which is why it went away with this severance rather than losing a section.
// No assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is the
// gate.

// The five assertions the retired block carried.
const _nakamaClient = nakama.create_client({
  host: "127.0.0.1",
  port: 7350,
  username: "defaultkey",
  password: "defaultkey",
  engine: {},
});
const _nakamaAccount: { id: string; vars: unknown } = nakama.create_api_account_custom("user", {});
// The pinned module takes the request body as positional parameters — an id and a
// vars table, not a table holding both — so a caller written against the collapsed
// shape passed a table where upstream reads a string and failed at runtime.
const _nakamaSession = nakama.authenticate_custom(_nakamaClient, "user", {}, true, "user");
nakama.set_bearer_token(_nakamaClient, _nakamaSession.token);

// The hand-written surface the openapi source cannot describe: the recorded
// `no-go` counts `sync` among the members the swagger and proto have no source
// for, so its callback shape has to survive the lane move.
nakama.sync(() => {});

// Every call that can retry accepts upstream's trailing token pair, and the token
// carries the `cancel` upstream builds onto it.
const _nakamaToken = nakama.cancellation_token();
nakama.sync(() => {}, _nakamaToken);
nakama.get_account(_nakamaClient, () => {}, undefined, _nakamaToken);
_nakamaToken.cancel();
nakama.cancel(_nakamaToken);

// The socket surface belongs to `nakama.socket`, which the pinned module requires
// privately and never re-exports; `create_socket` is the one door it does expose.
const _nakamaSocket = nakama.create_socket(_nakamaClient);
// @ts-expect-error socket_send is not a member of this module
nakama.socket_send(_nakamaSocket, "{}", () => {});

const _nakamaCreated: boolean = _nakamaSession.created;

// `SessionToken` is a `symbol` brand, so the token cannot be passed around as
// the string it is at runtime. Widening the brand to `unknown` would make the
// call below legal and erase the only guard the type surface offers here.
// @ts-expect-error a bare string is not a SessionToken
nakama.set_bearer_token(_nakamaClient, _nakamaSession.token as unknown as string);

// `callback` is optional on every REST call, so each must compile both ways.
nakama.authenticate_custom(_nakamaClient, "user", {}, true, "user", () => {});

// `use_ssl` is the only optional field on ClientConfig; the other five are
// required, so an emit that erased the config shape would make this legal.
// @ts-expect-error engine is a required ClientConfig field
nakama.create_client({
  host: "127.0.0.1",
  port: 7350,
  username: "defaultkey",
  password: "defaultkey",
});
nakama.create_client({
  host: "127.0.0.1",
  port: 7350,
  use_ssl: true,
  username: "defaultkey",
  password: "defaultkey",
  engine: {},
});

void _nakamaAccount;
void _nakamaSession;
void _nakamaCreated;
