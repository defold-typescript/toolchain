/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as session from "nakama.session";

// Compile-only proof for the session helpers the nakama family requires but never
// re-exports. No assertions execute; the `dts-declaration-validity` compile is the
// gate.

// `create` asserts on `data.token` and reads `data.refresh_token` behind a truthy test,
// so the access token alone is a complete input.
const _session = session.create({ token: "header.payload.signature" });
const _withRefresh = session.create({
  token: "header.payload.signature",
  refresh_token: "header.payload.signature",
});

const _expires: number = _session.expires;
const _created: number = _session.created;
const _userId: string = _session.user_id;
const _token: string = _session.token;
const _username: string = _session.username;

// `create` always writes these five, and writes the refresh half only inside its
// `refresh_token` check and `vars` only when the access token carries a `vrs` claim. The
// two `unknown` fields admit any read, so building a session is the only way to hold
// that all six may be left out.
const _minimal: session.Session = {
  created: 0,
  token: "header.payload.signature",
  expires: 0,
  username: "player",
  user_id: "id",
};

// The refresh half is filled only when the response carried a refresh token, so reading
// it without a check is exactly the mistake the optional marker exists to catch.
const _refreshExpires: number | undefined = _withRefresh.refresh_token_expires;

const _soon: boolean = session.is_token_expired_soon(_session);
const _expired: boolean = session.is_token_expired(_session);
// Upstream's own backwards-compatible alias, kept rather than deduplicated away.
const _aliased: boolean = session.expired(_session);
const _refreshExpired: boolean = session.is_refresh_token_expired(_session);

// `id` defaults to "nakama" on both sides of the round trip, so each call compiles with
// and without it, and `store` hands back `sys.save`'s success boolean.
const _stored: boolean = session.store(_session);
const _storedUnder: boolean = session.store(_session, "player-one");
session.restore("player-one");

// `restore` returns nil when nothing usable was stored, so the result has to be checked
// before it is read. Narrowing the return type would make this compile.
// @ts-expect-error restore may return nil
const _unchecked: number = session.restore().expires;

const _restored = session.restore();
if (_restored) {
  const _checked: number = _restored.expires;
  void _checked;
}

void _expires;
void _created;
void _userId;
void _token;
void _username;
void _minimal;
void _refreshExpires;
void _soon;
void _expired;
void _aliased;
void _refreshExpired;
void _stored;
void _storedUnder;
void _unchecked;
