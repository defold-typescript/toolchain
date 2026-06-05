/// <reference path="../index.d.ts" />

import type { Hash, Url, Vector3 } from "../src/core-types";
import { defineScript } from "../src/lifecycle";

const _url = null as unknown as Url;

type Self = { hits: number };

// DU-style dispatcher: each handler key is a `BuiltinMessageId`, and its
// `message` param is narrowed to that id's `BuiltinMessages` payload. `self`
// threads via the explicit type argument, mirroring `defineScript<Self>`.
defineScript<Self>({
  on_message: onMessage<Self>({
    contact_point_response(self, message) {
      const _self: Self = self;
      void _self;

      const _normal: Vector3 = message.normal;
      const _distance: number = message.distance;
      const _otherGroup: Hash = message.other_group;
      void _normal;
      void _distance;
      void _otherGroup;

      // @ts-expect-error contact_point_response has no `group` field (own_group/other_group only)
      void message.group;
    },
    set_parent(self, message) {
      const _self: Self = self;
      void _self;
      const _parentId: Hash | undefined = message.parent_id;
      void _parentId;
    },
  }),
});

// A bare dispatcher defaults `self` to an empty record.
const _bare = onMessage({
  enable(self) {
    const _self: Record<never, never> = self;
    void _self;
  },
});
void _bare;

onMessage<Self>({
  // @ts-expect-error "not_a_message" is not a BuiltinMessageId
  not_a_message(_self, _message) {},
});

void _url;
