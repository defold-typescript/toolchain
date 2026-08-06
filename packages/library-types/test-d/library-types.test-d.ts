/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as nakama from "nakama.nakama";

const _nakamaClient = nakama.create_client({
  host: "127.0.0.1",
  port: 7350,
  username: "defaultkey",
  password: "defaultkey",
  engine: {},
});
const _nakamaAccount: { id: string; vars: unknown } = nakama.create_api_account_custom("user", {});
const _nakamaSession = nakama.authenticate_custom(_nakamaClient, _nakamaAccount, true, "user");
nakama.set_bearer_token(_nakamaClient, _nakamaSession.token);

void _nakamaAccount;
void _nakamaSession;
