import type { Hash, Url } from "../../src/core-types";
import { defineScript } from "../../src/lifecycle";

// A project's own message ids, declared the way a consumer declares them.
// This augmentation is program-wide, which is why it lives in its own tsc
// program: `test-d/custom-messages.ts` proves the unaugmented behaviour and
// could not if this interface were merged into that program.
declare global {
  interface CustomMessages {
    spawn_wave: { count: number; boss?: boolean };
    // Shadows a built-in id on purpose — the built-in payload must win.
    set_parent: { mine: string };
  }
}

const _hash = null as unknown as Hash;
const _url = null as unknown as Url;
const _record = null as unknown as Record<string | number, unknown>;

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _messageIdCoversBoth: Exact<MessageId, BuiltinMessageId | "spawn_wave"> = true;
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

// Routing: the dispatcher takes the custom key beside a built-in one.
defineScript({
  on_message: onMessage({
    spawn_wave(_self, message) {
      const _count: number = message.count;
      void _count;

      // @ts-expect-error spawn_wave declares no `wave` field
      void message.wave;
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
