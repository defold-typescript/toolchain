---
toc-title: Script state
---
# Where script state lives

A Defold game is many script *instances* sharing a few script *modules*. Where you put a piece of mutable state decides who can see it and change it — one component, every component of one script, every script in the game, or the whole Lua VM. This page walks those four tiers from narrowest to widest, each grounded in the Lua the toolchain actually emits.

This page is about *placement*. The typing model for `self` — how `init` infers it and how `properties` seed it — lives in [Script lifecycle](./script-lifecycle.md).

## Per-instance state: `self`

State that each component instance owns belongs on `self`. `init`'s returned object is copied onto `self` for *that* component instance, so two game objects running the same script keep independent values: decrement one object's `self.health` and the other's is untouched.

```ts
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init() {
    return { health: 100 };
  },
  update(self) {
    self.health -= 1;
  },
});
```

Every object that mounts this script gets its own `self.health`. This is the default home for anything an instance must own a private copy of. The full typing model is in [Script lifecycle](./script-lifecycle.md).

## Sharing state across instances of one script

A module-level `let` or `const` is **not** per-instance. Defold loads each script module once via `require` and caches the result, so a variable declared at module scope is created once and seen by every component instance of that script. The build makes the split visible — `spawnCount` is a module local, while `health` is written onto each instance's `self`:

```ts
import { defineScript } from "@defold-typescript/types";

// Module-level: one value, not per-instance.
let spawnCount = 0;

export default defineScript({
  init() {
    return { health: 100 };
  },
  update(self) {
    self.health -= 1;
    spawnCount += 1;
  },
});
```

```lua
local spawnCount = 0
function init(self)
    -- self.health is set per instance
end
function update(____self)
    ____self.health = ____self.health - 1
    spawnCount = spawnCount + 1
end
```

`spawnCount` is a single Lua **module local** evaluated once at chunk scope; because the module is cached, that one value is **shared by every component instance** that runs this script. Reach for a module local only for constants or a deliberately-shared counter — keep anything each instance must own its own copy of on `self`.

## Sharing state across different scripts: a module singleton

To share state across *different* scripts — a spawn registry, a score table, an event bus — put it in its own module and import it wherever you need it. Because every `import` lowers to a cached `require`, each script that imports the module sees the same table:

```ts
// registry.ts — one module, shared by every importer.
let spawned = 0;
const names: string[] = [];

export function register(name: string): void {
  spawned += 1;
  names.push(name);
}

export function spawnedCount(): number {
  return spawned;
}
```

```ts
// spawner.ts and hud.ts both import it and see the same state.
import { register, spawnedCount } from "./registry";
```

`import { register } from "./registry"` lowers to a `require` that Defold caches once, so `spawner.ts` and `hud.ts` read and write the **same** `spawned`/`names` values. This is the idiomatic pattern for game-wide tracking — prefer it over raw globals: a module singleton is scoped, typed, and explicit about who depends on it.

### When the build sends you here

`build` and `watch` reject a script whose exported values cannot be told apart from its lifecycle hooks. The clearest case is a private binding an exported function reassigns while a hook also reads it:

```ts
// door.ts — rejected.
import { defineScript } from "@defold-typescript/types";

let count = 0;
export function increment(): void {
  count++;
}

export default defineScript({
  update() {
    increment();
    print(count);
  },
});
```

The error names `count` and both lines that reach it. Move `count` and `increment` into a module of their own — the singleton above — and import them from the script: the state then has one home, and every reader sees the same value. What counts is the rebinding, not how it is spelled: `count = 1`, `[count] = [1]`, `({ count } = …)` and `for (count of …)` are one shape. Writing through a binding — `state.ready = true` — is not, because both sides hold the same table.

The other rejected shape is an effectful top-level statement — a call rather than a literal — with any exported declaration, or anything one of them reaches, below it. Move it below them all, or into `init`.

## Truly global variables: `declare global`

The widest tier is a bare Lua global, shared across the entire VM — every script, no import. You reach it from TypeScript with `declare global`. The declaration itself emits no Lua; the first assignment creates the global at runtime:

```ts
declare global {
  var FOO: number;
}
export function bump(): number {
  FOO = FOO + 1;
  return FOO;
}
```

```lua
local ____exports = {}
function ____exports.bump()
    FOO = FOO + 1
    return FOO
end
return ____exports
```

Note what is **not** there: no `local FOO`, no initializer, no `____exports.` prefix. `FOO` is a raw Lua global — broader than a cached module local, because it is scoped to no module at all. TypeScriptToLua emits nothing for the `declare global` block itself; it only tells the type-checker the global exists, and the first assignment creates it VM-wide. Reach for this only for genuine engine or Lua globals you cannot type any other way; for app state, prefer a module singleton.

## Choosing where state lives

| You want state… | Put it… |
| --- | --- |
| owned by one component instance | on `self` |
| shared by every instance of one script | a module-level `let`/`const` |
| shared across different scripts (app state) | a module singleton (import a shared module) |
| visible to the whole Lua VM, no import | `declare global` — real Lua/Defold globals only |

A rule of thumb: `self` for per-instance state; a module singleton for deliberately-shared app state; `msg.post` or a dedicated manager object when ownership and lifecycle matter; `declare global` only for real Lua/Defold globals. One hot-reload caveat: module state — module locals and singletons alike — persists across `on_reload`, because the cached module is not re-`require`d; only `self` is rebuilt.

## See also

- [Script lifecycle](./script-lifecycle.md) — typing `self`, `on_message`, and `on_input` with `defineScript`.
- [TypeScript vs Lua](./typescript-vs-lua.md) — the `require`/`import` mapping and the `declare global` lowering this page builds on.
- [Agent runbooks](./agent-runbooks.md#where-script-state-lives) — the condensed self-vs-module-local procedure.
