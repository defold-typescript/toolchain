/// <reference path="../index.d.ts" />

import type { Hash, Url, Vector3 } from "../src/core-types";
import { defineScript } from "../src/lifecycle";

const _hash = null as unknown as Hash;
const _url = null as unknown as Url;

type Self = { hits: number };

// The receive-side mirror of `msg.post`'s send-side narrowing: `isMessage`
// re-introduces the message-id literal at the use site, so the engine's opaque
// pre-hashed `message_id` can narrow the untyped `message` record.
defineScript<Self>({
  on_message(self, message_id, message, sender) {
    const _self: Self = self;
    const _sender: Url = sender;
    void _self;
    void _sender;

    if (isMessage(message_id, message, "contact_point_response")) {
      // Narrowed to the typed contact_point_response payload — no cast.
      const _normal: Vector3 = message.normal;
      const _distance: number = message.distance;
      const _otherGroup: Hash = message.other_group;
      const _ownGroup: Hash = message.own_group;
      void _normal;
      void _distance;
      void _otherGroup;
      void _ownGroup;

      // The engine sets group equal to other_group.

      const _group: Hash = message.group;

      void _group;
    }

    if (isMessage(message_id, message, "set_parent")) {
      const _parentId: Hash | undefined = message.parent_id;
      const _keep: 0 | 1 | undefined = message.keep_world_transform;
      void _parentId;
      void _keep;
    }

    // @ts-expect-error "not_a_message" is not a BuiltinMessageId
    void isMessage(message_id, message, "not_a_message");
  },
});

void _hash;
void _url;
