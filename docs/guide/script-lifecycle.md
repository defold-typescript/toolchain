# Script lifecycle helpers

`@defold-typescript/types` exports identity helpers for Defold script tables. They keep the runtime object unchanged while giving TypeScript a typed `self` and typed lifecycle hook parameters.

`init` **returns** the script's initial state — it does not receive and mutate `self`. That return is the single site TypeScript infers the `self` type (`TSelf`) from, so you write the field set once and every other hook's `self` is typed from it. No explicit type argument is needed:

```ts
import { defineGuiScript, defineScript, type Hash } from "@defold-typescript/types";

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

type MenuSelf = {
  root: Hash;
};

export const menu = defineGuiScript<MenuSelf>({
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

The `menu` script above shows the escape hatch: pass an explicit type argument (`defineGuiScript<MenuSelf>`) when a script has no `init` to infer from, or to pin `self` to a named interface. With an explicit argument, `init`'s return is checked against it rather than inferred from it.

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
export default defineScript<{ velocity: number }>({
  update(self, dt) {
    self.velocity *= 1 - dt;
  },
  late_update(self, dt) {
    void dt;
  },
});
```

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

`defold-typescript init` auto-selects this entrypoint for you from the project's script kind(s). A single-kind project — including a fresh scaffold, whose lone `main.script` resolves to `@defold-typescript/types/script` — is walled automatically; a mixed-kind or kindless project keeps the full-surface default. `init --json` reports the chosen kind as `scriptKind` (`null` when the full surface is kept). `defold-typescript build` re-detects the script kind and re-narrows the active surface, so adding a script kind after `init` is picked up on the next build — the materialized surface drops the forbidden restricted namespaces — while mixed-kind or kindless projects build against the full surface. `build --json` reports the re-detected kind as `scriptKind`. `defold-typescript watch` re-detects the script kind too: it narrows the active surface at startup and re-narrows live whenever a `.script`/`.gui_script`/`.render_script` component file is added or removed, so the wall tracks the project without restarting the watcher. A ref-doc version pin keeps the full surface under `watch` (no on-the-fly materialization).
