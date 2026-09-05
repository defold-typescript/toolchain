/// <reference path="../index.d.ts" />

import type { Hash, Url } from "../src/core-types";

const _hash = null as unknown as Hash;
const _url = null as unknown as Url;
const _record = null as unknown as Record<string | number, unknown>;

// Invariant, non-distributive mutual assignability — a plain `A extends B`
// distributes over the union and would report `true` for a proper subset.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// This program declares nothing in `CustomMessages`, so it pins the shipped,
// unaugmented behaviour: the catalog is empty and `MessageId` collapses onto
// `BuiltinMessageId`.
const _catalogIsEmpty: Exact<keyof CustomMessages, never> = true;
const _messageIdIsBuiltinOnly: Exact<MessageId, BuiltinMessageId> = true;
void _catalogIsEmpty;
void _messageIdIsBuiltinOnly;

// A built-in id resolves to its `BuiltinMessages` payload through the shared
// resolver, so the send side is unchanged by the generalization.
const _builtinPayload: Exact<
  MessagePayload<"contact_point_response">,
  BuiltinMessages["contact_point_response"]
> = true;
void _builtinPayload;

// An id in neither catalog keeps the open payload — the escape hatch every
// ad-hoc `msg.post` compiles through today.
const _openPayload: Exact<MessagePayload<"spawn_wave">, Record<string | number, unknown>> = true;
void _openPayload;

msg.post(_url, "spawn_wave", { count: 3, boss: true });
msg.post(_url, "contact_point_response", {
  position: vmath.vector3(),
  normal: vmath.vector3(),
  relative_velocity: vmath.vector3(),
  distance: 1,
  applied_impulse: 1,
  life_time: 1,
  mass: 1,
  other_mass: 1,
  other_id: _hash,
  other_position: vmath.vector3(),
  other_group: _hash,
  own_group: _hash,
});

// @ts-expect-error apply_force requires `force` and `position`
msg.post(_url, "apply_force", {});

// With the catalog empty, the receive side still rejects an unknown id.
// @ts-expect-error "spawn_wave" is declared in neither catalog
void isMessage(_hash, _record, "spawn_wave");

onMessage({
  // @ts-expect-error "spawn_wave" is declared in neither catalog
  spawn_wave(_self, _message) {},
});
