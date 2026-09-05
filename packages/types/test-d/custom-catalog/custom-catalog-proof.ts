import type { Hash, Url } from "../../src/core-types";
import { defineScript } from "../../src/lifecycle";

const _hash = null as unknown as Hash;
const _url = null as unknown as Url;
const _record = null as unknown as Record<string | number, unknown>;

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// The numeric key is absent from this union: `MessageId` intersects the custom
// half with `string`, so a key the emitter cannot lower is never offered.
const _messageIdCoversBoth: Exact<MessageId, BuiltinMessageId | "spawn_wave" | "7"> = true;
void _messageIdCoversBoth;

// Sending: the declared payload is checked, exactly like a built-in id.
msg.post(_url, "spawn_wave", { count: 3 });
msg.post(_url, "spawn_wave", { count: 3, boss: true });

// @ts-expect-error spawn_wave requires `count`
msg.post(_url, "spawn_wave", {});

// @ts-expect-error spawn_wave.count is a number
msg.post(_url, "spawn_wave", { count: "3" });

// @ts-expect-error spawn_wave declares no `wave` field
msg.post(_url, "spawn_wave", { count: 3, wave: 1 });

// A quoted numeric-looking id is an ordinary declared key on every side.
msg.post(_url, "7", { tick: 1 });

// @ts-expect-error "7" declares `tick`, not `count`
msg.post(_url, "7", { count: 1 });

// An id in neither catalog keeps the open payload even with the catalog filled.
msg.post(_url, "totally_unknown", { anything: true });

// A key shadowing a built-in id resolves to the built-in payload, not the
// user's — the shadow is inert rather than silently re-typing an engine message.
const _collisionResolvesToBuiltin: Exact<
  MessagePayload<"set_parent">,
  BuiltinMessages["set_parent"]
> = true;
void _collisionResolvesToBuiltin;

// @ts-expect-error set_parent resolves to the built-in payload, which has no `mine`
msg.post(_url, "set_parent", { mine: "x" });

// Receiving: the guard accepts the custom id and narrows to its payload.
defineScript({
  on_message(_self, message_id, message) {
    if (isMessage(message_id, message, "spawn_wave")) {
      const _count: number = message.count;
      const _boss: boolean | undefined = message.boss;
      void _count;
      void _boss;

      // @ts-expect-error spawn_wave declares no `wave` field
      void message.wave;
    }

    if (isMessage(message_id, message, "7")) {
      const _tick: number = message.tick;
      void _tick;

      // @ts-expect-error "7" declares no `count` field
      void message.count;
    }

    if (isMessage(message_id, message, "set_parent")) {
      const _parentId: Hash | undefined = message.parent_id;
      void _parentId;

      // @ts-expect-error set_parent narrows to the built-in payload, which has no `mine`
      void message.mine;
    }
  },
});

// @ts-expect-error "not_a_message" is declared in neither catalog
void isMessage(_hash, _record, "not_a_message");

// @ts-expect-error a numeric id is not a MessageId — the guard would emit hash(42)
void isMessage(_hash, _record, 42);

// Routing: the dispatcher takes the custom key beside a built-in one.
defineScript({
  on_message: onMessage({
    spawn_wave(_self, message) {
      const _count: number = message.count;
      void _count;

      // @ts-expect-error spawn_wave declares no `wave` field
      void message.wave;
    },
    "7"(_self, message) {
      const _tick: number = message.tick;
      void _tick;
    },
    contact_point_response(_self, message) {
      const _distance: number = message.distance;
      void _distance;
    },
  }),
});

onMessage({
  // @ts-expect-error "not_a_message" is declared in neither catalog
  not_a_message(_self, _message) {},
});

onMessage({
  // @ts-expect-error a numeric id is not a MessageId — the handler would vanish
  42(_self, _message) {},
});
