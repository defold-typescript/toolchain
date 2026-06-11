# TypeScript gotchas

Sharp edges where TypeScript, the TypeScriptToLua transpiler, or the Defold runtime behave in ways the type system cannot fully express. Each entry names the symptom, explains why it happens, and gives the recommended workaround.

New to TypeScript from Lua? Start with [TypeScript vs Lua](./typescript-vs-lua.md) for the syntax-and-idiom map; this page is the depth catalog you reach for when one of those quirks bites.

## Before you start: Lua vs TypeScript gotchas

The one-line version of every trap on this page. Skim it once; jump to the full entry when one bites.

- [Unary minus on a vector yields `number`](#unary-minus-on-vector3--vector4-silently-produces-number) — `-v3` infers `number`, not `Vector3`; use `v.unm()`.
- [Enum constants are branded numbers](#enum-constants-are-branded-numbers--a-bare-number-wont-do) — a bare magic number won't satisfy an enum parameter; pass the named `go.PLAYBACK_*` constant.
- [Engine handles are opaque](#engine-handles-are-opaque--you-cannot-fabricate-or-cast-across-kinds) — a `node` is not a `texture`; obtain each handle from the API that returns it, never fabricate or cross-cast.
- [Callback parameters are `unknown`](#callback-parameters-type-check-as-functions-not-unknown) — match the documented arity; narrow each param before use.
- [Some slots are `unknown` on purpose](#some-slots-are-unknown-on-purpose--the-any-wildcard) — `socket.skip` and friends accept anything and force a narrow on the way out.
- [`if (x)` truthiness differs in Lua](#if-x-truthiness-differs--0-and--are-truthy-in-lua) — `0` and `""` are **truthy** once transpiled; test the value explicitly.
- [`typeof` cannot narrow engine values](#typeof-cannot-narrow-engine-values--they-are-lua-userdata) — Defold handles are Lua `userdata`, so `typeof x === "object"` is `false` for them at runtime.
- [`on_message` ids are hashes, not strings](#on_message-ids-are-hashes-not-strings) — compare `message_id` against a `hash("…")` constant; a string literal never matches at runtime.
- [`null`/`undefined`/`== null` all become `nil`](#null-undefined-and--null-all-collapse-to-nil) — the three TS forms collapse to one Lua check; you cannot tell them apart at runtime.
- [`as` is not a runtime check](#as-is-a-compile-time-assertion-not-a-runtime-check) — a cast erases to nothing; the value is unverified at runtime.
- [Component properties are catalogued per namespace](#component-properties-are-catalogued-per-namespace) — read property types off `label.properties["color"]`, not off the namespace object.
- [`async`/`await` work but there is no event loop](#asyncawait-work-but-there-is-no-event-loop) — a `Promise` only advances when something resolves it synchronously; the importable `@defold-typescript/types/timers` polyfills bridge Defold's `timer.delay` so `await wait(s)` resumes on a later frame.

## Unary minus on Vector3 / Vector4 silently produces `number`

**Symptom.** `-v3a` compiles cleanly and infers as `number`, not `Vector3`. Anything downstream that expects a `Vector3` (passing to `go.set_position`, chaining `.add(...)`, etc.) fails to compile with a confusing error pointing at the *use site*, not at the `-`.

```ts
declare const v3a: Vector3;

const neg = -v3a;          // inferred as `number`, not `Vector3`
const target: Vector3 = -v3a;  // TS error here — but the bug is the `-`
```

**Why.** TypeScript's TS2362 check ("operand of an arithmetic operation must be of type 'any', 'number', 'bigint' or an enum") applies to *binary* `+`, `-`, `*`, `/` but **not** to *unary* `-`. The unary form has its own narrow check that does not reject object-typed operands; it just produces `number`. There is no way to opt a type out of unary negation at the type-system level, so the `vector3` interface cannot defend itself.

**Typed alternative.** Use `v.unm()` — the same metamethod the Lua runtime would call for `-v`, but exposed as a typed method:

```ts
const neg: Vector3 = v3a.unm();   // returns Vector3
```

The same gap exists for `Vector4`; the same workaround applies: `v.unm()`.

**How we pin this in the type tests.** `packages/types/test-d/guide-snippets.ts` carries a symmetric proof: one line asserts `const _: number = -v3a` (which must compile), the next asserts `const _: Vector3 = -v3a` with `@ts-expect-error` (which must remain an error). If a future change either fixes the TS behavior or breaks the workaround, exactly one of the two lines flips and the typecheck gate fails.

## Enum constants are branded numbers — a bare number won't do

**Symptom.** A call that the Lua runtime accepts with a magic number fails to typecheck when the parameter is an enum:

```ts
go.animate(id, "position.x", 2, 10, go.EASING_LINEAR, 1);  // TS error on `2`
go.animate(id, "position.x", go.PLAYBACK_ONCE_FORWARD, 10, go.EASING_LINEAR, 1);  // ok
```

**Why.** Defold's ref-doc encodes an enum member as a bare constant and lists the members' fully-qualified names as a parameter's accepted types. The generated typings recover each constant as a *nominally branded* number — `go.PLAYBACK_ONCE_FORWARD` has type `number & { readonly __brand: "go.PLAYBACK_ONCE_FORWARD" }` — and the parameter's type is the union of those brands. A plain `number` lacks the brand, so only a real `go.PLAYBACK_*` (or `go.EASING_*`) value satisfies it. This is intentional strictness: it stops you from passing the wrong magic number.

**Typed alternative.** Always pass the named constant (`go.PLAYBACK_ONCE_FORWARD`, `go.EASING_LINEAR`, …). The brand is type-only and erases at transpile time to a plain Lua global access, so there is no runtime cost. A branded constant is still assignable to any plain `number` parameter, so existing numeric signatures keep working.

**How we pin this in the type tests.** `packages/types/test-d/guide-snippets.ts` asserts the constant is assignable to `number` (backward compatibility) and to its own brand, while a bare `0` assigned to the brand carries `@ts-expect-error`. If the brand is dropped or widened, the expected error disappears and the typecheck gate fails.

**Constants can live in another namespace.** The brand is keyed on the constant's fully-qualified name, not on the namespace of the function that accepts it, so an enum can be owned by one namespace and consumed by another. The render buffer-type flags are the worked example: `render.get_render_target_width`, `render.get_render_target_height`, and `render.enable_texture` take a `graphics.BUFFER_TYPE_*` flag (`graphics.BUFFER_TYPE_COLOR0_BIT` … `_COLOR3_BIT`, `graphics.BUFFER_TYPE_DEPTH_BIT`, `graphics.BUFFER_TYPE_STENCIL_BIT`), and the named constant lives in the `graphics` namespace.

```ts
render.get_render_target_width(rt, graphics.BUFFER_TYPE_COLOR0_BIT);  // ok
render.get_render_target_width(rt, 0);                                // TS error on `0`
```

`packages/types/test-d/graphics-render-buffer-types.ts` pins this: the real `graphics` constant type-checks and a bare number carries `@ts-expect-error`.

## Engine handles are opaque — you cannot fabricate or cast across kinds

**Symptom.** A GUI `node`, a render `texture` or `render_target`, a `buffer`, a `resource`, a box2d `b2World`/`b2Body`, and similar engine handles each have a distinct nominal type. A value obtained for one kind is not accepted where another kind is expected, and a plain value (a number, an object literal) is never accepted:

```ts
const n = gui.get_node("button");        // Opaque<"node">
render.enable_texture(0, n);             // TS error — a node is not a texture
render.set_render_target(undefined);     // TS error — undefined is not a render_target
```

**Why.** Defold's ref-doc names these handles by a bare token (`node`, `texture`, `buffer`, …) with no public structure. The generated typings recover each as `Opaque<"<token>">` — a phantom-branded type whose brand is the token string. Distinct tokens carry distinct brands, so they are mutually non-assignable, and because the brand is a `unique symbol` property no plain value satisfies it. This mirrors the `Hash`/`Url` brands: the strictness stops you from passing a handle of the wrong kind or conjuring one from thin air.

**Typed alternative.** Obtain the handle from the engine API that returns it (`gui.get_node`, `render.render_target`, `resource.create_buffer`, …) and thread that value through. There is no constructor and no meaningful cast across handle kinds — if you find yourself casting, the call you are feeding it almost certainly wants a different handle.

**Named handle types.** Each handle is also referenceable as a named type alias under its namespace — `render.render_target`, `render.constant_buffer`, `render.texture`, `socket.master`, `socket.client`, `socket.unconnected`, `b2d.b2World`, `b2d.b2Body` — so you can annotate a binding directly (`const rt: render.render_target = render.render_target("rt", {})`). The alias resolves to the same `Opaque<"<token>">` brand the handle-returning function yields, so the annotation and the returned value are the same nominal type.

**How we pin this in the type tests.** `packages/types/test-d/ambient.ts` passes an `Opaque<"constant">`-typed value to `model.play_anim` and asserts a bare `0` in the same slot carries `@ts-expect-error`. It also binds `render.render_target(...)` to a `render.render_target`-typed variable and asserts a bare `0` cannot be — proving the named alias and the function's return type share one brand. If the brand is dropped or widened to `unknown`, the expected errors disappear and the typecheck gate fails.

## Callback parameters type-check as functions, not `unknown`

**Symptom.** Engine APIs that take a callback (`timer.delay`, `msg`-style message handlers, `http.request`, factory/particlefx completion callbacks, …) now expect a function of a specific arity. Passing a non-function, or a function with the wrong number of parameters, is a type error:

```ts
timer.delay(0.5, false, () => print("tick"));                       // too few params — TS error
timer.delay(0.5, false, (self, handle, time_elapsed) => { });       // OK — three params
```

**Why.** Defold's ref-doc names a callback parameter by its whole Lua signature string, e.g. `function(self, handle, time_elapsed)`. The generated typings recover each into an arity-preserving function type with the documented parameter names: `(self: unknown, handle: unknown, time_elapsed: unknown) => void`. The parameter names survive for hover documentation, but their types are `unknown` — the ref-doc carries no inner types — so you must narrow each argument yourself before using it. The return is `void`: the engine ignores any value a callback returns, and a `void` return position still accepts a callback that happens to return something.

**Typed alternative.** Match the documented arity and read the parameter names off hover to know what each slot is. Cast or narrow the `unknown` params at the point of use (`const url = result as Url`), exactly as you would any other `unknown`.

## Some slots are `unknown` on purpose — the `any` wildcard

**Symptom.** A few API slots are typed `unknown`: they accept any value going in, and a value coming out cannot be used until you narrow it.

```ts
const [first] = socket.skip(1, "a string", 42);  // first is `unknown`
const n: number = first;                          // TS error — narrow it first
const n2 = first as number;                       // OK
```

**Why.** Where Defold's own ref-doc types a value as the bare `any` token — "any Lua value" — the generated typings use `unknown` rather than guessing a concrete type. `socket`'s utilities (`socket.skip`) and its option accessors (`getoption`/`setoption`) are the cases you will meet. This is deliberate, not a gap: `unknown` is the honest model for "could be anything." It accepts everything as an argument, and as a result it forces a check before use — unlike TypeScript's `any`, which would silently switch type-checking off for that value.

**Typed alternative.** Treat these exactly like callback parameters: narrow or cast at the point of use (`first as number`), guided by what the Defold API docs say the value is. A branded or nominal type would be wrong here — the whole point of the `any` token is that no single concrete type fits.

**How we pin this in the type tests.** `packages/types/test-d/socket-any-unknown.ts` passes assorted values into `socket.skip`'s wildcard slots (proving any argument is accepted) and asserts a wildcard return is not directly assignable to `number` via `@ts-expect-error`, while a narrowing cast is. If a wildcard slot ever widened to `any` or were mis-mapped to a concrete type, the expected error would flip and the typecheck gate would fail.

## `if (x)` truthiness differs — `0` and `""` are truthy in Lua

**Symptom.** A guard that reads naturally in TypeScript changes meaning after transpile. `if (count)` in TS is false for `0`; the Lua it becomes is true for `0`.

```ts
function describe(count: number, label: string): string {
  if (count) {            // transpiles to `if count then` — true even when count is 0
    return label;
  }
  return "empty";
}
```

**Why.** `if (x)` transpiles to `if x then`, a direct pass-through with no coercion. JavaScript and Lua disagree on what counts as falsy: JS treats `0`, `""`, `NaN`, `null`, and `undefined` as falsy; Lua treats **only** `nil` and `false` as falsy. So `0` and `""` — falsy in the TypeScript you wrote — are **truthy** in the Lua that runs. The type system cannot warn you: the code is well-typed in both directions.

**Typed alternative.** Test the value you actually mean. Use `if (count > 0)`, `if (label !== "")`, or `if (x !== undefined)` instead of relying on truthiness. An explicit comparison transpiles to the same comparison in Lua and means the same thing in both languages.

**How we pin this in the type tests.** `packages/transpiler/src/narrowing-transpile.test.ts` snapshots `transpile(...)` of an `if (x)` guard and asserts the committed Lua is `if x then` — no coercion inserted. If TSTL ever started wrapping the condition in a JS-truthiness helper, the snapshot would change and the gate would fail.

## `typeof` cannot narrow engine values — they are Lua `userdata`

**Symptom.** A `typeof` guard that should match a Defold handle never fires at runtime, even though it type-checks.

```ts
function asNode(x: unknown): unknown {
  if (typeof x === "object") {   // transpiles to `type(x) == "table"` — false for a gui.node
    return x;
  }
  return undefined;
}
```

**Why.** `typeof x === "object"` transpiles to `type(x) == "table"`. Defold engine values — `gui.node`, `texture`, `buffer`, `b2World`, … — are Lua `userdata`, not tables, so `type(handle)` returns `"userdata"` and the branch is skipped. The value form is no better: `typeof x` transpiles to `__TS__TypeOf(x)`, which returns the string `"userdata"` for these handles — a value TypeScript's `typeof` union (`"object"`, `"function"`, `"number"`, …) does not even contain, so you cannot write a matching comparison. `typeof x === "number"/"string"/"boolean"/"function"` *do* inline to a reliable `type(x) == "…"`, and those work as written; it is only objects-vs-userdata that breaks.

**Typed alternative.** Do not reach for `typeof` to recognise an engine handle. The handles are already nominally typed (`Opaque<"node">` and friends — see [Engine handles are opaque](#engine-handles-are-opaque--you-cannot-fabricate-or-cast-across-kinds)), so thread the typed value through instead of re-checking it. When you genuinely hold an `unknown` from a wildcard slot, narrow it with the engine predicate that fits (a `nil` check, a field probe) rather than `typeof`.

**How we pin this in the type tests.** `packages/transpiler/src/narrowing-transpile.test.ts` snapshots both forms: `typeof x === "object"` → `type(x) == "table"`, and the value form `typeof x` → `__TS__TypeOf(x)`. The committed Lua makes the userdata mismatch visible; if either lowering changed, the snapshot would fail.

## `on_message` ids are hashes, not strings

**Symptom.** A handler that compares `message_id` against a string literal never fires, even though it reads naturally and (under older typings) compiled. The object it should react to is silently ignored — in the platformer example, the player fell through every wall because the contact handler never ran.

```ts
on_message(self, message_id, message) {
  if (message_id === "contact_point_response") {  // never true at runtime
    // ...
  }
}
```

**Why.** Defold delivers `message_id` to `on_message` as a pre-hashed `hash` value, not a string — the same way `action_id` arrives in `on_input`. Lua's `==` does no cross-type coercion, so `hash_value == "contact_point_response"` is always `false`. The string comparison transpiles verbatim (`message_id == "contact_point_response"`) and silently never matches. `ScriptHooks.on_message` types `message_id` as `Hash` to make the mismatch a *compile* error rather than a runtime mystery; the string-literal form no longer type-checks.

**Typed alternative.** Pre-hash the id once at module scope and compare `Hash` to `Hash`, exactly as the original Lua does and as `on_input` already does for `action_id`:

```ts
const msg_contact_point_response = hash("contact_point_response");

on_message(self, message_id, message) {
  if (message_id === msg_contact_point_response) {
    const contact = message as unknown as ContactPoint;  // handler payload is an untyped record
    // ...
  }
}
```

The handler's `message` is an untyped `Record<string | number, unknown>` — cast it to the subset you read. Sender-side payload narrowing by message id lives on `msg.post` (see the messages guide), not on the handler.

**How we pin this in the type tests.** `packages/types/test-d/lifecycle.ts` binds `message_id` to a `Hash` inside the handler and asserts a string-literal `message_id` at the call site carries `@ts-expect-error`. If `on_message` ever re-typed the id as a string, the expected error would disappear and the typecheck gate would fail.

## `null`, `undefined`, and `== null` all collapse to `nil`

**Symptom.** Three TypeScript checks you might think are distinct produce one identical Lua test, so they cannot be told apart at runtime.

```ts
function present(x: unknown): boolean {
  if (x === null) return false;       // `x == nil`
  if (x === undefined) return false;  // `x == nil`
  return true;
}
```

**Why.** Lua has a single absent value, `nil`. TypeScript's `null`, `undefined`, the strict `x === null` / `x === undefined`, and the loose `x == null` all transpile to `x == nil`. There is no Lua-level distinction between "explicitly null" and "missing", so a function that tries to treat `null` and `undefined` differently cannot — both arrive as `nil`. The `=== nil` form (using the ambient `nil` type) works as written and is the honest model.

**Typed alternative.** Model absence with a single sentinel. Pick `undefined` in your TypeScript (it is what the engine's `nil` maps to most naturally), use `x === undefined` or `x == null` to test it, and do not design APIs that depend on distinguishing the two. If you need a third "unset" state, encode it explicitly with a value, not with `null`-vs-`undefined`.

**How we pin this in the type tests.** `packages/transpiler/src/narrowing-transpile.test.ts` snapshots `x === null` and `x === undefined` side by side and asserts both committed lines are `x == nil`. The collapse is visible in the snapshot; if TSTL ever distinguished them, the gate would fail.

## `as` is a compile-time assertion, not a runtime check

**Symptom.** A cast that compiles cleanly does nothing at runtime — the value is never validated, and a wrong assertion produces a silent type mismatch later, not an error at the cast.

```ts
function first(values: unknown): number {
  const n = values as number;   // transpiles to `local n = values` — no check
  return n + 1;                 // runs even if `values` was a string or a table
}
```

**Why.** `const n = first as number` transpiles to `local n = first`: the cast is erased entirely. TypeScript's `as` is a *compile-time* assertion that you, the author, know the type — it inserts no runtime guard. So a cast that is wrong does not throw at the cast site; the bad value flows on until some Lua operation on it misbehaves, far from the cause. This is the same erasure that makes branded constants and opaque handles zero-cost — useful there, a footgun when you use `as` to "convert" an `unknown`.

**Typed alternative.** When you actually need to *check* a value (a wildcard `unknown`, untrusted input), narrow it with a real runtime test — `typeof x === "number"` (reliable for primitives, see the `typeof` entry above), a `=== nil` check, or a field probe — before using it. Reserve `as` for the cases where you already know the type from context the type system can't see, exactly as with callback and wildcard params.

**How we pin this in the type tests.** `packages/transpiler/src/narrowing-transpile.test.ts` snapshots `const n = x as number` and asserts the committed Lua is `local n = x` with no inserted check. If a cast ever started emitting a guard, the snapshot would change and the gate would fail.

## Component properties are catalogued per namespace

**Symptom.** Defold component properties — the values you address at runtime through `go.get`/`go.set`/`go.animate` with a string id (`"color"`, `"position"`, `"size"`, …) — do not appear as members on the namespace object. There is no `label.color` you can read directly.

**Why.** These properties are not module-level globals; they are per-component fields keyed by a string id passed to `go.get(url, "color")`. The ref-doc lists them as `PROPERTY` elements with a name and a type but no addressable symbol. The generated typings recover each namespace's properties into an in-namespace `interface properties { … }` so the name and type survive as a committed, drift-gated catalog. For example, `label.properties` carries `color: Vector4`, `size: Vector3`, `scale: number | Vector3`, and so on.

**Typed alternative.** Read a property's type off the catalog with an indexed access — `label.properties["color"]` is `Vector4`. The catalog also makes `go.get`/`go.set` type-aware: a literal key drawn from `go`'s own transform properties narrows the result and the written value to the property's real type. `go.get(url, "position")` is `Vector3`, `go.get(url, "scale")` is `number`, and `go.set(url, "euler", v3)` type-checks while `go.set(url, "position", "oops")` is rejected. Any other key — a `Hash`, a dynamic string, or a fragment-addressed cross-component property like `go.get("#sprite", "tint")` — falls through to an open `string | Hash` overload returning the documented wide union, so hashed and runtime access keep working unchanged.

**Name the component to narrow a cross-component property.** A string url like `"#sprite"` cannot tell the type system which component it targets, so the bare call can only narrow `go`'s own transform properties. When you know the component, name it with a type argument and the result narrows to *that* component's catalog:

```ts
const animation = go.get<sprite.properties>()("#sprite", "animation"); // Hash, not the wide union
go.set<sprite.properties>()("#sprite", "playback_rate", 2);            // value gated to number
go.get<sprite.properties>()("#sprite", "nope");                       // type error — not a sprite property
```

The form is curried — `go.get<P>()(url, property)` — on purpose. TypeScript has no partial type-argument inference: if `P` and the property key were both type parameters on one call, supplying `<sprite.properties>` would force the key to its default and collapse the return to the component's whole value union. The empty `()` fixes `P`, then the inner call infers the key from the `"animation"` argument, recovering the exact field type. You are naming the component yourself — nothing checks that `"#sprite"` actually resolves to a sprite — so this is a typed convenience over an unverified url, not a correctness guarantee. The bare direct call (`go.get("#go", "position")`) is unchanged for the transform default, and a fully dynamic key still falls through to the wide union.

**Name the script to read or tune another object's declared properties.** The same generic also types the *cross-script* channel — reading or writing a property a *different* script declared, addressed by its script-component url (`go.get("/enemy#controller", "speed")`). This is distinct from a component property and from the `self`-side access inside the owning script: it is how one object tunes another object's declared state. A script declares its editor properties with the value-keyed `properties` field of `defineScript`, and exports that shape as a nameable type with `ScriptPropertiesOf<typeof script>`; another script names it as the `P` generic to get a typed read and a value-gated write:

```ts
// enemy.ts — the owning script declares its properties
export default defineScript({
  properties: { speed: 100, target: vmath.vector3() },
});
export type EnemyProps = ScriptPropertiesOf<typeof import("./enemy").default>;

// elsewhere — another object reads and tunes them by url
const speed = go.get<EnemyProps>()("/enemy#controller", "speed");  // number
go.set<EnemyProps>()("/enemy#controller", "speed", 250);           // value gated to number
go.get<EnemyProps>()("/enemy#controller", "missing");              // type error — not declared
```

`ScriptPropertiesOf` extracts the same `TProps` the owning script's `self` carries, so the cross-script type and the owning script's `self` stay one source of truth — there is no second hand-maintained interface to drift. As with the component generic, you name the script yourself; nothing verifies the url resolves to that script.

**How we pin this in the type tests.** `packages/types/test-d/guide-snippets.ts` asserts `label.properties["color"]` is assignable to `Vector4` and that a `string` annotation on the same member carries `@ts-expect-error`. `packages/types/test-d/go-property-accessors.ts` pins the typed `go.get`/`go.set`: narrow keys resolve to `Vector3`/`Quaternion`/`number`, a wrong-typed `go.set` value and a wrong-typed `go.get` assignment carry `@ts-expect-error`, and the `Hash`/dynamic-string fallback still type-checks. `packages/types/test-d/go-property-access.ts` pins the caller-named-component generic: `go.get<sprite.properties>()("#sprite", "animation")` is `Hash`, a wrong key and a wrong value type carry `@ts-expect-error`, and the bare transform call still resolves; it also pins the cross-script channel — a `ScriptPropertiesOf<typeof enemyScript>`-named read is typed, a write is value-gated, and a wrong key or wrong value type carries `@ts-expect-error`. `packages/types/test-d/lifecycle.ts` proves `ScriptPropertiesOf` extracts exactly the declared property shape (excess and wrong-typed fields carry `@ts-expect-error`), tying it to the `self` channel. If the property catalog is dropped, its member types change, or the overloads regress, one of these lines flips and the typecheck gate fails.

## Field-documented tables are typed object shapes, not opaque records

**Symptom.** A `table` param or return whose Defold ref-doc spells out its fields, or whose official example proves a stable shape, is no longer the opaque `Record<string | number, unknown>` it once was. `sys.get_sys_info()` returns a concrete object — `system_name`, `gmt_offset`, and the rest are typed members you can read directly and that auto-complete; a misspelled field is a compile error, not silent `unknown`.

```ts
const info = sys.get_sys_info();
const name: string = info.system_name;   // typed string, no cast
const offset: number = info.gmt_offset;  // typed number
// @ts-expect-error not_a_field is not a field of the sys info table
info.not_a_field;
```

**Why.** Many Defold `table` slots carry their field structure only in the doc HTML, in one of four regular shapes: a `<dt><code>field</code></dt><dd><span class="type">T</span></dd>` definition list, a `<ul>` whose items read `<span class="type">T</span> <code>field</code>` (type before name), a dash-list option bag whose items read `field <span class="type">T</span>` / `<code>field</code> <span class="type">T</span>` (name before type), or a code-dash field that reads `<code>field</code> - <span class="type">T</span>` (name in `<code>`, then dash, then type — `sys.open_url`'s `target` attribute). The generator parses these shapes and emits an inline object type instead of the `Record` fallback, so the field names and types survive. Two nested shapes are also recovered: a `<dl>` declaring a single `table`-typed field whose keys sit in an immediately-following `<ul>` typed-field list (`window.get_safe_area()` now returns `{ safe_area: { x: number; y: number; … } }`), and a flattened `<ul><li><dl>` option bag whose `table` entries are followed by their member fields (`resource.create_atlas` groups `animations` and `geometries` into nested objects). A recovered `table` field whose `<dd>` prose reads "a list of …" emits an **array** of that recovered element shape rather than a single object (`resource`'s `animations` and `create_atlas`'s `geometries` become `{ … }[]`); the `[]` is appended only when member fields were recovered. A "list" field with no recovered member shape but a machine-readable **numeric** element type — its `<dd>` reads "a list of … in the form {px0, py0, …}" / "{i0, i1, …}", a flat comma-separated list of numeric placeholders — emits `number[]` (`resource.create_atlas`/`set_atlas`'s `vertices`/`uvs`/`indices`); a brace form with quotes, nested braces, or non-numeric identifiers is never guessed and stays `Record`. A "list" field with neither members nor a numeric brace form (opaque maps, the wholesale `geometries` `Record`) stays `Record`. A cross-reference form is also recovered: a `table` slot with no inline field list of its own whose doc carries a `See <a href="…#<element>">` pointer to a sibling element in the same module adopts that element's already-recovered fields (`physics.set_shape`'s data param adopts `physics.get_shape`'s fields). Resolution is one hop only. A supplementary `See` pointer sitting beside an **untyped name-only** `<ul>` field list (`<li>field</li>` items with no `<span class="type">`) is also recovered: the slot adopts the referenced element's fields **filtered to the names the own `<ul>` enumerates** (`resource.get_atlas` lists `texture`/`geometries`/`animations` then points at `resource.set_atlas`, so it adopts those three only — the sibling's unlisted `vertices`/`uvs`/`indices` are excluded). A `See` pointer beside an element's own **typed** field list still loses to the direct parse, which already recovers those fields. Tables with no recoverable shape (the wholesale `geometries` `Record`, opaque key→value maps) keep the `Record` type — there is no single machine-readable structure to recover. Two deliberate distinctions: a recovered **input** parameter's fields are optional (an option bag accepts a partial or empty `{}`, exactly as the old `Record` did), while a **return** table's fields are required (the engine always populates them); and recovery nests at most one level — a deeper `table` field with no recovered keys stays `Record`.

**Typed alternative.** Read the members directly — `sys.get_sys_info().system_name`, `liveupdate.get_mounts()[0].uri`, `tilemap.get_tile_info(url, layer, x, y).index` — instead of indexing an opaque record and casting. For an options argument, pass only the fields you need (`image.load(data, { flip_vertically: true })`); omitted fields and `{}` still type-check.

**How we pin this in the type tests.** `packages/types/test-d/sys-info-table-fields.ts` asserts `sys.get_sys_info().system_name` is assignable to `string` and that a bogus field carries `@ts-expect-error`; `packages/types/test-d/example-shaped-table-curations.ts` pins the example-proven `liveupdate.get_mounts()` and `tilemap.get_tile_info()` shapes. The fidelity audit and the emitter share the table recovery and curation data (`packages/types/src/emit-dts.ts`), so the `recordTables` loss gate and the emitted surface cannot drift; if a recovered field's type regressed to `unknown` the audit's `unknownTokens` would surface it.

## `async`/`await` work but there is no event loop

**Symptom.** You can write `async` functions, `await`, and `Promise` (the `Promise` type ships in the ES2022 lib), and it type-checks and transpiles. What does **not** exist is a JavaScript event loop: there is no `setTimeout`, no I/O microtask queue, and no scheduler that drains pending promises between frames. A promise advances only when something resolves it synchronously on the current call stack.

```ts
async function rollLater(): Promise<number> {
  return 42; // resolves synchronously
}

export async function main(): Promise<void> {
  const r = await rollLater(); // runs to completion in the same call
  print(r);
}
```

**Why.** TypeScriptToLua implements `async`/`await` itself, on top of Lua coroutines:

- An `async function` is lowered to `__TS__AsyncAwaiter(generator)`, which returns a `__TS__Promise` and runs the function body inside a Lua **coroutine**.
- `await x` is lowered to `coroutine.yield(x)`. The awaiter wraps the yielded value as `Promise.resolve(x)`, registers a continuation, and `coroutine.resume`s the body with the result once that promise settles.
- `__TS__Promise` is TSTL's own Lua class with `then`/`catch`/`finally`/`all`/`resolve`/`reject`. Resolution is callback-based and synchronous: a callback registered on an already-settled promise fires immediately; otherwise it is stored until `resolve()`/`reject()` is called.

These helpers ship in `lualib_bundle.lua`, which the build writes to the output root; the emitted module does `require("lualib_bundle")` to pull them in. No setup or polyfill is needed.

The consequences are where it bites:

- Awaiting an already-resolved or synchronously-resolving promise runs to completion in the same frame — fine, and reads well.
- There is no timer or I/O integration. `await new Promise((r) => setTimeout(r, 1000))` cannot be written — `setTimeout` does not exist. A promise that nobody resolves leaves the async function suspended **forever**, with no error and no warning.
- A rejected promise with no `.catch` is silently dropped; there is no Node-style "unhandled rejection" report.

**The engine scheduler bridge.** What the JS runtime lacks — a thing that advances pending work between frames — Defold supplies as `timer.delay`: a frame-driven scheduler that fires a callback on a later frame. That callback is the hook. Resolve a `Promise` from inside a `timer.delay` callback and the `await` waiting on it resumes when the engine fires the timer, not before. Bridge it by hand by stashing the promise's `resolve` and calling it from the callback:

```ts
function waitSeconds(seconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    timer.delay(seconds, false, () => resolve()); // engine callback drives the promise
  });
}
```

**Importable polyfills.** You do not have to hand-roll that bridge. The first timer-polyfills slice ships it as named module exports:

```ts
import { setTimeout, setInterval, clearTimeout, clearInterval, wait } from "@defold-typescript/types/timers";
```

`setTimeout`/`setInterval` take **milliseconds** (the web-familiar unit) and return a numeric `timer` handle; pass that handle to `clearTimeout`/`clearInterval` — or to Defold's own `timer.cancel`, which is the same handle. `wait` takes **Defold-native seconds** and returns a `Promise<void>` you can `await`:

```ts
import { wait } from "@defold-typescript/types/timers";

export async function main(): Promise<void> {
  await wait(1); // resumes when the engine timer fires, not before
  print("one second later");
}
```

These are not ambient globals: each script is an isolated Lua chunk with no shared scope, so the import lowers to a `require` of the timer runtime the build writes to the output root (the same mechanism as `lualib_bundle`).

**Caveats.** The polyfills are timer-backed, not a drop-in `setTimeout`. Four differences bite:

- **Context-bound lifetime.** A `timer.delay` timer is owned by the script that created it and is auto-cancelled when that game object is deleted. A `wait` straddling the deletion of its own object never resolves.
- **One-frame minimum resolution.** Even `setTimeout(cb, 0)` / `wait(0)` fires on the *next* frame, never the same one — the scheduler is frame-driven, so sub-frame delays round up to one frame.
- **No microtask queue.** `Promise.resolve().then(...)` still runs synchronously on the current call stack; there is no microtask drain. Only a *timer-backed* promise crosses a frame boundary.
- **Leaked suspended coroutines.** A promise that nobody ever resolves leaves its `async` function suspended forever as a parked Lua coroutine — no error, no warning, no timeout.

**ts-defold contrast.** ts-defold ships no `setTimeout` polyfill of its own — its only `settimeout` is LuaSocket's per-socket I/O timeout method, not a scheduler. The `@defold-typescript/types/timers` module is specific to this toolchain.

**How we pin this in the type tests.** `packages/transpiler/src/transpile.test.ts` transpiles an `async`/`await` sample and asserts the lowering (`__TS__AsyncAwaiter` for the function, `__TS__Await` for the await) with zero diagnostics, and that the Promise runtime (`__TS__Promise`) is present in the emitted `lualib_bundle`. If TSTL changed the async lowering or stopped bundling the Promise helpers, the assertions would fail.
