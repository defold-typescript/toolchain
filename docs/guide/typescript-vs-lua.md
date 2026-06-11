# TypeScript vs Lua

A translation cheat sheet for Defold developers who already know Lua. Lua on the
left, the TypeScript you write on the right. It is a map, not a tutorial: skim
the tables, port your mental model, and reach for the linked pages when a detail
bites.

For the runtime traps the type system cannot catch — `0` and `""` being truthy,
`nil` collapsing `null` and `undefined`, `typeof` not narrowing engine handles —
see [TypeScript gotchas](./typescript-gotchas.md). This page only flags those at
cheat-sheet depth and links down.

## Syntax at a glance

| Concept | Lua | TypeScript |
| --- | --- | --- |
| Line comment | `-- note` | `// note` |
| Block comment | `--[[ … ]]` | `/* … */` |
| Bind a local | `local x = 1` | `const x = 1` (never reassigned), `let x = 1` (reassigned) |
| Not equal | `a ~= b` | `a !== b` |
| Equal | `a == b` | `a === b` (use the strict triple form) |
| Logical and / or / not | `and` / `or` / `not` | `&&` / `\|\|` / `!` |
| String join | `"a" .. b` | `"a" + b`, or a template literal `` `a${b}` `` |
| Length | `#t` | `t.length` |
| Block delimiters | `then … end`, `do … end` | `{ … }` |
| Absence | `nil` | `null` and `undefined` (both lower to `nil` — see the gotchas page) |
| Index base | 1-based: `t[1]` | 0-based: `arr[0]` |

Two things to internalise before the rest of the page:

- **Equality is strict.** Write `===` / `!==`, not `==` / `!=`. The double form
  exists in TypeScript but performs JavaScript coercion and is a lint error in
  the scaffolded project. `===` is value equality for primitives and reference
  equality for objects — the same split Lua draws between numbers/strings and
  tables.
- **Indexing flips from 1 to 0.** This is the single biggest porting bug. A Lua
  `for i = 1, #t` loop becomes a `for (let i = 0; i < arr.length; i++)` loop, and
  every literal index shifts down by one. Prefer `for…of` (below) so you never
  touch the index at all.

## Tables vs objects, arrays, and Maps

Lua has one container — the `table` — used for records, arrays, and dictionaries
alike. TypeScript splits that one type into three, each with its own syntax and
methods. Pick the one that matches how you actually use the data:

| Lua `table` used as… | TypeScript | Notes |
| --- | --- | --- |
| Record / struct | object literal `{ x: 1, y: 2 }` | fixed, named string keys |
| Record with a computed key | object literal `{ [graphics.BUFFER_TYPE_COLOR0_BIT]: params }` | bracketed key from an expression — Lua's `[expr] = v` (e.g. `render.render_target` option tables keyed by engine enum constants) |
| Sequence / list | array `[1, 2, 3]` | 0-based; `arr.length`, `arr.push(x)` |
| Dictionary with arbitrary keys | `Map` | `new Map()`, `.set(k, v)`, `.get(k)`; non-string keys |

Iteration translates the same way:

| Lua | TypeScript |
| --- | --- |
| `for _, v in ipairs(t) do` | `for (const v of arr)` |
| `for k, v in pairs(t) do` | `for (const [k, v] of Object.entries(obj))` |
| `for k, v in pairs(map) do` | `for (const [k, v] of map)` (or `map.entries()`) |

Do **not** use `for…in` to walk an array — TypeScriptToLua rejects it because
JavaScript `for…in` iterates keys in an unspecified order that differs from Lua.
Use `for…of` for values, `Object.entries` / `Map.entries` for pairs.

Under the hood TypeScriptToLua still stores arrays in 1-based Lua tables; you
write 0-based TypeScript and the transpiler emits the offset. The one place the
abstraction leaks is sparse arrays: setting an element to `null`/`undefined` or
leaving holes can make `arr.length` and Lua's `#` disagree, so keep arrays dense.

## Modules: `require` vs `import`

Lua wires files together with `require` and a returned table. TypeScript uses
`import` / `export`, and TypeScriptToLua lowers them straight back onto Lua's
module system — an `import` becomes a `require`, and your `export`s become the
module's returned table.

| Lua | TypeScript |
| --- | --- |
| `local M = {}` … `return M` | `export function f() {}`, `export const C = …` |
| `local foo = require("foo")` | `import { f, C } from "./foo"` |
| `local foo = require("foo")` (whole table) | `import * as foo from "./foo"` |

Use **relative** specifiers (`"./foo"`, `"../lib/util"`) for your own files under
`src/`. Engine APIs are different: the namespaces `go`, `msg`, `vmath`, `sprite`,
`gui`, `render`, and the rest ship from `@defold-typescript/types` as **ambient
globals**, so you call `vmath.vector3(…)` or `msg.post(…)` with no import at all.
You only `import` your own modules.

## File structure and script mapping

You edit TypeScript under `src/`; the toolchain emits Lua beside each source by default. Files that call lifecycle factories become Defold-loadable components, and helper-only files become Lua modules for imports:

```text
src/main.ts   →   src/main.ts.script
src/util.ts   →   src/util.lua
```

Defold resolves a resource by the extension after its last dot, so a `.ts.script` file is a valid `.script` component the engine loads directly — the `.ts` in the name only marks its TypeScript origin. `src/util.lua` is a plain Lua module whose path matches the `require("src.util")` emitted for `import "./util"`. Run `bunx @defold-typescript/cli build` once or `bunx @defold-typescript/cli watch` to keep outputs current.

Lua scripts attach behaviour by defining bare global callbacks (`function
init(self)`, `function on_input(self, action_id, action)`). In TypeScript you
type those through `defineScript` instead, which gives `self` and the message and
input payloads real types. See [script lifecycle](./script-lifecycle.md) for the
full surface and the per-kind API walls.

## Standard library and built-ins

This is where Lua and TypeScript diverge most, because they ship different
standard libraries. TypeScriptToLua targets the **ECMAScript** feature set: when
you write idiomatic TypeScript — array methods, string methods, `Math`, template
literals — the transpiler emits the matching Lua via its runtime library. So the
idiomatic move is to use the TypeScript form, not to call the Lua global.

| Lua | Idiomatic TypeScript |
| --- | --- |
| `table.insert(t, x)` | `arr.push(x)` |
| `#t` | `arr.length` |
| `string.format("%d", n)` | template literal `` `${n}` `` |
| `tostring(x)` | `` `${x}` `` or `String(x)` |
| `tonumber(s)` | `Number(s)` |
| `string.sub`, `string.find`, … | `str.slice`, `str.indexOf`, … |
| `math.abs`, `math.floor`, … | `Math.abs`, `Math.floor`, … |

A caveat worth knowing: `Array.prototype.sort` lowers to Lua's `table.sort`,
which is **not stable**, unlike JavaScript's guaranteed-stable sort. If element
order among equal keys matters, sort on a tiebreaker.

The raw Lua standard library — the `math`, `os`, `string`, `table`, and
`coroutine` tables plus base globals like `pairs`, `ipairs`, `pcall`, `print`,
`tostring`, `type`, `assert`, and `setmetatable` — **is** part of the ambient
surface: `@defold-typescript/types` references the `lua-types` package, so these
type-check and autocomplete with no import. Defold's own `hash()` is ambient too
and returns `Hash`. Reach for a local `declare global` only for genuinely
Lua/Defold-specific globals the type package does not cover.

Two of Lua's basic types deserve a note because Defold leans on them. **Userdata**
is arbitrary C data stored in a Lua variable — Defold uses it for hashes, URLs, the
math objects (`vector3`, `vector4`, `matrix4`, `quaternion`), game objects, GUI
nodes, render predicates, render targets, and constant buffers. You never name
`userdata` in TypeScript: each one surfaces as a distinct branded type (`Hash`,
`Url`, `Vector3`, `Vector4`, `Matrix4`, `Quaternion`, …) so the compiler stops you
mixing a hash with a vector or a plain table. **Threads** are independent execution
contexts and back Lua coroutines; the ambient `coroutine` table (from `lua-types`)
creates and resumes them and returns a `LuaThread`. Coroutines work, but for
frame-paced waiting prefer Defold's own `timer.*` / `go.animate` scheduling.

Prefer the idiomatic-TypeScript column above wherever it exists. The case where
you must reach for the Lua global is **random numbers**. Defold's RNG is
deterministic until seeded, and the only way to seed it is the Lua call:

```ts
math.randomseed(os.time());
const roll = math.random(1, 6); // integer in [1, 6]
```

`Math.random()` and `math.random(m, n)` are not interchangeable. `Math.random()`
returns a `[0, 1)` float (TSTL lowers it to a Lua runtime helper) and cannot be
seeded; `math.random(m, n)` returns an integer in `[m, n]` from the seedable
engine RNG. Use the Lua form whenever you need a reproducible or integer-ranged
result.

The transpiler targets **Lua 5.1** to match Defold's runtime (LuaJIT on native and
desktop, a 5.1 VM on HTML5). That keeps the emitted code clear of 5.4-only
constructs — integer division `//`, bitwise operators, `goto`, the two-argument
`math.randomseed` — which the engine would reject. The ambient `math.randomseed`
is correspondingly single-argument, so the two-argument form is a type error, not
a runtime surprise.

## Libraries

- **Your own code** is just more TypeScript files — `import` them by relative
  path. No registration step, no manifest.
- **npm packages** work only if they transpile to self-contained Lua. A package
  that touches Node.js or browser built-ins (`fs`, `process`, `window`, `fetch`)
  will not run on the Defold Lua VM, because TypeScriptToLua implements the
  ECMAScript standard library and nothing host-specific.
- **Engine features** come from the ambient `@defold-typescript/types` namespaces
  (`go`, `msg`, `vmath`, …), never from npm. There is no package to install for
  them; they are part of the types surface the scaffold pins.

## See also

- [TypeScript gotchas](./typescript-gotchas.md) — the runtime sharp edges this
  page only points at: truthiness, `nil` collapse, `typeof`, opaque handles.
- [Script lifecycle](./script-lifecycle.md) — typing `self`, `on_message`, and
  `on_input` with `defineScript`.
- [Vector math](./vector-math.md) — why `v3 + v3` is not allowed and you use
  `v3.add(other)` instead.
- [Getting started](./getting-started.md) — scaffold, write a script, build to
  Lua.
