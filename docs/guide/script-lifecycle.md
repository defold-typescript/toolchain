# Script lifecycle helpers

`@defold-typescript/types` exports identity helpers for Defold script tables. They keep the runtime object unchanged while giving TypeScript a typed `self` and typed lifecycle hook parameters.

`init` **returns** the script's initial state — it does not receive and mutate `self`. That return is the single site TypeScript infers the `self` type (`TSelf`) from, so you write the field set once and every other hook's `self` is typed from it. No explicit type argument is needed:

```ts
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init: () => ({ speed: 120 }),

  on_input(self, action_id, action) {
    if (action_id === undefined) {
      const pointerX = action.x;
      const pointerY = action.y;
      void pointerX;
      void pointerY;
      return;
    }

    if (action.pressed) {
      self.speed += action.value ?? 0;
    }

    for (const touch of action.touch ?? []) {
      const finger = touch.id;
      const x = touch.x;
      void finger;
      void x;
    }
  },
});
```

Each source file is exactly one Defold script of one kind: you export a single factory call as `default`, never two in the same file, and a `.script` and a `.gui_script` are always separate files. A script with no `init` to infer `self` from — or one whose state you want to name up front — uses the explicit type-argument escape hatch instead, in its own file:

```ts
import { defineGuiScript, type Hash } from "@defold-typescript/types";

type MenuSelf = {
  root: Hash;
};

export default defineGuiScript<MenuSelf>({
  on_input(_self, action_id, action) {
    if (action_id === undefined) {
      return;
    }

    if (action.released) {
      const text = action.text;
      void text;
    }
  },
});
```

With an explicit type argument (`defineGuiScript<MenuSelf>`), `init`'s return is checked against `MenuSelf` rather than inferred from it.

Hovering `defineScript`, `defineGuiScript`, or `defineRenderScript` in the editor now shows the factory's purpose, the hooks each kind accepts (render scripts omit `on_input`), and a TypeScript example.

At runtime Defold owns `self` (a userdata-backed table) and a script can populate but not replace it, so the transpiler can't emit a returning `init` verbatim. It wraps the body in a builder and merges the returned table onto the engine `self`; a `nil`/stateless return merges nothing. The hooks you write stay in terms of a typed `self`.

`defineScript` and `defineGuiScript` both type `on_input` as `(self, action_id, action) => boolean | void`.

- `action_id` is `Hash | undefined`; Defold uses `nil` for pointer movement.
- `action` is `InputAction` with optional fields such as `value`, `pressed`, `released`, `x`, `y`, `text`, `marked_text`, and `touch`.
- `action.touch` entries are `InputTouch` values with fields such as `id`, `pressed`, `tap_count`, `x`, and `acc_x`.

`defineRenderScript` intentionally has no `on_input` hook because Defold render scripts do not receive input callbacks.

## Frame-update hooks

Defold calls three per-frame hooks, all sharing the `(self, dt) => void` shape where `dt` is the time step in seconds:

| Hook | When it runs |
| ---- | ------------ |
| `update` | every frame |
| `fixed_update` | every fixed physics step (only when fixed time step is enabled) |
| `late_update` | every frame, after `update` and animation/physics have run |

```ts
export default defineScript({
  init: () => ({ velocity: 0 }),
  update(self, dt) {
    self.velocity *= 1 - dt;
  },
  late_update(self, dt) {
    void dt;
  },
});
```

## Receiving messages with type narrowing

`on_message` delivers `message_id` as a `Hash` (Defold pre-hashes it) and `message` as an untyped record. Because the id arrives already hashed, the string literal a discriminated union would switch on is gone — TypeScript cannot automatically narrow `message` from a runtime `Hash` comparison. The `isMessage` type guard re-introduces the literal at the use site and narrows the payload to its `BuiltinMessages` shape:

```ts
export default defineScript({
  on_message(self, message_id, message) {
    if (isMessage(message_id, message, "contact_point_response")) {
      // message: { position: Vector3; normal: Vector3; distance: number;
      //            other_group: Hash; own_group: Hash; ... } — no cast.
      if (message.other_group === hash("ground")) {
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

## API availability by script kind

Defold scopes two namespaces to a script kind: `gui.*` resolves only inside a `.gui_script`, and `render.*` only inside a `.render_script`. Every other namespace (`go`, `msg`, `vmath`, `sys`, `physics`, …) is available in every kind.

The default `@defold-typescript/types` entrypoint aggregates *all* namespaces, so it never rejects a call the engine would allow at runtime — but it also can't catch a `gui.*` use in a plain `.script`. To get the engine's wall at compile time, pin the entrypoint matching the file's script kind in that file's `tsconfig`:

| Script kind | `types` entrypoint | Namespaces |
| ----------- | ------------------ | ---------- |
| `.script` | `@defold-typescript/types/script` | universal only |
| `.gui_script` | `@defold-typescript/types/gui-script` | universal + `gui` |
| `.render_script` | `@defold-typescript/types/render-script` | universal + `render` |

```jsonc
// tsconfig for a .gui_script source tree
{
  "compilerOptions": {
    "types": ["@defold-typescript/types/gui-script"]
  }
}
```

Under that config `gui.*` and the universal namespaces type-check while `render.*` is a compile error. The default `@defold-typescript/types` keeps every namespace for back-compat, so existing projects need no change.

`bunx @defold-typescript/cli@latest init` auto-selects this entrypoint for you from the project's script kind(s). A single-kind project — including a fresh scaffold, whose lone `main.script` resolves to `@defold-typescript/types/script` — is walled automatically; a mixed-kind or kindless project keeps the full-surface default. `init --json` reports the chosen kind as `scriptKind` (`null` when the full surface is kept). `bunx @defold-typescript/cli build` re-detects the script kind and re-narrows the active surface, so adding a script kind after `init` is picked up on the next build — the materialized surface drops the forbidden restricted namespaces — while mixed-kind or kindless projects build against the full surface. `build --json` reports the re-detected kind as `scriptKind`. `bunx @defold-typescript/cli watch` re-detects the script kind too: it narrows the active surface at startup and re-narrows live whenever a `.script`/`.gui_script`/`.render_script` component file is added or removed, so the wall tracks the project without restarting the watcher. A ref-doc version pin keeps the full surface under `watch` (no on-the-fly materialization).

A **mixed-kind project** keeps the full surface project-wide, but a single-kind *source directory* inside it can still be walled. On `build`, when the project as a whole is mixed (or kindless), `build` writes a per-directory `tsconfig.json` into each source directory whose `.ts` files are all one kind — for example a `src/ui` holding only `defineGuiScript` sources gets a child tsconfig narrowing `types` to `@defold-typescript/types/gui-script`. That child extends the root tsconfig, so files under `src/ui` type-check against only the gui-script surface (a `render.*` use there becomes a compile error) while the rest of the project stays full-surface. `build --json` reports these as `directoryWalls` (`[]` when none apply). A directory mixing kinds gets no wall. `watch` keeps these per-directory walls in step too: it writes them at startup and re-emits them on every component change, so a directory that becomes single-kind mid-session is walled live without restarting the watcher.
