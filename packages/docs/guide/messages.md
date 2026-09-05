---
toc-title: Messages
agent-entry: 1.1
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

The narrowing keys on the literal id. An arbitrary (non-builtin) string id addresses a **custom** message, whose payload is unchecked until you declare it — so an undeclared id always compiles, and [declaring one](#declaring-your-own-messages) buys it the same checking a built-in id gets:

```ts
msg.post("#logic", "spawn_wave", { count: 3, boss: true }); // undeclared id — payload unchecked
```

Passing the id as an already-hashed `Hash` also skips the check, since the hashed form has lost the literal the narrowing needs.

## Receiving messages with type narrowing

`on_message` delivers `message_id` as a `Hash` (Defold pre-hashes it) and `message` as an untyped record. Because the id arrives already hashed, the string literal a discriminated union would switch on is gone — TypeScript cannot automatically narrow `message` from a runtime `Hash` comparison.

Two helpers close that gap. Both are ambient globals, so neither needs an import:

- **`BuiltinMessages` — a helper *type*.** It maps each built-in message id to its payload shape, so `BuiltinMessages["contact_point_response"]` *is* that message's type. See [The message type surface](#the-message-type-surface).
- **`isMessage` — a helper *function*.** It is a type guard: the return type `message is MessagePayload<K>` is what re-introduces the lost literal at the use site.

```ts
function isMessage<K extends MessageId>(
  message_id: Hash,
  message: Record<string | number, unknown>,
  expected: K,
): message is MessagePayload<K>;
```

Inside the guard, `message` is narrowed to the payload of the id you named — no cast:

```ts
export default defineScript({
  on_message(self, message_id, message) {
    if (isMessage(message_id, message, "contact_point_response")) {
      // message is now BuiltinMessages["contact_point_response"]:
      //   { position: Vector3; normal: Vector3; distance: number;
      //     other_group: Hash; own_group: Hash; ... }
      if (message.other_group == hash("ground")) {
        go.set_position(go.get_position().add(message.normal.mul(message.distance)));
      }
    }
  },
});
```

Three things follow from that signature:

- **It mirrors `msg.post`.** Sending checks your payload against `BuiltinMessages["contact_point_response"]`; receiving narrows `message` to that same type. One catalog, both directions.
- **A typo cannot compile.** `expected` is constrained to `MessageId` — every built-in id plus the ones you [declare yourself](#declaring-your-own-messages) — so `isMessage(message_id, message, "not_a_message")` is a compile error.
- **No runtime cost.** The guard ships only as a type declaration; the transpiler lowers the call to `message_id == hash("contact_point_response")`, so the types package emits no runtime Lua.

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

## Declaring your own messages

Your project's own message ids live in `CustomMessages`, an ambient global interface that ships empty. Merge your ids into it once — anywhere in your sources, or in a `.d.ts` your `tsconfig.json` includes — and all three helpers accept them:

```ts
declare global {
  interface CustomMessages {
    spawn_wave: { count: number; boss?: boolean };
    wave_cleared: { wave: number };
  }
}

export {};
```

The trailing `export {};` is what makes the file a module, and `declare global` is only legal inside one — without it TypeScript rejects the block with TS2669. In a source file that already imports or exports something, the line is redundant and can go.

`MessageId` is then the union of the built-in ids and yours, and `MessagePayload<"spawn_wave">` is the shape you declared. Sending checks it, and both receive-side helpers narrow to it:

```ts
msg.post("#logic", "spawn_wave", { count: 3 });

// @ts-expect-error spawn_wave requires `count`
msg.post("#logic", "spawn_wave", {});

export default defineScript({
  on_message: onMessage({
    spawn_wave(self, message) {
      // message: { count: number; boss?: boolean }
      spawn(message.count);
    },
    contact_point_response(self, message) {
      // built-in and custom ids route through the same dispatcher
    },
  }),
});
```

Two rules are worth knowing:

- **A built-in id wins a collision.** Declaring a key that is already a built-in message id — `set_parent`, say — leaves the built-in payload in force; your entry is inert rather than silently re-typing an engine message.
- **Augment `CustomMessages`, not `BuiltinMessages`.** Merging your ids into `BuiltinMessages` happens to work today, and is not supported: it puts your ids inside a catalog regenerated from the Defold reference docs, and the day Defold ships a message of the same name your declaration becomes a duplicate-key error with nothing pointing at the cause.

Nothing about the lowering changes. A custom id emits the same `message_id == hash("spawn_wave")` comparison a built-in one does, so the declaration costs no runtime.

## A message between two game objects

A real project spreads this over three files: one declaration file, and two scripts that never import it. A spawner game object tells a wave-logic game object to spawn a wave; the logic object reports back when the wave is cleared.

The declaration lives in a `.d.ts` your `tsconfig.json` already includes — `src/messages.d.ts`, say:

```ts
declare global {
  interface CustomMessages {
    spawn_wave: { count: number; boss?: boolean };
    wave_cleared: { wave: number };
  }
}

export {};
```

`declare global` merges program-wide, so `MessageId` gains both ids in *every* file of the program. That is why neither script below imports this file and why neither re-declares the ids — including it once is the entire wiring.

The sender addresses the *other* object's component, and names the payload type itself so the shape is written once:

```ts
import { defineScript } from "@defold-typescript/types";

// Named once here, reused at the call site.
function nextWave(sent: number): MessagePayload<"spawn_wave"> {
  return { count: 3 + sent, boss: sent % 5 === 4 };
}

export default defineScript({
  init() {
    return { sent: 0 };
  },
  update(self) {
    msg.post("/logic#wave", "spawn_wave", nextWave(self.sent));
    self.sent += 1;

    // @ts-expect-error spawn_wave declares `count`; this payload omits it
    msg.post("/logic#wave", "spawn_wave", { boss: true });
  },
});
```

`"/logic#wave"` is a [`SceneAddress`](./scene-types.md) — a component on *another* game object, not the `"#..."` same-object shorthand the rest of this page uses. `MessagePayload<K>` is an ambient global you may name yourself, and it is the same resolver `msg.post` consumes internally, so a helper's return type cannot drift from what the call accepts.

The receiver narrows that payload and threads its own state through the same handler:

```ts
import { defineScript } from "@defold-typescript/types";

type Self = { wave: number };

function spawnEnemies(count: number, boss: boolean): void {
  print(`wave of ${count}${boss ? " with a boss" : ""}`);
}

export default defineScript<Self>({
  init() {
    return { wave: 0 };
  },
  on_message: onMessage<Self>({
    spawn_wave(self, message, sender) {
      self.wave += 1;
      spawnEnemies(message.count, message.boss ?? false);
      msg.post(sender, "wave_cleared", { wave: self.wave });
    },
  }),
});
```

The `onMessage<Self>` type argument is what puts the receiver's own `self` beside the narrowed `message` — see [Where script state lives](./script-state.md) for where that state comes from. `sender` is the URL Defold hands `on_message`, so the reply needs no address of its own.

What the one declaration buys:

- **Both ends resolve through the same `MessagePayload<K>`.** Rename `count` in the declaration and the sender's helper and the receiver's handler break together; there is no second place to update.
- **Adoption is incremental.** An id neither catalog declares still compiles, with an unchecked payload — declaring it is what turns the check on.
- **The lowering is unchanged.** Each id emits the same `hash("...")` comparison a built-in one does, so none of this costs runtime.

## See also

- [Script lifecycle](./script-lifecycle.md) — the `on_message` lifecycle callback and the other typed script hooks.
- [TypeScript gotchas](./typescript-gotchas.md) — why a raw `on_message` handler's `message` is an untyped record, and the cast you would otherwise reach for.
