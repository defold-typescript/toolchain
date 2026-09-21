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

// An unannotated unknown key is a typo, not a declaration.
onMessage({
  // @ts-expect-error an unannotated key outside the catalog is rejected
  spwan_wave(_self, _message) {},
});

// A local id declares itself through its annotated payload; `self` still
// threads from the explicit type argument's handlers when annotated.
onMessage({
  spawn_wave(self: Self, message: { count: number }) {
    const _hits: number = self.hits;
    const _count: number = message.count;
    void _hits;
    void _count;
    // @ts-expect-error the annotated payload has no `boss` field
    void message.boss;
  },
  contact_point_response(_self, message) {
    const _otherGroup: Hash = message.other_group;
    void _otherGroup;
  },
});
