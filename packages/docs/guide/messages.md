---
toc-title: Messages
---
# Typed messages

Defold delivers a message as a hashed id and a plain table, so the payload's shape is invisible to TypeScript by default. `@defold-typescript/types` restores it from both ends: `msg.post` checks the table you send against the built-in message's declared shape, and the `isMessage` guard — plus the `onMessage` dispatcher built on it — narrows a received `message` back to that shape. This page is the canonical home for that model; the `on_message` lifecycle callback itself is covered in [Script lifecycle](./script-lifecycle.md).

## The message type surface

`BuiltinMessages` (generated in `packages/types/generated/builtin-messages.d.ts` from the Defold reference docs, not hand-maintained) maps each built-in message id to its payload shape, and `BuiltinMessageId = keyof BuiltinMessages` is the union of those ids. Both are ambient globals — no import. Because the catalog is regenerated from the ref docs rather than curated by hand, it is exhaustive: every message Defold documents is in it, so a valid built-in id always type-checks and a typo never does.

## Sending: `msg.post` payload narrowing

A `msg.post(receiver, "<builtin id>", payload)` call checks `payload` against `BuiltinMessages["<id>"]`. Miss a required field or give one the wrong type and it is a compile error, not a silent runtime mismatch:

```ts
msg.post("#collisionobject", "apply_force", {
  force: vmath.vector3(0, 1000, 0),
  position: go.get_world_position(),
});
```

The narrowing keys on the literal id. An arbitrary (non-builtin) string id addresses a **custom** message, and its payload is unchecked — the escape hatch for your own message protocol:

```ts
msg.post("#logic", "spawn_wave", { count: 3, boss: true }); // custom id — payload unchecked
```

Passing the id as an already-hashed `Hash` also skips the check, since the hashed form has lost the literal the narrowing needs.

## Receiving messages with type narrowing

`on_message` delivers `message_id` as a `Hash` (Defold pre-hashes it) and `message` as an untyped record. Because the id arrives already hashed, the string literal a discriminated union would switch on is gone — TypeScript cannot automatically narrow `message` from a runtime `Hash` comparison. The `isMessage` type guard re-introduces the literal at the use site and narrows the payload to its `BuiltinMessages` shape:

```ts
export default defineScript({
  on_message(self, message_id, message) {
    if (isMessage(message_id, message, "contact_point_response")) {
      // message: { position: Vector3; normal: Vector3; distance: number;
      //            other_group: Hash; own_group: Hash; ... } — no cast.
      if (message.other_group == hash("ground")) {
        go.set_position(go.get_position().add(message.normal.mul(message.distance)));
      }
    }
  },
});
```

`isMessage` is the receive-side mirror of `msg.post`'s send-side narrowing: `msg.post(receiver, "contact_point_response", payload)` checks the payload against `BuiltinMessages["contact_point_response"]`, and `isMessage(message_id, message, "contact_point_response")` narrows a received `message` to the same shape. It is a global — no import — and an unknown message id (`isMessage(message_id, message, "not_a_message")`) is a compile error.

The guard ships only as a type declaration; the transpiler lowers the call to its runtime form `message_id == hash("contact_point_response")`, so the types package emits no runtime Lua.

## Routing many messages with `onMessage`

When a script handles several built-in messages, a chain of `if (isMessage(...))` blocks gets noisy. `onMessage` is a discriminated-union dispatcher built on the same narrowing: each handler key is a built-in message id, and that handler's `message` param is narrowed to the matching `BuiltinMessages` payload. It returns an `on_message` handler, so it slots straight into `defineScript`:

```ts
export default defineScript<Self>({
  on_message: onMessage<Self>({
    contact_point_response(self, message) {
      // message: { normal: Vector3; distance: number; other_group: Hash; ... }
      go.set_position(go.get_position().add(message.normal.mul(message.distance)));
    },
    set_parent(self, message) {
      // message: { parent_id?: Hash; keep_world_transform?: 0 | 1 }
    },
  }),
});
```

`self` threads via the explicit `onMessage<Self>` type argument, mirroring `defineScript<Self>`; a bare `onMessage({...})` defaults it to an empty record. An unknown key is a compile error, just like `isMessage`.

Like `isMessage` and `defineScript`, the dispatcher is declaration-only — the transpiler lowers it to the flat `function on_message(self, message_id, message, sender)` chunk with a `message_id == hash("...")` if/elseif chain, so no `onMessage` symbol or runtime Lua reaches the output.

## See also

- [Script lifecycle](./script-lifecycle.md) — the `on_message` lifecycle callback and the other typed script hooks.
- [TypeScript gotchas](./typescript-gotchas.md) — why a raw `on_message` handler's `message` is an untyped record, and the cast you would otherwise reach for.
