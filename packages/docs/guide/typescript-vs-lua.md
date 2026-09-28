---
toc-title: TypeScript vs Lua
---
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

| Concept                | Lua                      | TypeScript                                                                                                                                                            |
| ---------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Line comment           | `-- note`                | `// note`                                                                                                                                                             |
| Block comment          | `--[[ … ]]`              | `/* … */`                                                                                                                                                             |
| Bind a local           | `local x = 1`            | `const x = 1` (never reassigned), `let x = 1` (reassigned)                                                                                                            |
| Not equal              | `a ~= b`                 | `a != b` or `a !== b` — identical Lua (see the [gotchas page](./typescript-gotchas.md#-and--compile-to-the-same-lua--strictness-is-a-convention-not-a-runtime-guard)) |
| Equal                  | `a == b`                 | `a == b` or `a === b` — identical Lua (see the [gotchas page](./typescript-gotchas.md#-and--compile-to-the-same-lua--strictness-is-a-convention-not-a-runtime-guard)) |
| Logical and / or / not | `and` / `or` / `not`     | `&&` / `\|\|` / `!`                                                                                                                                                   |
| String join            | `"a" .. b`               | `"a" + b`, or a template literal `` `a${b}` ``                                                                                                                        |
| Length                 | `#t`                     | `t.length`                                                                                                                                                            |
| Block delimiters       | `then … end`, `do … end` | `{ … }`                                                                                                                                                               |
| Absence                | `nil`                    | `undefined` — write it, never `null` (both lower to `nil`; see [passing absence](./typescript-gotchas.md#passing-absence-write-undefined-never-null))                                                                                                   |
| Index base             | 1-based: `t[1]`          | 0-based: `arr[0]`                                                                                                                                                     |

Two things to internalise before the rest of the page:

- **Equality has no loose/strict split here.** `==` / `!=` and `===` / `!==`
  compile to the *same* non-coercing Lua `==` / `~=`, so JavaScript's
  coercion — the thing `===` guards against — never happens in the output. The
  scaffolded `biome.json` ships `noDoubleEquals` off, so neither form lints; use
  whichever reads best — the worked examples here (such as the Tetris build) use
  `==` / `!=` to mirror Lua's `==` / `~=`. Both are value equality for primitives
  and reference equality for objects — the same split Lua draws between
  numbers/strings and tables. The one real equality trap is `if (cell)`
  truthiness, since `0` is truthy in Lua — see the [gotchas page](./typescript-gotchas.md#-and--compile-to-the-same-lua--strictness-is-a-convention-not-a-runtime-guard).
- **Indexing flips from 1 to 0.** This is the single biggest porting bug. A Lua
  `for i = 1, #t` loop becomes a `for (let i = 0; i < arr.length; i++)` loop, and
  every literal index shifts down by one. Prefer `for…of` (below) so you never
  touch the index at all.

## Tables vs objects, arrays, and Maps

Lua has one container — the `table` — used for records, arrays, and dictionaries
alike. TypeScript splits that one type into three, each with its own syntax and
methods. Pick the one that matches how you actually use the data:

| Lua `table` used as…           | TypeScript                                                     | Notes                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Record / struct                | object literal `{ x: 1, y: 2 }`                                | fixed, named string keys                                                                                                         |
| Record with a computed key     | object literal `{ [graphics.BUFFER_TYPE_COLOR0_BIT]: params }` | bracketed key from an expression — Lua's `[expr] = v` (e.g. `render.render_target` option tables keyed by engine enum constants) |
| Sequence / list                | array `[1, 2, 3]`                                              | 0-based; `arr.length`, `arr.push(x)`                                                                                             |
| Dictionary with arbitrary keys | `Map`                                                          | `new Map()`, `.set(k, v)`, `.get(k)`; non-string keys                                                                            |

Iteration translates the same way:

| Lua                         | TypeScript                                       |
| --------------------------- | ------------------------------------------------ |
| `for _, v in ipairs(t) do`  | `for (const v of arr)`                           |
| `for k, v in pairs(t) do`   | `for (const [k, v] of Object.entries(obj))`      |
| `for k, v in pairs(map) do` | `for (const [k, v] of map)` (or `map.entries()`) |

Do **not** use `for…in` to walk an array — TypeScriptToLua rejects it because
JavaScript `for…in` iterates keys in an unspecified order that differs from Lua.
Use `for…of` for values, `Object.entries` / `Map.entries` for pairs.

Under the hood TypeScriptToLua still stores arrays in 1-based Lua tables; you
write 0-based TypeScript and the transpiler emits the offset. The one place the
abstraction leaks is sparse arrays: setting an element to `null`/`undefined` or
leaving holes can make `arr.length` and Lua's `#` disagree, so keep arrays dense.

Beyond these three, TypeScript also gives you `Set`, `WeakMap`, `WeakSet`, and
`class`, and rejects a few things outright (regex, `BigInt`). For the full map of
what is built in, what each lowers to, its `lualib` cost, and what to reach for
when something is missing, see [Data structures](./data-structures.md).

### Engine indexes are zero-based

Every position a built-in Defold API takes or returns is written zero-based in
TypeScript, like any other array index. Defold counts most of them from 1, and
the transpiler converts at the call: it adds 1 to an index you pass and
subtracts 1 from an index the engine returns.

```ts
declare const body: Opaque<"b2Body">;
declare const url: Url;
// the first fixture: Defold receives 1
print(b2d.fixture.get_density(body, 0));
// the bottom-left cell; get_bounds returns it zero-based
const [x, y] = tilemap.get_bounds(url);
tilemap.set_tile(url, "layer1", x, y, 3);
```

- **Arguments** — [`b2d.fixture`](/api/b2d.fixture) `fixture_index` and
  `child_index`, [`b2d.body`](/api/b2d.body) `destroy_fixture` and
  `destroy_shape`, the [`b2d.shape`](/api/b2d.shape) `body, shape_index` form,
  the [`tilemap`](/api/tilemap) `set_tile`, `get_tile` and `get_tile_info`
  coordinates, [`socket`](/api/socket) `client.send`'s `i` and `j`, and the
  editor's `image.pixel` and `tilemap.tiles` indexes.
- **Returns** — `tilemap.get_bounds`'s `x` and `y`, `client.send`'s `index` and
  `lastindex`, and the editor's `tilemap.tiles.get_tile`.
- **Round trips** — a value an engine call returned goes straight back in:
  `client.send(data, lastindex + 1)` resumes after the last byte sent.
- **Counting from the end** — a negative `i` or `j` at `client.send` counts from
  the end, as in `string.sub`, and passes through: `client.send(data, 0, -1)`
  sends the whole string.
- **Already zero-based** — [`gui.get_index`](/api/gui), the
  [`crash`](/api/crash) user fields and the `page` of
  [`resource.set_texture`](/api/resource) count from 0 in Defold too, so they
  pass through.
- **Not positions** — counts, ids, enum constants, the Box2D `group_index`
  collision group, array-valued tables such as `model.set_blend_weights`'s
  weights, and sentinels such as the tile `0` that clears a `tilemap.set_tile`
  cell are never touched.
- **Table fields** — only `options.index` below is converted inside a table. An
  index field in any other table keeps Defold's base, and its hover says
  "1-based": the `index` of [`b2d.body.get_fixtures`](/api/b2d.body) entries,
  the atlas `frame_start` and `frame_end` of `resource.create_atlas` and
  `set_atlas`, and `profiler.view_recorded_frame`'s `frame`. Subtract 1 from a
  fixture info `index` before passing it to a `b2d.fixture` call.

Each converted slot's hover reads "Zero-based in TypeScript; Defold receives it
1-based."

The conversion follows the call through the type checker:

- A literal folds: `get_density(body, 0)` emits `get_density(body, 1)`. Any
  other value is evaluated once: `i` emits `i + 1`, and an optional index that
  may be `undefined` stays `nil`. A generic constrained to `number` and a
  branded number convert like `number`. An index typed `any` is checked at run
  time: a number converts, anything else passes through.
- Aliases (`const density = b2d.fixture.get_density`, or one annotated
  `typeof b2d.fixture.get_density`), destructuring
  (`const { get_density } = b2d.fixture`) and every overload are converted; a
  project function that happens to share a name is not.
- Using a converting function as a value (passing it as an argument, returning
  it, storing it in an object, casting it with `as any`, calling it through
  `.call`, `.apply` or `.bind`, or binding it to a `const` typed as a different
  function), casting its namespace, and a spread argument that covers an index
  position are errors, since the call could not be converted there.

Hand-written `.lua` files and native extension APIs are outside the rule and
pass through untouched. A Lua module that receives an index from TypeScript
receives it zero-based, and an index it hands back is used as written.

When upgrading, subtract 1 from each literal or computed 1-based index you pass
to these calls. Values you took from an engine return need no change.

### Engine array properties: `options.index`

`go.get`, `go.set`, `gui.get` and `gui.set` take an `options.index` that picks
one element of an array property, such as a material constant array. It is
zero-based too, and the transpiler adds 1:

```ts
declare const url: Url;
// the first element: tint_array[0] in the shader
go.set(url, "tint_array", vmath.vector4(1, 0, 0, 1), { index: 0 });
```

- A literal is converted: `{ index: 0 }` emits `{index = 1}`.
- Any other value is evaluated once, plus 1: `{ index: i }` emits `{index = i + 1}`.
- Leaving `index` out passes the options through unchanged.
- The curried `go.get<P>()(…)` is converted too.
- An options variable whose type has `index`, a spread that carries `index` with
  no explicit `index` after it, and an `index` that may be `undefined` are
  errors. Write the options object inline at the call.

## Modules: `require` vs `import`

Lua wires files together with `require` and a returned table. TypeScript uses
`import` / `export`, and TypeScriptToLua lowers them straight back onto Lua's
module system — an `import` becomes a `require`, and your `export`s become the
module's returned table.

| Lua                                        | TypeScript                                     |
| ------------------------------------------ | ---------------------------------------------- |
| `local M = {}` … `return M`                | `export function f() {}`, `export const C = …` |
| `local foo = require("foo")`               | `import { f, C } from "./foo"`                 |
| `local foo = require("foo")` (whole table) | `import * as foo from "./foo"`                 |

Use **relative** specifiers (`"./foo"`, `"../lib/util"`) for your own files under
`src/`[^src-root]. Engine APIs are different: the namespaces `go`, `msg`, `vmath`, `sprite`,
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

| Lua                            | Idiomatic TypeScript          |
| ------------------------------ | ----------------------------- |
| `table.insert(t, x)`           | `arr.push(x)`                 |
| `#t`                           | `arr.length`                  |
| `string.format("%d", n)`       | template literal `` `${n}` `` |
| `tostring(x)`                  | `` `${x}` `` or `String(x)`   |
| `tonumber(s)`                  | `Number(s)`                   |
| `string.sub`, `string.find`, … | `str.slice`, `str.indexOf`, … |
| `math.abs`, `math.floor`, …    | `Math.abs`, `Math.floor`, …   |

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

A `declare global` block is type-only: it **emits no Lua**. The first assignment
to the declared name is what creates the global at runtime, and it lowers to a
bare VM-wide Lua global — no `local`, no module prefix. Given
`declare global { var FOO: number }`, the use site `FOO = FOO + 1` compiles to
exactly `FOO = FOO + 1`. That global is shared across the entire VM, broader than
a `require`-cached module local, so for ordinary app state prefer a module
singleton — see [Where script state lives](./script-state.md) for the full
placement picture.

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
returns a `[0, 1)` float ([TypeScriptToLua](https://typescripttolua.github.io/) (TSTL)
lowers it to a Lua runtime helper) and cannot be seeded; `math.random(m, n)` returns
an integer in `[m, n]` from the seedable engine RNG. Use the Lua form whenever you
need a reproducible or integer-ranged result.

The transpiler targets **Lua 5.1** to match Defold's runtime (LuaJIT on native and
desktop, a 5.1 VM on HTML5). That keeps the emitted code clear of 5.4-only
constructs — integer division `//`, bitwise operators, `goto`, the two-argument
`math.randomseed` — which the engine would reject. The ambient `math.randomseed`
is correspondingly single-argument, so the two-argument form is a type error, not
a runtime surprise.

## Libraries

- **Your own code** is just more TypeScript files — `import` them by relative
  path. No registration step, no manifest.
- **npm packages** do not resolve at all — not even a pure, dependency-free one.
  The build compiles a virtual program of your `include`-matched files only, so
  `node_modules` is never read and the import fails loudly. Copy the source into
  your project and import it relatively instead; see
  [npm packages do not resolve](./typescript-gotchas.md#npm-packages-do-not-resolve--vendor-the-source-instead).
- **Engine features** come from the ambient `@defold-typescript/types` namespaces
  (`go`, `msg`, `vmath`, …), never from npm. There is no package to install for
  them; they are part of the types surface the scaffold pins.

## See also

- [TypeScript gotchas](./typescript-gotchas.md) — the runtime sharp edges this
  page only points at: truthiness, `nil` collapse, `typeof`, opaque handles.
- [Script lifecycle](./script-lifecycle.md) — typing `self`, `on_message`, and
  `on_input` with `defineScript`.
- [Where script state lives](./script-state.md) — per-instance `self`, shared
  module locals, module singletons, and the VM-global `declare global` lowering.
- [Data structures](./data-structures.md) — the full container availability map:
  `Array`, tuple, `Map`, `Set`, `WeakMap`, `WeakSet`, object record, and `class`,
  plus what is not available and what to use instead.
- [Vector math](./vector-math.md) — why `v3 + v3` is not allowed and you use
  `v3.add(other)` instead.
- [Getting started](./getting-started.md) — scaffold, write a script, build to
  Lua.

[^src-root]: `src/` is this guide's shorthand and the scaffold's default, not a fixed location. Your source roots are the `include` globs in `tsconfig.json` — `["src/**/*.ts"]` out of the box, and any list of folders you set; `build` and `watch` compile exactly what those globs match, and ignore `exclude`.
