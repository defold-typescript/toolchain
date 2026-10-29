---
toc-title: Authoring LuaLS library types
---
# Authoring LuaLS library types

Some pure-Lua Defold libraries ship their own type information as inline
[LuaLS](https://luals.github.io/) (`---@`) annotations rather than a `.script_api`.
This toolchain generates TypeScript declarations for them from those annotations
and commits the result into `@defold-typescript/library-types`, so a consumer that
declares the library gets autocomplete and `tsc` coverage with no hand-written
`.d.ts`. [`resolve`](./resolve.md#vendored-library-types) then materializes the
committed declaration into the consumer's project.

Adding such a library is **data, not code**: you add one entry to
`packages/library-types/luals-targets.json`, run the four generation commands,
check the emitted API-doc description, and commit the artifacts. There is no
pipeline source to touch — the same front-end that produces the druid types
produces yours.

> This page is for **library-type authors** working inside this repository. If you
> only want to *use* a vendored library in your own game, you need nothing here —
> just declare the dependency and run [`resolve`](./resolve.md).

## Is your library a LuaLS target?

Two facts decide it:

- **It is plain Lua** (installed via Defold's **Fetch Libraries**, no
  `.script_api`), and
- **its source carries inline `---@` annotations** — `---@class`, `---@field`,
  `---@param`, `---@return` on the public module.

A hand-written library with no annotations is not a LuaLS target; those are
maintained as hand-vendored `.d.ts` files elsewhere in `library-types`. A library
whose annotations are sparse (near-zero fidelity coverage, see below) will emit a
hollow surface and is not worth adding.

The library's runtime `require` path (its `moduleId`) must not already be claimed
by another entry in `library-types` — two front-ends emitting the same module
would collide.

## 1. Add a `luals-targets.json` entry

Each entry pins its own repository and tag — a LuaLS library ships no `.d.ts`, only
annotations, and each lives in its own repo at its own release. The fields:

| Field | Required | What it is |
| ----- | -------- | ---------- |
| `repo` | yes | The GitHub repository URL, e.g. `https://github.com/Insality/druid`. |
| `ref` | yes | The exact release tag to pin. Resolve the newest stable tag (`git ls-remote --tags <repo>`) — never invent one. |
| `sourceGlobs` | yes | Globs selecting the `.lua` files to snapshot, relative to the repo root (e.g. `["druid/**/*.lua"]`). |
| `moduleId` | yes | The library's runtime `require` path, dotted (e.g. `druid.druid`). This names the emitted `declare module` and scopes the module-function surface to `<moduleId-as-path>.lua`. |
| `namespace` | yes | The artifact stem — the emitted files are `generated/<namespace>.d.ts`, `fidelity/<namespace>.json`, `api-doc/<namespace>.json`. |
| `license` | no | SPDX-style license id, surfaced by the docs-site provenance block. Defaults to `""`. |
| `typeRenames` | no | Map from a LuaLS type name to the TypeScript type *text* to emit (e.g. `{ "vector3": "Vector3" }`). The value is emitted verbatim and may name an ambient global, including a dotted one like `debug.FunctionInfo` — it never contributes an import. Omit or `{}` when the library references no renamed types. |
| `ignore` | no | Globs excluded from `sourceGlobs` — tests, examples, editor widgets. Defaults to `[]`. |
| `externalTypes` | no | Map from a type name another target owns to `{ "module": "<its moduleId>", "name": "<its export>" }` — see below. Omit when the library references no other library's types. |

A missing required field fails loudly, naming both the field and the offending
entry.

### Types another library owns

A library that `require`s a second library annotates the borrowed type by its bare
name (druid's `---@field on_click event`). Left alone that token resolves to
nothing local and lowers to `unknown`. Naming its owner in `externalTypes` instead
makes the emitter write a real import at the top of the `declare module` block and
resolve every use of the token to it:

```json
"externalTypes": { "event": { "module": "event.event", "name": "event" } }
```

emits `import type { event } from 'event.event';`, types all 46 of druid's callback
fields as `event`, and resolves the `---@class event.on_size_changed: event`
parent to a real `extends`. The import is type-only, so it binds no value and a
library that exports a function of the same name (`quest.event`) still
compiles. The key is the LuaLS token as written; `module` must
be the owning target's `moduleId` exactly, and `name` its exported type. A token
whose local name would collide with one the library declares itself fails loudly
rather than silently shadowing it.

The consuming project must declare that upstream library too. `resolve` builds no
inter-library dependency graph, so a project that lists druid alone materializes
`generated/druid.d.ts` without `generated/event.d.ts` — the import then degrades
to an error-`any` under the repo-wide `skipLibCheck`. Declare both; druid does not
run without `event.event` at runtime either. quest and token import `event` from
`event.event` the same way (quest also imports `queue`), so a project that lists
either one declares defold-event beside it.

Prefer `externalTypes` over a `typeRenames` entry pointing at an `import(...)`
type: the api-doc lowering maps through the same context, so an inline
`import('event.event').event` would render as the user-facing signature on the
library's `/api` page, where `externalTypes` renders the clean `event`.

A runtime `require` is not by itself a type dependency, so decide from the
annotations rather than the requires. panthera opens `panthera/panthera.lua` with
`local tweener = require("tweener.tweener")`, yet no annotation in its subtree
names a `tweener` type — every easing is annotated `string|constant`. It
therefore takes no `externalTypes` entry, and a project consuming panthera needs
`defold-tweener` installed for it to run but not for its types to resolve — the
inverse of druid, which needs `event.event` for both.

### Types the Lua stdlib already owns

Some tokens belong to no target at all — the ambient Lua standard library already
declares them. `log`'s `---@param debuginfo debuginfo` names the table
`debug.getinfo()` returns, which `lua-types` types as `debug.FunctionInfo`. That
takes a `typeRenames` entry, not an `externalTypes` one:

```json
"typeRenames": { "debuginfo": "debug.FunctionInfo" }
```

The emitted signature reads `debuginfo: debug.FunctionInfo` with no import line,
and `/api/log.log` renders that same dotted name — the way `Vector3` and
`Opaque<"node">` already render there.

The rule: a token another **target** owns takes `externalTypes` and gets an
import; a token the **ambient** stdlib already declares takes a dotted
`typeRenames` value and gets none. A library that declares the token itself wins
over either, so a rename never shadows a real local declaration.

Two naming rules keep such a local declaration from hiding the type a rename
names, and both apply with no configuration. An alias that names itself in its
own body means the type it shadows: `---@alias hash userdata|hash` emits
`type hash = Opaque<"userdata"> | Hash`, and every other `hash` in the library
still names the local alias. A declaration named like a core or `typeRenames`
value is declared with a trailing underscore: `---@alias Url url|string` emits
`type Url_ = Url | string`, the library's own `Url` references read `Url_`, and an
engine `url` still reads `Url`. Two declarations that land on one generated name,
such as `Url` beside the library's own `Url_`, fail the emit naming both.

Where an upstream annotation restates a member it inherits from such a parent, and
restates it incompatibly enough that the emitted redeclaration would not
type-check, drop the restatement with an `annotationOverrides` field override —
`"fields": { "subscribe": { "drop": true } }` — and let the member inherit. Like
every override, a `drop` naming an absent field throws rather than passing
silently.

The second drop shape is a class-level `@overload`. The emitter lowers one onto the
interface as a call signature, which is right whenever the class really is callable —
`event`'s `EVENT_METATABLE` and `PROMISE_METATABLE` each carry a real `__call`. It is
wrong where the `@overload` describes the *module table* while the interface types the
*instance*: `log` reuses one table as both, but only the module table gets `__call`, and
`get_logger` returns an instance built on `{ __index = M }`, which Lua never treats as
callable. Drop that signature with
`"callSignature": { "drop": true }` on the interface. Same loud failure as the others: an
override naming an interface that has no call signature throws.

Some libraries bind a `---@class` to a field of the module table instead of declaring
a `---@field` for it: token writes `---@class token.event.on_token_change: event`
directly above `M.on_token_change = event.create()`. The class becomes an interface,
but nothing exports the value, so `token.on_token_change` would not exist in
TypeScript. A `moduleObject` override names the module's class and each bound field
with its class:

```json
"annotationOverrides": {
  "moduleObject": {
    "interface": "token",
    "fields": { "on_token_change": { "type": "token.event.on_token_change" } }
  }
}
```

Each field emits as `export const on_token_change: token_event_on_token_change;`,
documented with its class's description, and the module's own class is no longer
emitted as an empty interface. The override throws when the module class or a field's
type is absent from the model, when the module class already declares the field
(upstream added the `---@field`, so delete the entry), when a module function has the
same name, and when the parser already treats a different class as the module object.

Other libraries assign constants to the module table with no annotation at all:
live-unbundler writes `M.MSG_ALL_LOADED = hash("all_loaded")` and
`M.RES_BOTH = 3` at the top of its module file, so the lane exports neither. A
`moduleConstants` override types each one with a LuaLS token and an optional doc line:

```json
"annotationOverrides": {
  "moduleConstants": {
    "MSG_ALL_LOADED": { "type": "hash", "doc": "Sent when every requested module has loaded." },
    "RES_BOTH": { "type": "liveupdater.res_mode", "doc": "Download both resolutions." }
  }
}
```

Each entry emits as a documented `export const MSG_ALL_LOADED: Hash;` and appears on
the `/api` page, and its token counts toward the fidelity report like any annotation.
Only a column-0 `M.NAME = ...` on the table the module's own file returns
(`return M`) counts as an assignment, as does the first target of
`M.DEBUG, M[1] = 1, "DEBUG"`; an assignment on another table, such as
`Other.NAME = 1`, does not. The override throws when the returned table never has
the name assigned at column 0, when a module function has the same name, and when
the module object's class already declares it as a field.

A `---@meta` file can describe a class's functions with dot syntax: ads-wrapper's
`ads_networks/ads_network.lua` starts with `---@meta`, puts `---@class ads_network` on
`local ads_network = { NAME = "ads_network" }`, and then annotates
`function ads_network.setup(params)` and its siblings. When the tag is the file's
first non-blank line, each such function becomes a method of `ads_network` declared
with `this: void` (`setup(this: void, params?: unknown | undefined): void;`), because callers invoke
it as `network.setup(params)`, not `network:setup(params)`. In any other file the
same form stays a module function, since a runtime module may annotate its own table
as a class and still export its functions.

A dot function on another local table belongs to that table when the returned module
re-exports it at column 0. flow's `flow/flex.lua` defines `function Node.new(opts)` on
`local Node = {}`, assigns `FL.Node = Node`, and ends with `return FL`, so `new` is
declared on `export const Node: { "new"(this: void, ...): Node }`, not as a top-level
`flex.new`. Because the file also sets `Node.__index = Node` and `Node.new` declares
`---@return Flow.FlexNode`, the `Node` interface extends `Flow_FlexNode`, and `new`
plus every method annotated `---@return Flow.FlexNode self` return `Node`, so
`flex.Node.new({ key: "root" }).set_width(960).calculate_layout(960, 640)` keeps the
chainable methods. A table exported under several fields is declared under each field.
A field assigned more than once declares the table it is assigned last.

Where an annotation types a parameter wrongly, a `type` token on a `moduleFunctions`
parameter replaces it: ads-wrapper's `queue.lua` writes `---@param fn ads_callback`,
though `run` calls `fn(network, callback, params)`, so the `ads_wrapper.queue` target
retypes it:

```json
"annotationOverrides": {
  "moduleFunctions": {
    "add": {
      "params": {
        "fn": { "type": "fun(network: ads_network, callback: ads_callback, params?: table)" }
      }
    }
  }
}
```

`add` then emits `fn: (network: ads_network, callback: ads_callback, params?: LuaTable) => void`.
A parameter of `interfaces.<name>.methods.<method>.params` takes the same `type` key. Naming
an absent function or parameter throws.

`"optional": true` on `interfaces.<name>.methods.<method>` emits the method as `name?(...)`,
for a method the library checks for before it calls it. ads-wrapper's `wrapper.lua` guards
the call with `if network.request_idfa then`, so the `ads_wrapper` targets mark
`ads_network.request_idfa` optional, and a network without it still passes
`ads_wrapper.ads_wrapper.register_network`.

## 2. Generate the artifacts

Run the three commands from `packages/library-types`, in order. Each iterates every
target in `luals-targets.json`, so an unchanged entry re-emits byte-for-byte and
only your new entry produces new files.

```sh
cd packages/library-types

bun run luals:fetch      # snapshot the pinned sources into fixtures/luals/<namespace>/
bun run luals:fidelity   # build fidelity/<namespace>.json — the coverage report
bun run luals:api-doc    # lower api-doc/<namespace>.json — the docs-site model
```

- **`luals:fetch`** reads the pinned tree, applies `sourceGlobs` minus `ignore`,
  and writes each selected `.lua` under `fixtures/luals/<namespace>/`, preserving
  tree shape. This is the only command that touches the network; everything after
  it reads those committed fixtures, so the pipeline is reproducible offline.
- **`luals:fidelity`** parses the fixtures and reports how much of the surface
  resolved to a known type (see below).
- `resolve` prints the `.d.ts` a consumer sees from these fixtures, or from the
  dependency's own archive. Interfaces and aliases come from the whole snapshot;
  the module's own functions come only from the `moduleId` file.
- **`luals:api-doc`** lowers the same model to the JSON the docs-site `/api` page
  renders.

A `---@deprecated` before a `---@class`, `---@alias`, or a function declaration
carries into both artifacts — as a JSDoc `@deprecated` in the `.d.ts` and as a
`Deprecated` line on the `/api` page, with the tag's own text when it has any. A
tag on a *type* still reaches only the `.d.ts`, since a type has no page heading
of its own to carry the line. Only the strict `---@deprecated` form is read; a
spaced `--- @deprecated` is treated as prose, as it is for every other tag.

## 3. Read the fidelity report

`fidelity/<namespace>.json` tells you whether the emit is worth committing:

- **`coverage`** — the fraction of type tokens that resolved to a known type. Druid
  sits around `0.9`; a healthy new library lands in the same range. Near-zero means
  the source is not meaningfully annotated — reconsider the target.
- **`unknownTokens`** — the distinct type names that fell back to `unknown`. A cross-
  library reference (another Insality module) shows up here until you name its owner
  in `externalTypes`, which resolves it; the LuaLS placeholders `_` and a bare `...` are not among them,
  because they declare no type and now lower to `unknown` without counting against
  coverage, and neither is a bare `function`, because it
  now lowers to the callable type `(...args: any[]) => unknown`. A rename that *should*
  have applied shows up as an unexpected entry — fix `typeRenames` and re-emit.
- **`undocumentedMembers`** — members with no annotation at all; informational.

Each report's `coverage` is pinned by a committed floor in
`packages/library-types/fidelity-floor.json`, so a regeneration that lowers it fails
the suite instead of quietly rewriting the report. The floor covers every emitting
lane — LuaLS, markdown, script_api, and openapi — not just this one. Regenerating
never touches the floors; when you genuinely improve coverage, lock the win in with

```sh
bun run --cwd packages/library-types fidelity:floor
```

which raises each floor to the current coverage and can never lower one. A drop is
therefore always a real regression to fix at the source, never a floor to edit down.

## 4. Check the API-doc description

After `luals:api-doc`, open `api-doc/<namespace>.json` and inspect
`info.description`. It carries the description line on the library's main
`---@class`. When that class has no description line the value is empty (`""`),
and the docs-site `/api` page renders with no description — the "every library
page has a non-empty description" gate fails.

Remediate by adding a namespace-keyed entry to
`packages/library-types/library-descriptions.json` — `"<namespace>": "<one-line
summary>"`, keyed by namespace. The docs-site fallback in `api-surface-loader.ts`
reads it for LuaLS libraries (a ts-defold library keys its fallback on the
upstream classification dir; a LuaLS library has none, so it keys on the
namespace directly). `druid` needs nothing here — its `---@class druid` is
described, so it never reaches the fallback. `decore` is the worked example: its
`---@class` carries no description, its `api-doc/decore.json` `info.description`
is `""`, and the committed `"decore": "Defold ECS Data Manager"` entry supplies
the page description.

## 5. Validate, then commit

The `dts-declaration-validity` gate type-checks every module `resolve` prints under
`skipLibCheck: false`, together with the `test-d/` usage proofs, so a new target is
compiled as soon as `luals-targets.json` lists it. Fidelity parity is gated per
namespace. Run the library tests:

```sh
bun test packages/cli/src/library  # from the repo root
bun run typecheck  # from the repo root
bun run --cwd packages/library-types fidelity:floor  # from the repo root
```

A brand-new library has no floor entry yet, and the floor gate fails until it gets
one — `fidelity:floor` seeds it at the coverage you just measured.

Commit the new entry, the snapshotted `fixtures/luals/<namespace>/`, both
emitted artifacts (`fidelity/`, `api-doc/`), and the updated
`fidelity-floor.json` together. Every commit
must also add a [changelog](./changelog.md) bullet — a pre-commit gate enforces it.

## Worked example — druid

The druid entry is the reference shape:

```json
{
  "repo": "https://github.com/Insality/druid",
  "ref": "1.2.5",
  "license": "MIT",
  "sourceGlobs": ["druid/**/*.lua"],
  "moduleId": "druid.druid",
  "namespace": "druid",
  "typeRenames": {
    "vector": "Vector",
    "vector3": "Vector3",
    "vector4": "Vector4"
  },
  "ignore": ["**/test/**", "**/example/**", "**/example_*/**"],
  "externalTypes": { "event": { "module": "event.event", "name": "event" } }
}
```

`sourceGlobs` snapshots the whole `druid/` tree; `ignore` drops its tests and
examples; `moduleId` `druid.druid` scopes the exported functions to
`druid/druid.lua` while the interfaces merge from every file; `typeRenames` maps
druid's vmath references onto the toolchain's branded `Vector*` types;
`externalTypes` hands druid's callback fields to the `event` library that owns
them. From these fixtures, or from the druid archive a project depends on,
[`resolve`](./resolve.md#vendored-library-types) prints the declaration it
materializes into a consuming project as `druid.druid`.

## Libraries that ship a `.script_api`

A native or hybrid library that ships an extension `.script_api` (the same YAML
format every Defold extension ships) has a **third** ingestion mode, distinct
from the LuaLS front-end above: `packages/cli/src/library/sync-script-api-types.ts`,
driven by `packages/library-types/script-api-targets.json`. Instead of parsing
`---@` annotations, it routes the committed `.script_api` snapshot through the
**shared ref-doc emitter** — `scriptApiToFixtureJson` → `generateModuleDeclaration`,
the exact path resolve-time extension typing uses — so
one-level nested sub-namespaces (`bridge.platform`, `bridge.achievements`) survive
into nested `namespace` blocks. The output is an importable module keyed by
`moduleId` (`declare module 'bridge.bridge'`), matching the LuaLS library goldens,
so the library imports under its pinned specifier; the `declare global` form
stays the resolve emitter's, for extensions a project declares.

Each entry pins `repo`, `ref`, `scriptApi` (the path to the `.script_api` in the
repo), `moduleId`, `namespace`, and the exact `generated` / `apiDoc` / `fidelity`
output paths. The generate arms mirror the LuaLS ones:

```sh
cd packages/library-types

bun ../cli/src/library/sync-script-api-types.ts --fetch      # snapshot the pinned .script_api into fixtures/script-api/<moduleId>.script_api
bun ../cli/src/library/sync-script-api-types.ts --api-doc     # lower the pinned api-doc/<...>.json (raw ref-doc doc, uniform with the engine fixtures)
bun ../cli/src/library/sync-script-api-types.ts --fidelity    # build the pinned fidelity/<...>.json
```

The first migrated target is **`Playgama/bridge-defold`** (pinned `v2.3.0`),
maintained entirely from its `.script_api` — its former ts-defold binding is
gone. Three things are specific to a script_api target and worth knowing:

- **Output paths are pinned explicitly and named for the single-segment
  `namespace`.** Like the LuaLS libraries, a migrated script_api library is the
  sole maintainer of its namespace, so its goldens are `generated/bridge.d.ts`,
  `api-doc/bridge.json`, and `fidelity/bridge.json` — not the dotted `moduleId` —
  which keeps the docs Libraries tree and the file layout uniform with druid. The
  require specifier is still the `moduleId` (`declare module 'bridge.bridge'`), so
  `resolve` materializes it unchanged via the registry's module→stem mapping.
- **Fidelity mirrors the emitter, so an unmapped token counts against coverage.**
  The report is computed over the ref-doc doc with the emitter's own type map: a
  token the emitter renders as `unknown` is counted in `unknownFallbacks` and
  listed in `unknownTokens` rather than hidden. A pipe-separated `type:` or a YAML
  list (`type: [table, string]`) is split into one token per alternative before
  that check, so bridge's `string | nil` returns resolve to `string | undefined`
  and bridge lands at `coverage` `1`. A slot left with no token at all counts as
  one unknown fallback, listed as `(untyped)`, so it cannot pass as covered.
- **A parameter upstream calls omittable in prose only is declared, not
  inferred.** The `.script_api` format cannot say that a middle parameter may be
  left out with the later ones shifting left, and upstream sometimes describes a
  trailing parameter as optional without marking it `optional: true`. A target
  lists either kind of slot under `omittableSlots` (`element`, `slot`, and the
  upstream `evidence` that allows it), and the emitted declaration carries two
  overloads, with and without it. The api-doc page and the fidelity report stay
  as upstream wrote them. A slot the fixture no longer has fails the emit, so the
  entry cannot go stale.
