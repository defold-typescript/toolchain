/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as asobi from "asobi.client";
import * as device from "asobi.device";
import type { HttpError } from "asobi.http";
import type {
  RealtimeError,
  RealtimeEvents,
  RequestCallback,
  RpcError,
  WorldAck,
} from "asobi.realtime";

// Compile-only proof for the asobi forks, written as upstream's README drives them. No
// assertions execute; the `dts-declaration-validity` compile is the gate.

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

// The send helpers, called as upstream calls them: without a callback, and without a seq.
rt._send_fire_and_forget("match.input", {});
rt._send_with_callback("match.leave", {});

// One assertion per distinct handler signature. Every other event receives the frame's payload.
const _error: Equal<RealtimeEvents["error"], (payload: RealtimeError) => void> = true;
void _error;
const _worldAck: Equal<RealtimeEvents["world_ack"], (ack: WorldAck) => void> = true;
void _worldAck;
const _authExpired: Equal<RealtimeEvents["auth_expired"], (reason: string) => void> = true;
void _authExpired;
const _disconnected: Equal<RealtimeEvents["disconnected"], (reason: string) => void> = true;
void _disconnected;
const _entityAdded: Equal<
  RealtimeEvents["entity_added"],
  (id: string, state: asobi.Payload) => void
> = true;
void _entityAdded;
const _entityUpdated: Equal<
  RealtimeEvents["entity_updated"],
  (id: string, state: asobi.Payload, changed: string[]) => void
> = true;
void _entityUpdated;
const _entityRemoved: Equal<RealtimeEvents["entity_removed"], (id: string) => void> = true;
void _entityRemoved;
const _tickEvent: Equal<
  RealtimeEvents["tick"],
  (tick: number | undefined, payload: asobi.Payload) => void
> = true;
void _tickEvent;
const _matchEvent: Equal<
  RealtimeEvents["match_event"],
  (name: string, payload: asobi.Payload) => void
> = true;
void _matchEvent;
const _worldEvent: Equal<
  RealtimeEvents["world_event"],
  (name: string, payload: asobi.Payload) => void
> = true;
void _worldEvent;
type PayloadEvent = Exclude<
  keyof RealtimeEvents,
  | "error"
  | "world_ack"
  | "auth_expired"
  | "disconnected"
  | "entity_added"
  | "entity_updated"
  | "entity_removed"
  | "tick"
  | "match_event"
  | "world_event"
>;
// Checked per event: the indexed union keeps each identical function type as its own member.
type PayloadEventMatches = {
  [E in PayloadEvent]: Equal<RealtimeEvents[E], (payload: asobi.Payload) => void>;
}[PayloadEvent];
const _payloadEvents: Equal<PayloadEventMatches, true> = true;
void _payloadEvents;

// Join family: the id, then the callback, or the options table and then the callback.
const cb: RequestCallback = () => {};
rt.join_match("m1");
rt.join_match("m1", { ctx: {} }, (payload, err) => {
  const _err: Equal<typeof err, string | undefined> = true;
  void _err;
  void payload;
});
// @ts-expect-error the options table comes before the callback
rt.join_match("m1", done, { ctx: {} });
rt.find_or_create_match("default");
rt.find_or_create_match("default", cb);
rt.find_or_create_match("default", { ctx: {} }, (payload, err) => {
  const _err: Equal<typeof err, string | undefined> = true;
  void _err;
  void payload;
});
// @ts-expect-error the second argument is either the callback or the options table
rt.find_or_create_match("default", done, done);
// @ts-expect-error the options table comes before the callback
rt.find_or_create_match("default", done, { ctx: {} });
rt.join_world("w1");
rt.join_world("w1", cb);
rt.join_world("w1", { ctx: {} }, (payload, err) => {
  const _err: Equal<typeof err, string | undefined> = true;
  void _err;
  void payload;
});
// @ts-expect-error the second argument is either the callback or the options table
rt.join_world("w1", done, done);
// @ts-expect-error the options table comes before the callback
rt.join_world("w1", done, { ctx: {} });

// List family: a mode string or an options table, then the callback.
rt.list_matches();
rt.list_matches("default", cb);
rt.list_matches({ mode: "default", has_capacity: true }, cb);
// @ts-expect-error the callback follows the options
rt.list_matches(done);
// @ts-expect-error the options come before the callback
rt.list_matches(done, "default");
rt.list_worlds();
rt.list_worlds("default", cb);
rt.list_worlds({ mode: "default", has_capacity: true }, cb);
// @ts-expect-error a mode goes in a `mode` field, never at a positional index
rt.list_worlds(["default"]);
// @ts-expect-error the callback follows the options
rt.list_worlds(done);
// @ts-expect-error the options come before the callback
rt.list_worlds(done, "default");

// Matchmaker family: a mode string or an options table, and no callback.
rt.add_to_matchmaker();
rt.add_to_matchmaker("default");
rt.add_to_matchmaker({ mode: "default", properties: {} });
// @ts-expect-error a mode goes in a `mode` field, never at a positional index
rt.add_to_matchmaker(["default"]);
// @ts-expect-error the matchmaker answers with events, not a callback
rt.add_to_matchmaker(done);
rt.quick_play();
rt.quick_play("default");
rt.quick_play({ mode: "default", properties: {} });
// @ts-expect-error a mode goes in a `mode` field, never at a positional index
rt.quick_play(["default"]);
// @ts-expect-error the matchmaker answers with events, not a callback
rt.quick_play(done);

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

// REST: every module function takes the client first and the optional callback last.
client.http.get(client, "/api/v1/x", { limit: 10, open: true }, (data, err) => {
  const _data: Equal<typeof data, asobi.Payload | undefined> = true;
  void _data;
  const _err: Equal<typeof err, HttpError | undefined> = true;
  void _err;
  if (err !== undefined) {
    const _code: Equal<typeof err.code, string | undefined> = true;
    void _code;
  }
});
client.http.delete(client, "/x", () => {});
client.http.delete(client, "/x", { id: "a" }, () => {});
client.http.post(client, "/x");

client.auth.guest_device(client, (data, err) => {
  void data;
  void err;
});
client.auth.guest_device(client, { app: "game" }, () => {});
client.leaderboards.get_top(client, "weekly");
client.social.create_group(client, "Guild");
client.storage.put_storage(client, "saves", "slot1", { level: 3 });
client.matchmaker.add(client, "default");
client.matchmaker.add(client, { mode: "ranked" });
client.matches.live(client, { has_capacity: true });
client.notifications.list(client, { read: false, limit: 20 });
client.worlds.list(client, "open_world");

// @ts-expect-error a query value is a string, number or boolean, never a table
client.http.get(client, "/x", { filter: { a: 1 } });
// @ts-expect-error the third argument is either the callback or the body
client.http.delete(client, "/x", done, done);
// @ts-expect-error a score is required
client.leaderboards.submit_score(client, "weekly");
// @ts-expect-error login takes the password
client.auth.login(client, "user");
// @ts-expect-error a mode goes in a `mode` field, never at a positional index
client.matchmaker.add(client, ["default"]);
// @ts-expect-error a quantity is a number
client.inventory.consume(client, "sword", "2");
// @ts-expect-error the REST modules are read through the client, not replaced
client.auth = asobi.create("example.dev").auth;
