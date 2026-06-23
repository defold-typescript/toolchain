---
toc-title: Agent runbooks
---
# Agent runbooks

Harness-neutral procedures for driving `defold-typescript` from an automated
agent. `defold-typescript` is a CLI published to npm (run with `bunx`) plus a
types package; it ships no
harness-specific skill or command assets, so the durable interface for an agent
is the CLI verbs themselves and their machine-readable `--json` output. Every
runbook below works from any harness: run the command, read the JSON envelope on
stdout, gate on `ok`.

Each one-shot command (`init`, `build`, `resolve`) prints a single JSON object
when given `--json`. The envelope is always one of two shapes:

```json
{ "command": "<verb>", "ok": true, "written": ["<path>", "..."] }
```

```json
{ "command": "<verb>", "ok": false, "error": "<message>" }
```

The agent branches on `ok`: on `true`, read `written` for the paths the command
created or updated; on `false`, read `error` for the failure reason. Some verbs
add fields to the success envelope (noted per runbook), but `command`, `ok`, and
either `written` or `error` are always present.

## Offline knowledge pack

`@defold-typescript/docs` ships two generated, never-hand-edited files at
`node_modules/@defold-typescript/docs/`:

- `llms.txt` — a curated index (per [llmstxt.org](https://llmstxt.org/)): one
  link per guide page and per API namespace.
- `llms-full.txt` — the whole guide inlined plus a compact
  `namespace.function(signature)` index of the entire API surface.

`llms-full.txt` is self-contained: an agent in a consumer project that has only
`node_modules` and the in-project source can read every mechanic and signature
from this one file — no network, no monorepo checkout. The docs site serves the
same pair at `/llms.txt` and `/llms-full.txt`. Both are regenerated from the
guide and the typed API on every docs build and drift-gated, so they never go
stale against the shipped types.

## Verify against the real API surface

This section governs every runbook below it. Before answering any "how do I…"
question about a Defold symbol, **confirm the symbol against the installed
surface** — that it exists, its namespace, and its exact signature. An agent's
default instinct is wrong here: the Lua-first manuals at defold.com and the
`ts-defold` (`@ts-defold/types`) lore baked into training both describe surfaces
that **diverge** from this toolchain's. Never emit a signature from training,
from `ts-defold`, or from a raw Lua doc without first checking it exists in the
materialized `.defold-types/` surface or the installed `@defold-typescript/types`
package. When recollection and the on-disk surface disagree, the surface wins.

### Where the truth lives (reachable-surface map)

In a consumer project an agent can read only these; everything else (the
generation pipeline, fixtures, monorepo planning docs) is contributor-only and
absent from an install:

| Location | What it holds | When it exists |
| -------- | ------------- | -------------- |
| `.defold-types/<surfaceId>/*.d.ts` | the pinned ambient engine surface (e.g. `.defold-types/defold-1.12.4/`) | after `build`; gitignored but on disk |
| `node_modules/@defold-typescript/types/generated/*.d.ts` | namespace signatures (`go`, `vmath`, `factory`, …) | always, once installed |
| `node_modules/@defold-typescript/types/src/` | the three factories (`lifecycle.ts`) and the narrowing guards (`message-guard.d.ts`, `message-dispatch.d.ts`, `window-event-guard.d.ts`) | always, once installed |
| `node_modules/@defold-typescript/docs/guide/*.md` | this guide, refreshed on every install | always, once installed |
| `packages/types/generated`, `packages/types/fixtures`, `packages/types/scripts` | generator inputs and outputs — **contributor-only** | only in a clone of this monorepo |

The installed-guide pointer is the one the `init-agents` managed block writes:
`node_modules/@defold-typescript/docs/guide/README.md`.

### Confirm a signature

Read the signature from the namespace declaration instead of recalling it. Grep
the generated `.d.ts` for the function:

```sh
grep -rn "function create" node_modules/@defold-typescript/types/generated/
```

Quote what the surface declares as authoritative — for `factory.create` it is
`factory.create(url, position?, rotation?, properties?, scale?): Hash`. If the
grep returns nothing, the symbol does not exist on this surface; do not invent
it.

### Reach upstream Lua docs and convert

Defold's own manuals and API reference are Lua-first. When the mechanic you need
is only documented there, run the conversion loop: **locate the mechanic** in
the Lua docs -> **find its namespace** in the generated `.d.ts` -> **confirm the
signature** as above -> **translate the idioms** to the TypeScript surface.

| Lua idiom | TypeScript surface |
| --------- | ------------------ |
| `function init(self) … end` | `defineScript({ init() { … } })` |
| `obj:method(a)` | `obj.method(a)` (method form) |
| `local x, y = f()` (multi-return) | `const [x, y] = f()` / `LuaMultiReturn` |
| `hash("player")` | `hash("player")`, or a pre-hashed `Hash` id |
| `msg.post("#comp", "msg", {})` | `msg.post("#comp", "msg", {})` |

### Fetch upstream on demand (gitignored, not a submodule)

When you need the engine's own API data or source, pull it on demand into a
gitignored path — **do not add a `defold/defold` git submodule**. A submodule is
a multi-GB tree pinned to one engine SHA that every clone then carries; the API
data you actually need is the few-hundred-KB `ref-doc.zip` the type generator
already consumes, cached at `~/.cache/defold-typescript/ref-doc/<version>/`
(`DEFOLD_TYPESCRIPT_CACHE` overrides the cache root). Read the cached
`ref-doc.zip` there, or for the rare source-reading case shallow-clone
`defold/defold` into a gitignored dir. This is a cached download, **not a
submodule** — the on-demand fetch keeps the repo small.

### The verification loop

Once converted, prove it compiles before handing it back: write the snippet, run
`build --json`, and on `ok: false` read the `error` span, fix the source, and
rebuild. This is the same loop as [Fix the Lua output](#fix-the-lua-output); the
[script lifecycle](./script-lifecycle.md) page covers which hooks and which
`self` typing each script kind exposes.

## Scaffold a project

**Goal:** create a new TypeScript surface — either a fresh project, or the
TypeScript layer added to an existing Defold project.

**Command (fresh project, new folder):**

```sh
bunx @defold-typescript/cli@latest init my-game --json
```

**Command (existing Defold project — run inside the folder that holds
`game.project`):**

```sh
bunx @defold-typescript/cli@latest init . --json
```

`init` requires an explicit destination folder — pass a path to create it, or `.`
for the current folder. There is no implicit current-folder default, so an
invocation with no path fails fast (`ok: false`) rather than scaffolding into the
working directory by accident. `init` then detects whether a `game.project` is
already present at the destination and either scaffolds a whole new project or
adds the TypeScript surface alongside the existing one.

**Returns:**

```json
{ "command": "init", "ok": true, "written": ["tsconfig.json", "src/main.ts", "..."] }
```

On failure:

```json
{ "command": "init", "ok": false, "error": "<message>" }
```

**Reading `ok`:** if `ok` is `true`, the scaffold succeeded and `written` lists
every file created or modified — use it to know what to open next. If `ok` is
`false`, stop and surface `error`; nothing was scaffolded.

## Install the agent contract

**Goal:** drop an agent contract at the project root so any harness (or human)
opening the repo finds the conventions and a pointer to the installed guide.

**Command:**

```sh
bunx @defold-typescript/cli@latest init-agents . --json
```

Like `init`, `init-agents` requires an explicit destination — pass a path or `.`
for the current folder; a missing path fails fast (`ok: false`). This writes two files. `AGENTS.md` carries a managed block delimited by HTML
comment markers; `CLAUDE.md` is the single line `@AGENTS.md`, re-exporting it.
Only the content **between** the markers is ever rewritten, so any notes you add
above or below the block survive re-runs untouched. If `AGENTS.md` already exists
without the markers, the block is appended after one blank line and your prior
content is left intact; a `CLAUDE.md` that already equals `@AGENTS.md` is left
byte-for-byte unchanged. The block is versionless — its guide pointer resolves to
`node_modules/@defold-typescript/docs/guide/README.md`, which the install
swaps under the same path — so the verb is safe to re-run any time.

**Returns:**

```json
{ "command": "init-agents", "ok": true, "written": ["AGENTS.md", "CLAUDE.md"] }
```

On failure:

```json
{ "command": "init-agents", "ok": false, "error": "<message>" }
```

**Reading `ok`:** if `ok` is `true`, `written` lists the files touched in order;
a re-run that changes nothing omits the untouched file. If `ok` is `false`, stop
and surface `error`; nothing was written.

## Regenerate extension types

**Goal:** refresh the ambient TypeScript surface for native extensions after a
`game.project` `[dependencies]` change, so extension namespaces stay in sync with
the declared archives. This automates the workflow described in
[Typing native extensions](./extensions.md).

**Command (run from the project root, after editing `[dependencies]`):**

```sh
bunx @defold-typescript/cli resolve --json
```

`resolve` reads each declared extension's `.script_api`, regenerates the
gitignored `.defold-types/extensions/` ambient surface, and rewrites its index
and `package.json` to exactly the declared set.

**Returns** the same one-shot envelope keyed `command: "resolve"`, plus an
`extensions` array reporting provenance for each resolved dependency:

```json
{
  "command": "resolve",
  "ok": true,
  "written": [".defold-types/extensions/<namespace>.d.ts", "..."],
  "extensions": [
    {
      "url": "<archive url>",
      "provenance": "<cache | download>",
      "namespaces": ["<namespace>"],
      "scriptApiCount": 1,
      "assetOnly": false
    }
  ]
}
```

On failure:

```json
{ "command": "resolve", "ok": false, "error": "<message>" }
```

**Reading `ok`:** if `ok` is `true`, the extension surface is current — `written`
lists the regenerated declaration files, and `extensions` records where each one
came from (`provenance`) and how many `.script_api` files it contributed
(`scriptApiCount`); an `assetOnly` dependency contributes no types. If `ok` is
`false`, surface `error`; the existing surface is left untouched.

## Add a script

**Goal:** add a new gameplay script to a TypeScript Defold project and attach it
so it runs. There is no `add` verb — the workflow composes ordinary file
creation with the shipped `build` verb, then a scene-file edit to wire the
compiled component.

**1. Write the source.** One Defold script per file under `src/`, exporting a
single lifecycle factory as `default` (never two in one file). The factory
decides the compiled kind:

| Source factory | Compiled artifact | Referenced by |
| -------------- | ----------------- | ------------- |
| `defineScript` | `<name>.ts.script` | a game object (`.go` / `.collection`) as a component |
| `defineGuiScript` | `<name>.ts.gui_script` | a GUI scene (`.gui`), as its **Script** property |
| `defineRenderScript` | `<name>.ts.render_script` | the render pipeline (a `.render` file, set via `game.project`) |

A source that calls no factory emits a plain `<name>.lua` module to `import`
instead. Which hooks to export (`init`, `update`, `fixed_update`, `on_message`,
`on_input`, `final`, …) and how `self` is typed are covered in
[Script lifecycle](./script-lifecycle.md).

**2. Build** (from the project root):

```sh
bunx @defold-typescript/cli build --json
```

Or, if a [`watch --json`](#fix-the-lua-output) is already running, just save the
file and read its `rebuild` event instead of invoking `build`.

**Returns** the one-shot envelope keyed `command: "build"`, plus the build
context fields:

```json
{
  "command": "build",
  "ok": true,
  "written": ["src/<name>.ts.script", "..."],
  "defoldVersion": "<version>",
  "defoldChannel": "<stable | beta | alpha>",
  "apiSurface": "<surface id>",
  "materializedSurface": "<path | null>"
}
```

On failure:

```json
{ "command": "build", "ok": false, "error": "<message>" }
```

**Reading `ok`:** if `ok` is `true`, the script transpiled — `written` lists the
emitted artifact (`.ts.script`, `.ts.gui_script`, or `.ts.render_script`) to
attach next; `defoldVersion` and `apiSurface` record which API surface it was
built against; `defoldChannel` records the resolved release channel (`stable`
unless pinned or passed via `--channel`; it does not yet change which surface is
fetched). If `ok` is `false`, the build failed — surface `error` and follow
[Fix the Lua output](#fix-the-lua-output).

**What `build` writes.** Each `.ts` source under `src/` produces exactly one
output in the Defold project tree — a script component or a `<name>.lua` module,
per the table above. `import` is rewritten to `require("<module>")` resolving
against the emitted `.lua`, so a shared module must be built for its require to
resolve at runtime. Two runtime modules are synthesized at the output root on
demand: `lualib_bundle.lua` (when a source uses a TS runtime helper like
`Object.keys` or spread) and `defold_typescript_timers.lua` (when timers are
used).

Who creates these: typescript-to-lua (TSTL) produces the Lua *content* in
memory; the CLI writes the *files*, choosing the `.ts.script` / `.ts.gui_script`
/ `.ts.render_script` / `.lua` name and location. TSTL never touches disk — that
is why the outputs carry Defold-correct extensions instead of plain `.lua`.
Treat the `--json` `written` array as the authoritative list of what landed; do
not infer paths.

**3. Attach the compiled script.** Building only produces the artifact; nothing
runs until a scene references it as a component. Scene files (`.go`,
`.collection`, `.gui`, `.render`) reference the **compiled** artifact, never the
`.ts` source. A game object references a `.ts.script` through a `components { … }`
entry naming its project-root-absolute path:

```
components {
  id: "player"
  component: "/src/player.ts.script"
}
```

In a standalone `.go` the block appears verbatim. When the game object is
embedded in a `.collection`, Defold stores the same block as an escaped string
inside an `embedded_instances { data: "…" }` entry — the form to write when
editing the file directly. The platformer example shows this in
[`game/player.collection`](../examples/platformer/game/player.collection):

```
embedded_instances {
  id: "player"
  data: "components {\n"
  "  id: \"player\"\n"
  "  component: \"/src/player.ts.script\"\n"
  ...
  "}\n"
  ...
}
```

A `.ts.gui_script` is referenced by a `.gui` scene's **Script** property and a
`.ts.render_script` by the render pipeline, the same compiled-artifact rule.

**4. Verify the attachment.** Two checks confirm the script is wired in:

- Grep the scene files for the compiled name:

  ```sh
  grep -rl "player.ts.script" --include="*.go" --include="*.collection" --include="*.gui" .
  ```

  A hit means a scene references it; no hit means it is orphaned and will not
  run.

- Defold compiles only **reachable** resources, so after a Defold build
  (the CLI's `defold build` subcommand) an attached script produces `build/default/src/player.ts.scriptc`
  — the path mirrors the source — while an orphaned script never appears under
  `build/default/` at all. (The `_generated_*` artifacts there are inlined or
  asset-derived resources — embedded game objects, components, textures — never
  referenced script files, which keep their source path.)

## Narrow engine callback payloads

**Goal:** type an engine callback's untyped payload without hand-rolling `typeof`/`in`/`as`.

**Rule for clankers:** when an engine callback hands back an untyped or `unknown`
payload that is discriminated by a *separate* id/event argument, reach for the
**provided declaration-only guard** before reaching for `typeof`/`in`/`as`.
TypeScript cannot correlate two independent parameters, and Defold's ids/event
constants are pre-hashed `Hash` values or branded numbers — neither works as a
discriminated-union tag. Each guard below re-introduces the discriminant at the
use site. They are all **declaration-only**: the transpiler lowers each call to
its runtime comparison, so there is no runtime Lua symbol and **no import to
add**.

`on_message` — narrow one message with `isMessage`, or route many with `onMessage`:

```ts
export default defineScript({
  on_message(self, message_id, message) {
    if (isMessage(message_id, message, "contact_point_response")) {
      // message narrowed to the contact_point_response payload — no cast.
      print(message.distance);
    }
  },
});
```

`window.set_listener` — narrow the callback's `data` with `isWindowEvent`:

```ts
window.set_listener((self, event, data) => {
  if (isWindowEvent(event, data, window.WINDOW_EVENT_RESIZED)) {
    // data narrowed to { width: number; height: number } — no cast.
    print(data.width, data.height);
  }
});
```

An unknown id/event constant is a compile error, so the guard also catches typos.
The full narrowing reference, including `onMessage`'s multi-message dispatcher,
lives in [Script lifecycle](./script-lifecycle.md#receiving-messages-with-type-narrowing)
and the [`window.set_listener` gotcha](./typescript-gotchas.md#windowset_listener-hands-event-and-data-as-separate-params).

## Fix the Lua output

**Goal:** recover from a transpile failure reported by `build` or `watch`.

**Command (re-run after each source fix):**

```sh
bunx @defold-typescript/cli build --json
```

On a transpile failure the one-shot `build --json` envelope carries the message:

```json
{ "command": "build", "ok": false, "error": "<message>" }
```

Under a long-lived `watch --json`, the same failure arrives as an NDJSON event on
stdout (one JSON object per line) keyed `command: "watch"`:

```json
{ "command": "watch", "event": "rebuild", "ok": false, "error": "<message>" }
```

The first build emits `event: "build"`; each later rebuild emits
`event: "rebuild"`. `build` and the transpile-diagnostics pass share one
diagnostic run, so the `error` names the offending source span.

**Reading `ok`:** while `ok` is `false`, read `error` for the failing span,
then fix the source and rebuild. Two pages route the fix:
[TypeScript gotchas](./typescript-gotchas.md) for the runtime-semantics traps
that compile clean but surprise under Lua, and
[Transpile diagnostics](./transpile-diagnostics.md) for what the diagnostic pass
surfaces. Repeat until `ok` is `true`, then read `written` as in
[Add a script](#add-a-script).

## Combine components on a game object

**Goal:** put several components — scripts, a sprite, a collision object — on one
game object and let them cooperate.

One `.go` (or an `embedded_instances` block inside a `.collection`) lists each
component under its own `id`. A script reaches a *sibling* component on the same
object by that `#`-prefixed id — no path is needed because they share the object.
The platformer's [`game/player.collection`](../examples/platformer/game/player.collection)
embeds the player script next to its sprite and collision object exactly this
way; the [Add a script](#add-a-script) runbook shows the `embedded_instances`
form to write when editing the scene file directly.

```ts
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  on_input(self, action_id) {
    if (action_id === hash("jump")) {
      // "#" addresses a sibling component on this same game object.
      msg.post("#animator", "play_animation", { id: hash("jump") });
    }
  },
});
```

Confirm each id names a real component and the snippet builds — see
[Verify against the real API surface](#verify-against-the-real-api-surface).

## Spawn objects with a factory

**Goal:** create new game objects at runtime from a prototype.

Add a `.factory` component to a game object and point it at the prototype `.go`.
At runtime, `factory.create(url, position?, rotation?, properties?, scale?)`
returns the spawned object's id as a `Hash`. The fourth argument, `properties`,
seeds the new script's `self` before its `init` runs, so each spawned instance
can start with its own state.

```ts
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init() {
    // properties (4th arg) seed the spawned script's self before its init runs.
    const enemy = factory.create("#enemyfactory", undefined, undefined, {
      health: 100,
    });
    return { lastSpawned: enemy };
  },
});
```

Confirm `factory.create` against
`node_modules/@defold-typescript/types/generated/factory.d.ts` and build the
snippet — see [Verify against the real API surface](#verify-against-the-real-api-surface).

## Spawn a hierarchy with a collection factory

**Goal:** spawn a whole tree of game objects in one call.

A `.collectionfactory` component points at a `.collection`. Unlike `factory`,
`collectionfactory.create(url, position?, rotation?, properties?, scale?)` returns
a `LuaMap<Hash, Hash>` mapping each prototype id in the collection to the runtime
id it was spawned as. Read one spawned object out of the map with
`.get(prototypeId)`, keyed by the `/`-prefixed path the collection gives it.

```ts
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  init() {
    const ids = collectionfactory.create("#levelfactory");
    // Read one spawned object out of the map by its prototype id.
    const player = ids.get(hash("/player"));
    return { player };
  },
});
```

Confirm `collectionfactory.create` against
`node_modules/@defold-typescript/types/generated/collectionfactory.d.ts` and build
the snippet — see [Verify against the real API surface](#verify-against-the-real-api-surface).

## Pass messages between components

**Goal:** send a message from one component to another and receive it typed.

`msg.post(receiver, message_id, message?)` addresses the receiver by a URL
string. Two forms cover most cases: `"#component"` reaches a sibling component on
the *same* game object, and `"/object#component"` reaches a named component on a
*different* object. The receiver handles it in `on_message`; to narrow the
untyped payload by `message_id` without `typeof`/`as`, reuse the guard from
[Narrow engine callback payloads](#narrow-engine-callback-payloads) rather than
re-deriving it here.

```ts
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  update(self) {
    // "#…" → sibling on this object; "/path#…" → a component on another object.
    msg.post("#health", "damage", { amount: 10 });
    msg.post("/enemy#ai", "alert");
  },
});
```

Confirm each address resolves and the snippet builds — see
[Verify against the real API surface](#verify-against-the-real-api-surface).

## Where script state lives

**Goal:** decide whether a piece of mutable state belongs on `self` or in a
module.

Per-instance state belongs on the typed `self`: `init`'s returned object is
copied onto `self` for *that* component instance, so two objects running the same
script keep independent values. A module-level `let`/`const` behaves differently,
and the build shows how — this source:

```ts
import { defineScript } from "@defold-typescript/types";

// Module-level: one value, not per-instance.
let spawnCount = 0;

export default defineScript({
  init() {
    // Per-instance: copied onto this component's self.
    return { health: 100 };
  },
  update(self) {
    self.health -= 1;
    spawnCount += 1;
  },
});
```

compiles `spawnCount` to a single Lua **module local** evaluated once, while
`health` is assigned onto each instance's `self`:

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

Because Defold loads each module once via `require` and caches it, that module
local is **shared by every component instance that requires the module** — it is
not per-instance state. Reach for a module local only for constants or a
deliberately-shared singleton; keep anything each instance must own its own copy
of on `self`. The full `self` typing model — how `init` infers it and how
`properties` seed it — is in [Script lifecycle](./script-lifecycle.md).

Above a module local sits one wider tier: a **VM-global** declared with `declare
global`. The declaration emits no Lua; a use site lowers to a bare Lua global
shared across the entire VM — no `require`, no module scope:

```lua
function ____exports.bump()
    FOO = FOO + 1
    return FOO
end
```

No `local FOO` and no `____exports.` prefix — `FOO` is raw VM-wide state, broader
than a cached module local. Reach for it only for genuine engine/Lua globals;
prefer a module singleton for app state. The full four-tier treatment — per-instance
`self`, shared module local, cross-script module singleton, and VM-global — is in
[Where script state lives](./script-state.md).
