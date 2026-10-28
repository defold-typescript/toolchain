/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as asobi from "asobi.client";
import * as device from "asobi.device";
import type { RpcError } from "asobi.realtime";

// Compile-only proof for the asobi forks, written as upstream's README drives them. No
// assertions execute; tsc --noEmit under tsconfig.dts-check.json is the gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

const client = asobi.create("localhost");
asobi.create("localhost", 8084, false);
const rt = client.realtime;

// Entity sync: a string id, the merged state, and the names of the fields that changed.
rt.on("entity_updated", (id, state, changed) => {
  const _id: Equal<typeof id, string> = true;
  void _id;
  const _state: Equal<typeof state, asobi.Payload> = true;
  void _state;
  const _changed: Equal<typeof changed, string[]> = true;
  void _changed;
});
rt.on("world_ack", (ack) => ack.seq);
rt.on("match_event", (name, payload) => {
  const _name: Equal<typeof name, string> = true;
  void _name;
  void payload;
});
rt.on("tick", (tick) => {
  const _tick: Equal<typeof tick, number | undefined> = true;
  void _tick;
});

rt.rpc("quests.claim", { quest_key: "daily" }, (result, err) => {
  const _err: Equal<typeof err, RpcError | string | undefined> = true;
  void _err;
  void result;
});
rt.join_match("m1", (payload, err) => {
  const _payload: Equal<typeof payload, asobi.Payload | undefined> = true;
  void _payload;
  const _err: Equal<typeof err, string | undefined> = true;
  void _err;
});
rt.join_match("m1", { ctx: {} }, () => {});
rt.ping((rtt) => {
  const _rtt: Equal<typeof rtt, number | undefined> = true;
  void _rtt;
});

const started = asobi.quick_start({ host: "example.dev", on_matched: (p) => print(p) });
const _started: Equal<typeof started, asobi.Client> = true;
void _started;

// @ts-expect-error only the events realtime fires can be registered
rt.on("entity_moved", () => {});
// @ts-expect-error an entity id is a string
rt.on("entity_removed", (id: number) => print(id));
// @ts-expect-error a mode goes in a `mode` field, never at a positional index
rt.list_matches(["default"]);
const done = () => {};
// @ts-expect-error the second argument is either the callback or the options table
rt.join_match("m1", done, done);
// @ts-expect-error quick_start requires the host
asobi.quick_start({});
// @ts-expect-error the granted wire is the server's answer, read after `connected`
rt.wire = "json";

// Guest credentials come back as two strings.
const [id, secret] = device.load_or_create({ app: "game" });
const _id: Equal<typeof id, string> = true;
void _id;
const _secret: Equal<typeof secret, string> = true;
void _secret;
device.generate({ random_bytes: (n) => "x".repeat(n) });

// @ts-expect-error clear reads only the save location
device.clear({ random_bytes: () => "" });
// @ts-expect-error random_bytes receives the byte count
device.generate({ random_bytes: (n: string) => n });
