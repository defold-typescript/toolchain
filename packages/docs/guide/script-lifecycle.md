---
toc-title: Script lifecycle
---
# Script lifecycle helpers

`@defold-typescript/types` exports identity helpers for Defold script tables. They keep the runtime object unchanged while giving TypeScript a typed `self` and typed lifecycle hook parameters. `self` holds *per-instance* state; for the wider picture — when to reach for a shared module local, a cross-script module singleton, or a VM-global instead — see [Where script state lives](./script-state.md).

`init` **returns** the script's initial state, and that return is the single site TypeScript infers the `self` type (`TSelf`) from, so you write the field set once and every other hook's `self` is typed from it. (When you declare `properties`, `init` also *receives* a `self` holding just those property values — see [Script properties on `self`](#script-properties-on-self) — but the return is still the only state-inference site.) No explicit type argument is needed:

```ts
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init: () => ({ speed: 120 }),

  on_input(self, action_id, action) {
    if (action_id == null) {
      // No action_id = raw pointer/mouse-move event; read the cursor off `action`.
      const pointerX = action.x;
      const pointerY = action.y;
      void pointerX; // replace with real usage
      void pointerY; // replace with real usage
      return;
    }

    if (action.pressed) {
      self.speed += action.value ?? 0;
    }

    for (const touch of action.touch ?? []) {
      const finger = touch.id;
      const x = touch.x;
      void finger; // replace with real usage
      void x; // replace with real usage
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
    if (action_id == null) {
      // No action_id = pointer move; this menu handles only named actions, so bail.
      return;
    }

    if (action.released) {
      const text = action.text;
      void text; // replace with real usage
    }
  },
});
```

With an explicit type argument (`defineGuiScript<MenuSelf>`), `init`'s return is checked against `MenuSelf` rather than inferred from it.

## Script properties on `self`

Declare editor script properties with the value-keyed `properties` field of `defineScript`. The key is the property name (written once) and the value is its default, so the value's type flows onto `self` alongside the state `init` returns. You never call `go.property` yourself — the transpiler synthesizes the chunk-scope `go.property(...)` registrations Defold needs:

```ts
import { defineScript, type Hash } from "@defold-typescript/types";

export default defineScript({
  properties: {
    adj: vmath.vector3(0, 0, 0), // self.adj: Vector3
    name: hash("initial value"), // self.name: Hash
  },
  init(self) {
    return { velocity: vmath.vector3(0, 0, 0).add(self.adj) };
  },
  update(self) {
    const name: Hash = self.name;
    self.velocity = self.velocity.add(self.adj);
    void name; // replace with real usage
  },
});
```

Property-backed fields are present on `self` before `init` runs, so they need not appear in `init`'s return. The state `init` returns is still checked on its own — an omitted state field remains a compile error, while omitted property-backed fields are correct.

### Reading properties in `init`

Defold applies the declared property values to `self` *before* `init` runs, so `init` can read them at spawn time. Give `init` a `self` parameter and it is typed as the property channel — exactly the declared `properties`, for reading. This is the natural home for setup that depends on a property, such as playing the initial animation without waiting a frame:

```ts
import { defineScript, type Hash } from "@defold-typescript/types";

export default defineScript({
  properties: {
    start_anim: hash("idle"), // self.start_anim: Hash
    max_hp: 100, // self.max_hp: number
  },
  init(self) {
    // `self` here is only the property channel: start_anim and max_hp.
    sprite.play_flipbook("#sprite", self.start_anim);
    return { hp: self.max_hp };
  },
  update(self) {
    // Outside init, `self` is the merged properties + returned state.
    self.hp -= 1;
    void self.max_hp; // replace with real usage
  },
});
```

Inside `init`, `self` is **only** the property values — reading a field that is neither a declared property nor yet returned is a compile error. The return is still the sole state channel, and every other hook sees the merged properties-plus-state `self`.

> [!NOTE]
> Calling `go.property(...)` directly is deprecated. It still registers the property at runtime, but `self.<name>` stays untyped and the transpiler emits a build warning pointing you at the `properties` field — a reminder to move the property there.

Hovering `defineScript`, `defineGuiScript`, or `defineRenderScript` in the editor now shows the factory's purpose, the hooks each kind accepts (render scripts omit `on_input`), and a TypeScript example. Hovering an individual callback inside the hook table — `init`, `update`, `fixed_update`, `late_update`, `on_message`, `on_input`, `final`, `on_reload` — now shows that hook's Defold description and parameter docs as well. Hovering an `action` or `touch` field inside `on_input` — `action.value`, `action.pressed`, `touch.tap_count`, and the rest — shows that field's Defold description.

At runtime Defold owns `self` (a userdata-backed table) and a script can populate but not replace it, so the transpiler can't emit a returning `init` verbatim. It wraps the body in a builder and merges the returned table onto the engine `self`; a `nil`/stateless return merges nothing. When `init` takes a `self` parameter the builder receives the engine `self` (so a property read resolves to the real table), and the parameter keeps your name even if it is not literally `self`. The hooks you write stay in terms of a typed `self`.

`defineScript` and `defineGuiScript` both type `on_input` as `(self, action_id, action) => boolean | void`.

- `action_id` is `Hash | undefined`; Defold uses `nil` for pointer movement.
- `action` is `InputAction` with optional fields such as `value`, `pressed`, `released`, `x`, `y`, `text`, `marked_text`, and `touch`.
- `action.touch` entries are `InputTouch` values with fields such as `id`, `pressed`, `tap_count`, `x`, and `acc_x`.

`defineRenderScript` intentionally has no `on_input` hook because Defold render scripts do not receive input callbacks.

## Frame-update hooks

Defold calls three per-frame hooks, all sharing the `(self, dt) => void` shape where `dt` is the time step in seconds:

| Hook           | When it runs                                                    |
| -------------- | --------------------------------------------------------------- |
| `update`       | every frame                                                     |
| `fixed_update` | every fixed physics step (only when fixed time step is enabled) |
| `late_update`  | every frame, after `update` and animation/physics have run      |

```ts
export default defineScript({
  init: () => ({ velocity: 0 }),
  update(self, dt) {
    self.velocity *= 1 - dt;
  },
  late_update(self, dt) {
    void dt; // replace with real usage
  },
});
```

## Receiving messages: `on_message`

`on_message(self, message_id, message, sender)` runs when another script or the engine posts to this component. Defold pre-hashes the id, so `message_id` arrives as a `Hash` and `message` as an untyped record. `on_message`'s payload narrowing — the `isMessage` guard and the `onMessage` dispatcher that turn that untyped record back into its `BuiltinMessages` shape — is covered in [Typed messages](./messages.md), the same way [Where script state lives](./script-state.md) is the canonical home for `self` typing.

## API availability by script kind

Defold scopes two namespaces to a script kind: `gui.*` resolves only inside a `.gui_script`, and `render.*` only inside a `.render_script`. Every other namespace (`go`, `msg`, `vmath`, `sys`, `physics`, …) is available in every kind.

The default `@defold-typescript/types` entrypoint aggregates *all* namespaces, so it never rejects a call the engine would allow at runtime — but it also can't catch a `gui.*` use in a plain `.script`. To get the engine's wall at compile time, pin the entrypoint matching the file's script kind in that file's `tsconfig`:

| Script kind      | `types` entrypoint                       | Namespaces           |
| ---------------- | ---------------------------------------- | -------------------- |
| `.script`        | `@defold-typescript/types/script`        | universal only       |
| `.gui_script`    | `@defold-typescript/types/gui-script`    | universal + `gui`    |
| `.render_script` | `@defold-typescript/types/render-script` | universal + `render` |

```jsonc
// tsconfig for a .gui_script source tree
{
  "compilerOptions": {
    "types": ["@defold-typescript/types/gui-script"]
  }
}
```

Under that config `gui.*` and the universal namespaces type-check while `render.*` is a compile error. The default `@defold-typescript/types` keeps every namespace, so the full surface is what you get everywhere until you opt in to a wall.

`init`, `build`, and `watch` never narrow the surface for you: they scaffold and build against whatever entrypoint your `tsconfig` names — the full `@defold-typescript/types` by default — and never add, remove, or prune a wall. Narrowing is **opt-in**, managed by the `wall` command: it narrows a single-kind source directory to its kind subpath with a composite `tsconfig.json` that `tsc -b --noEmit` enforces. See [Advanced CLI](advanced-cli.md) for the interactive menu, the flag forms, and the one constraint that makes a wall actually hold (import the lifecycle factory from the kind subpath, not the main entry).
