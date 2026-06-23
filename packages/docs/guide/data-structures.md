---
toc-title: Data structures
---
# Data structures: what's built in

TypeScript ships a richer set of containers than Lua's single `table`, and the toolchain lowers each one to code Defold's Lua 5.1 VM runs. Most of them lower to a plain Lua table; the ones with behaviour (`Map`, `Set`, `class`, spread) lean on runtime helpers that TypeScriptToLua emits into `lualib_bundle`. That bundle is pure Lua 5.1 the CLI writes to the output root, pay-for-use: a container that needs a helper pulls it in, the rest cost nothing. Every container below runs unchanged on Defold's VM (LuaJIT on native and desktop, a 5.1 VM on HTML5).

This page is the full availability map. For the Lua-to-TypeScript container translation at cheat-sheet depth — which `table` shape becomes which TypeScript type — see [TypeScript vs Lua](./typescript-vs-lua.md#tables-vs-objects-arrays-and-maps).

The lowerings quoted below were captured by running the real transpile pipeline; the same shapes are pinned in `packages/transpiler/src/data-structures-transpile.test.ts`.

## Built-in containers

| Structure | TypeScript form | Lowers to | Pulls `lualib`? | Use instead / note |
| --- | --- | --- | --- | --- |
| `Array` | `const xs: number[] = [1, 2, 3]` | Lua table `{1, 2, 3}` (1-based) | Literal, index, `push`, `length`: no. Higher-order methods (`map`, `filter`, `reduce`, …): yes | The idiomatic sequence. Keep arrays dense — holes desync `arr.length` from Lua's `#`. |
| tuple | `const t: [number, string] = [1, "a"]` | plain Lua table `{1, "a"}` | **No** | The cheapest container — a fixed-length, positional record. Prefer it over an object for a fixed pair. |
| `Map` | `new Map<string, number>()` | `__TS__New(Map)`; `.set`/`.get` call helper methods | Yes | Arbitrary (incl. non-string, object) keys. Use over an object record when keys are not fixed strings. |
| `Set` | `new Set<number>()` | `__TS__New(Set)` | Yes | Membership and dedup. Prefer over scanning an array for "is `x` present". |
| `WeakMap` | `new WeakMap<object, V>()` | `__TS__New(WeakMap)` | Yes | Per-object side data whose entries vanish when the key is collected — caches keyed by object identity. |
| `WeakSet` | `new WeakSet<object>()` | `__TS__New(WeakSet)` | Yes | Weak membership — "have I seen this object" without pinning it alive. |
| object record | `{ x: 1, y: 2 }` | plain Lua table `{x = 1, y = 2}` | No (spread / `Object.entries` pull a helper) | Fixed, named string keys. The default for a struct; spread `{ ...a, y: 2 }` lowers to `__TS__ObjectAssign`. |
| `class` | `class C { … }` + `new C()` | `__TS__Class()` + `__TS__New`; table + metatable, methods on `prototype` | Yes | Real OO with inheritance. On hot paths a plain object or a closure is lighter — reach for `class` when you want a typed constructor and method dispatch. |

Two lowerings worth seeing in full. A tuple is just a table — no runtime helper, no `require`:

```ts
export const t: [number, string] = [1, "a"];
```

```lua
--[[ Generated with https://github.com/TypeScriptToLua/TypeScriptToLua ]]
local ____exports = {}
____exports.t = {1, "a"}
return ____exports
```

A `class`, by contrast, builds on the `lualib` runtime — `__TS__Class` makes the metatable-backed table and `__TS__New` instantiates it:

```ts
export class Counter {
  n = 0;
  bump(): void {
    this.n += 1;
  }
}
export const c = new Counter();
```

```lua
local ____lualib = require("lualib_bundle")
local __TS__Class = ____lualib.__TS__Class
local __TS__New = ____lualib.__TS__New
local ____exports = {}
____exports.Counter = __TS__Class()
local Counter = ____exports.Counter
Counter.name = "Counter"
function Counter.prototype.____constructor(self)
    self.n = 0
end
function Counter.prototype.bump(self)
    self.n = self.n + 1
end
____exports.c = __TS__New(Counter)
return ____exports
```

The `require("lualib_bundle")` only resolves at runtime because the CLI writes `lualib_bundle.lua` to the output root when any feature pulls it in. You never manage that file by hand.

## Not available — reach for instead

A few JavaScript built-ins do not survive the transpile to Lua 5.1. They fail at compile time (so you find out from `tsc --noEmit` / the transpile diagnostics, not at runtime) or simply do not exist in the typed surface.

| Want | Status | Reach for instead |
| --- | --- | --- |
| Regular expressions — `/b/`, `"x".match(/b/)` | **Rejected** — the diagnostic reads `string.match is unsupported.` | String methods: `indexOf`, `slice`, `startsWith`, `endsWith`, `includes`, `split`. They cover most parsing needs and lower to native Lua string ops. |
| `BigInt` — `1n` | **Rejected** — `Unsupported node kind BigIntLiteral` | A `number` (Lua's double holds integers exactly up to 2^53), or a string when you only format/transport the value. |
| `LinkedList` / `LinkedListNode` | **Not built in** — no such export in `lib.es2022`, the TSTL language extensions, `lua-types`, or `@defold-typescript/types` | An `Array` (fast index, push/pop) or a `Map`; for genuine node-link semantics, a small hand-authored `class` with `next`/`prev` fields. |

Regex is the one that bites most often. `"x".match(/b/)` type-checks but fails to transpile, because TypeScriptToLua maps `String.prototype.match` onto Lua's `string.match`, which takes a Lua pattern, not a JavaScript regex. Rewrite pattern checks with the string methods above; for anything more elaborate, parse by hand.

## See also

- [TypeScript vs Lua](./typescript-vs-lua.md#tables-vs-objects-arrays-and-maps) — the container translation cheat sheet this page deepens.
- [Where script state lives](./script-state.md) — where to *put* these containers: per-instance `self`, a shared module local, or a module singleton.
- [TypeScript gotchas](./typescript-gotchas.md) — the runtime sharp edges (truthiness, `nil` collapse) that bite once the data is in a container.
