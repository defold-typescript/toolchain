/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as nakama from "nakama.nakama";
import type { Session } from "nakama.session";
import type { Socket } from "nakama.socket";

// Compile-only proof for the severed nakama core surface, replacing the nakama
// block retired from library-types.test-d.ts — the last block that file held,
// which is why it went away with this severance rather than losing a section.
// No assertions execute; the `dts-declaration-validity` compile is the
// gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// The five assertions the retired block carried.
const _nakamaClient = nakama.create_client({
  host: "127.0.0.1",
  port: 7350,
  username: "defaultkey",
  password: "defaultkey",
  engine: {},
});
// A `create_*` helper returns the table it builds (`nakama.lua:248-251`), every field of
// which upstream asserts may be nil.
const _nakamaAccount = nakama.create_api_account_custom("user", {});
const _nakamaAccountShape: Equal<typeof _nakamaAccount, nakama.ApiAccountCustom> = true;
const _nakamaAccountId: string | undefined = _nakamaAccount.id;

// nakama login path: the README's sequence inside a coroutine. An authenticate call
// returns `nakama.session`'s session (`nakama.lua:1696-1700`), the error table
// `engine/defold.lua:77-83` builds when the request fails, or nothing when the call's
// cancellation token was already cancelled (`nakama.lua:78-81`).
nakama.sync(() => {
  // The pinned module takes the request body as positional parameters — an id and a
  // vars table, not a table holding both — so a caller written against the collapsed
  // shape passed a table where upstream reads a string and failed at runtime.
  const session = nakama.authenticate_email(
    _nakamaClient,
    "batman@heroes.com",
    "i_am_not_bruce_wayne",
    {},
    true,
    "batman",
  );
  const _sessionResult: Equal<typeof session, Session | nakama.ApiError | undefined> = true;
  if (session === undefined) return;
  if ("error" in session) {
    const _failure: Equal<typeof session, nakama.ApiError> = true;
    const _message: string | undefined = session.message;
    return;
  }
  const _session: Equal<typeof session, Session> = true;
  nakama.set_bearer_token(_nakamaClient, session.token);
  // `created` is the `os.time()` `nakama.session.create` stamps, not a flag.
  const _nakamaCreated: number = session.created;

  // The socket surface belongs to `nakama.socket`, which the pinned module requires
  // privately and never re-exports; `create_socket` is the one door it does expose.
  const socket = nakama.create_socket(_nakamaClient);
  const _socket: Equal<typeof socket, Socket> = true;
  socket.connect();
  // @ts-expect-error socket_send is not a member of this module
  nakama.socket_send(socket, "{}", () => {});

  // The bearer token is the JWT string the session carries, so neither a symbol nor a
  // number reaches `client.config.bearer_token` (`nakama.lua:4306-4309`).
  // @ts-expect-error a symbol is not a bearer token
  nakama.set_bearer_token(_nakamaClient, Symbol("token"));
  // @ts-expect-error a number is not a bearer token
  nakama.set_bearer_token(_nakamaClient, 42);
});

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

// An API call's result is the message `nakama.lua` names for it, read as the fields its
// `create_api_<msg>` helper lists, whether it arrives as the coroutine's return or as
// the callback's argument.
nakama.sync(() => {
  const account = nakama.get_account(_nakamaClient);
  if (account === undefined || "error" in account) return;
  const username = account.user?.username;
  const _username: Equal<typeof username, string | undefined> = true;
  const _wallet: Equal<typeof account.wallet, string | undefined> = true;

  // A call whose response message is empty returns an empty table, not nothing.
  const deleted = nakama.delete_friends(_nakamaClient, ["id"], ["name"]);
  const _deleted: Equal<typeof deleted, nakama.ApiEmpty | nakama.ApiError | undefined> = true;
});
nakama.get_account(_nakamaClient, (result) => {
  const _result: Equal<typeof result, nakama.ApiAccount | nakama.ApiError> = true;
  if ("error" in result) return;
  const _user: Equal<typeof result.user, nakama.ApiUser | undefined> = true;
});

const _builtAccount = nakama.create_api_account("custom", [], "", "a@b.c", {}, "", "{}");
const _builtAccountShape: Equal<typeof _builtAccount, nakama.ApiAccount> = true;

// A `vars` table is the session variables Nakama stores as a string-to-string map, and
// either a string-keyed object literal or a `LuaMap` reaches upstream's `json.encode` as
// the same Lua table.
declare const _stringVars: LuaMap<string, string>;
declare const _numberVars: LuaMap<string, number>;
nakama.sync(() => {
  nakama.authenticate_custom(_nakamaClient, "user", _stringVars, true, "user");
  nakama.authenticate_custom(_nakamaClient, "user", { level: "1" }, true, "user");
  // @ts-expect-error a session variable is a string, not a number
  nakama.authenticate_custom(_nakamaClient, "user", _numberVars, true, "user");
  // @ts-expect-error a session variable is a string, not a number
  nakama.authenticate_custom(_nakamaClient, "user", { level: 1 }, true, "user");
});
const _customVars = nakama.create_api_account_custom("user", _stringVars).vars;
// @ts-expect-error a session variable is a string, not a number
nakama.create_api_account_custom("user", _numberVars);

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
void _customVars;
