---
toc-title: Agent runbooks
agent-entry: 0
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

## Machine-readable output

Every command accepts `--json`. The one-shot commands (`init`, `build`,
`setup-debug`, `defold`) print a single JSON object to stdout, terminated by a
newline; [`watch`](./watch.md) streams newline-delimited JSON (one object per
line):

```sh
bunx @defold-typescript/cli build --json
# {"command":"build","ok":true,"written":["src/main.ts.script", "src/util.lua", ...],"warnings":[]}
```

A failure flips `ok` to `false` and carries an `error` string instead of
`written`. On [`build`](./build.md), `warnings` carries the sourceless-orphan
lines and scene-resource-mismatch lines (empty when there are none). Optional fields (`defoldVersion`,
`defoldChannel`, `apiSurface`, `materializedSurface`, …) appear only when they
apply.

`watch` is long-running, so `--json` streams **newline-delimited JSON (NDJSON)** —
one object per line, one line per event. The full lifecycle reads
`start` → `build` → `rebuild`* → `resolve`* → `stop`:

```sh
bunx @defold-typescript/cli watch --json
# {"command":"watch","event":"start","ok":true,"written":[]}
# {"command":"watch","event":"build","ok":true,"written":[...],"warnings":[]}
# {"command":"watch","event":"rebuild","ok":true,"written":[...],"changed":["src/main.ts"],"removed":[]}
# {"command":"watch","event":"rebuild","ok":false,"error":"..."}
# {"command":"watch","event":"resolve","ok":true,"written":[]}
# {"command":"watch","event":"stop","ok":true,"written":[]}
```

A `resolve` event is emitted whenever a `game.project` save re-resolves the
extension surface (re-materializing `.defold-types/extensions/` from the declared
`[dependencies]` URLs). `start` arrives once, before the initial full build — the
process is up and listening. `stop` arrives once on graceful shutdown. A failed
startup (missing `tsconfig.json`, etc.) emits `start` then exits non-zero with
**no** `stop` line; a rebuild that fails emits an `ok: false` line **to stdout
too**, so a line-reader sees one uninterrupted stream — failures never split off
to stderr. Read each line as it arrives and react per event. Without `--json`,
stdout stays the human `wrote N files: …` output and rebuild errors stay on
stderr.

[`resolve --json`](./resolve.md) reports `materializedSurface` (the written
directory, or `null` when nothing was materialized) and, per extension, the `url`,
generated `namespaces`, `scriptApiCount`, `provenance` (`cache` or `download`),
whether it was `assetOnly`, the `resolvedVersion` (sha256 digest of the resolved
archive bytes), — when the project pins that url — the `pinnedVersion`, and the
`pinStatus` (`unpinned` / `match` / `drift`). A separate `libraries` array reports
each asset-only dependency that matched a [vendored
library](./resolve.md#vendored-library-types) — its `url`, `source` (the vendored
source identity), materialized `modules`, `provenance` (`vendored`), and `verified`.
A `verified: false` entry (with an empty `modules`) is a repo-name match the
downloaded archive did not confirm; it is reported but never materialized:

```jsonc
{
  "command": "resolve",
  "ok": true,
  "written": [],
  "materializedSurface": ".defold-types/extensions",
  "extensions": [
    {
      "url": "https://github.com/defold/extension-iap/archive/main.zip",
      "namespaces": ["iap"],
      "scriptApiCount": 1,
      "provenance": "download",
      "assetOnly": false,
      "resolvedVersion": "sha256:ab12…",
      "pinnedVersion": "sha256:ab12…",
      "pinStatus": "match"
    }
  ],
  "libraries": [
    {
      "url": "https://github.com/paulomrpp/dicebag/archive/main.zip",
      "source": "dicebag",
      "modules": ["dicebag.dicebag"],
      "provenance": "vendored",
      "verified": true
    }
  ]
}
```

A `pinnedVersion` field is only present when the project's `package.json` records
a pin for that `url`. See [Resolve](./resolve.md#pinning-extension-versions) for
what `pinStatus` drives.

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

This pack documents **this toolchain's TypeScript surface**. Defold's own engine
docs are a separate, Lua/C++-first set served at `defold.com/llms-*.txt` — reach
for those (and cross-reference the types) via
[Reach upstream Lua docs and convert](#reach-upstream-lua-docs-and-convert).
Do not confuse the two `llms-full.txt` files: this one is the port; `defold.com`'s
is the engine.

## Helper and codegen scripts (Bun, `/scripts`)

When a task needs a build tool, a codegen pass, or a one-off maintenance script,
do **not** write it into `src/` and do **not** run it with `node`. Two rules
keep such scripts off the game's Lua build path:

- **Location:** put the script in a project-root `/scripts` folder. The Defold
  build selects source by `tsconfig.include` (default `src/**/*.ts`) and ignores
  `exclude`, so any `.ts` under `src/**` is transpiled to Lua and shipped —
  `/scripts` is outside that include, and outside the Defold-pinned main
  `tsconfig.json`.
- **Runner and typing:** run with `bun scripts/foo.ts` (never `node`); `node:*`
  builtins work under Bun and are typed by `@types/bun`. Add a
  `scripts/tsconfig.json` with `"noEmit": true`, `"types": ["bun"]`, and
  `"include": ["**/*.ts"]` — no Defold pin. Script dependencies go in the root
  `package.json` `devDependencies`.

See the [Helper scripts](./helper-scripts.md) guide for the full rationale and a
copy-pasteable config.

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

| Location                                                                        | What it holds                                                                                                                            | When it exists                        |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `.defold-types/<surfaceId>/*.d.ts`                                              | the pinned ambient engine surface (e.g. `.defold-types/defold-1.12.4/`)                                                                  | after `build`; gitignored but on disk |
| `node_modules/@defold-typescript/types/generated/*.d.ts`                        | namespace signatures (`go`, `vmath`, `factory`, …)                                                                                       | always, once installed                |
| `node_modules/@defold-typescript/types/src/`                                    | the three factories (`lifecycle.ts`) and the narrowing guards (`message-guard.d.ts`, `message-dispatch.d.ts`, `window-event-guard.d.ts`) | always, once installed                |
| `node_modules/@defold-typescript/types/api-availability.json`                   | the N-version availability matrix — which symbols exist in which tracked versions (the Combined `## API` in `llms-full.txt` filters against it; `api-signatures.json` alongside holds the matching authoritative declarations) | always, once installed                |
| `node_modules/@defold-typescript/docs/guide/*.md`                               | this guide, refreshed on every install                                                                                                   | always, once installed                |
| `packages/types/generated`, `packages/types/fixtures`, `packages/types/scripts` | generator inputs and outputs — **contributor-only**                                                                                      | only in a clone of this monorepo      |

The pointers the `init-agents` managed block writes are the layered pack:
`node_modules/@defold-typescript/docs/llms.txt` (the map) and
`node_modules/@defold-typescript/docs/llms-full.txt` (the grep corpus), with the
individual `guide/<page>.md` pages and the typed API in
`@defold-typescript/types/generated/*.d.ts` alongside them.

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

Defold serves its whole documentation set as agent-ready text — reach for these
to **locate the mechanic**, never to copy a call signature:

- `https://defold.com/llms-full.txt` — manuals, API reference, and examples combined.
- `https://defold.com/llms-apis.txt` — the C++/Lua/extension API reference alone.
- `https://defold.com/llms-manuals.txt` — the conceptual manuals alone.
- `https://defold.com/llms-examples.txt` — worked examples alone.

These describe the engine's **Lua and C++** surface, not this toolchain's
TypeScript one: argument order, optionality, and even whether a symbol exists can
differ, so treat them as a concept-and-mechanic reference only. Once you know
*what* to call, switch to the generated `.d.ts`
([Confirm a signature](#confirm-a-signature)) for the actual TypeScript
signature you author against; when the two disagree, the `.d.ts` wins. A
namespace in the Lua docs can be absent from TypeScript because it is not a
scriptable runtime module at all — Defold has no `input` namespace, for example;
input arrives through the `on_input` hook, not a polling API.

| Lua idiom                         | TypeScript surface                          |
| --------------------------------- | ------------------------------------------- |
| `function init(self) … end`       | `defineScript({ init() { … } })`            |
| `obj:method(a)`                   | `obj.method(a)` (method form)               |
| `local x, y = f()` (multi-return) | `const [x, y] = f()` / `LuaMultiReturn`     |
| `hash("player")`                  | `hash("player")`, or a pre-hashed `Hash` id |
| `msg.post("#comp", "msg", {})`    | `msg.post("#comp", "msg", {})`              |

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
`self` typing each script kind exposes. On `ok: true` the build envelope adds a
`warnings` array. It lists two kinds of issue, empty when clean, and the build
never fixes either for you:

- **Sourceless outputs** — a generated `.lua`/`.ts.*` left without a TypeScript
  source (a deleted or renamed source), each naming the stale file and the
  source to restore.
- **Scene-resource mismatches** — a `.go`/`.collection` whose `component:`
  points at a mesh source asset (`.gltf`/`.glb`/`.dae`) instead of a `.model`
  component. Bob builds this silently, but the game object fails at runtime, so
  the CLI surfaces at build time what only the editor would otherwise catch.
  Wrap the mesh in a `.model` (with a `materials` block) and point the component
  at the `.model`.

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
{
  "command": "init",
  "ok": true,
  "written": ["tsconfig.json", "src/main.ts", "..."],
  "operations": [
    { "target": "tsconfig.json", "status": "merged" },
    { "target": "src/main.ts", "status": "skipped", "detail": "existing project sources present" }
  ]
}
```

On failure:

```json
{ "command": "init", "ok": false, "error": "<message>" }
```

**Reading `ok`:** if `ok` is `true`, the scaffold succeeded and `written` lists
every file created or modified — use it to know what to open next. If `ok` is
`false`, stop and surface `error`; nothing was scaffolded.

**Reading `operations`:** each entry pairs a `target` with a `status` of
`written` (freshly created), `merged` (an existing `tsconfig.json` was preserved
and refreshed in place), or `skipped` (left untouched, with a `detail` reason —
e.g. your own `src/main.ts` or engine sources already present). Branch on
`status` when you need to distinguish a merge from a clobber.

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
byte-for-byte unchanged. The block is versionless — its pointers resolve to
`node_modules/@defold-typescript/docs/llms.txt` and `llms-full.txt`, which the
install swaps under the same paths — so the verb is safe to re-run any time.

[`init`](./init.md) writes the same contract as part of its scaffold: a fresh
project gets `AGENTS.md` + `CLAUDE.md` created, but a plain re-init leaves an
existing contract untouched. Re-syncing the managed block on a project that
already has one is the `--force` path — `init . --force` (or the standalone
`init-agents` verb) refreshes the block after an upgrade.

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

## Upgrade the toolchain

**Goal:** move the project to the latest `@defold-typescript` toolchain — the
latest CLI, the managed files re-scaffolded from its templates, and the managed
dependencies re-pinned and reinstalled.

**Command (run from the project root):**

```sh
bunx @defold-typescript/cli@latest upgrade --json
```

`update` is a synonym for `upgrade`; both spellings run the same verb, so either
is safe to emit. There is no separate "check for updates" verb — the run resolves
the latest version itself and re-scaffolds in place when it is already current.

The verb replaces the older two-command recipe (`init . --force` followed by an
install). Do not spell that recipe out: the verb decides whether the *running* CLI
is new enough to re-scaffold, and hands off to the newer one when it is not.

**Returns:**

```json
{
  "command": "upgrade",
  "ok": true,
  "written": ["package.json", "tsconfig.json", "..."],
  "from": "0.4.1",
  "to": "0.5.0",
  "handedOff": true
}
```

On failure:

```json
{ "command": "upgrade", "ok": false, "error": "<message>" }
```

**Reading `ok`:** if `ok` is `true`, the upgrade landed — `written` lists the
managed files the re-scaffold touched, `from` and `to` are the running and the
resolved-latest CLI versions, and `handedOff` says whether a newer CLI performed
the re-scaffold (`false` means the running CLI was already the latest and
re-scaffolded in place; `from` and `to` are then equal). If `ok` is `false`, stop
and surface `error`.

**The offline failure mode:** upgrading is the one command that needs the network.
When the npm registry is unreachable the run fails — `ok` is `false` with a
non-zero exit — instead of re-scaffolding against the version already on disk.
Read the failure; never treat it as a silent no-op that succeeded.

**What it never touches:** your own scripts. An entry file you authored
(`src/main.ts`) is reported as `skipped`, not overwritten. See
[Upgrading the toolchain](./upgrading.md) for what the re-scaffold refreshes and
what it does to an existing `defold-target` pin.

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
  "written": [],
  "materializedSurface": ".defold-types/extensions",
  "extensions": [
    {
      "url": "<archive url>",
      "provenance": "<cache | download>",
      "namespaces": ["<namespace>"],
      "scriptApiCount": 1,
      "assetOnly": false,
      "resolvedVersion": "<version>",
      "pinStatus": "<unpinned | match | drift>"
    }
  ]
}
```

On failure:

```json
{ "command": "resolve", "ok": false, "error": "<message>" }
```

**Reading `ok`:** if `ok` is `true`, the extension surface is current —
`materializedSurface` is the regenerated surface directory
(`.defold-types/extensions`), and `extensions` records where each dependency
came from (`provenance`), how many `.script_api` files it contributed
(`scriptApiCount`; an `assetOnly` dependency contributes no types), and its pin
state (`resolvedVersion`/`pinStatus`). The `written` array is always empty for
`resolve`. If `ok` is `false`, surface `error`; the existing surface is left
untouched.

## Add a script

**Goal:** add a new gameplay script to a TypeScript Defold project and attach it
so it runs. There is no `add` verb — the workflow composes ordinary file
creation with the shipped `build` verb, then a scene-file edit to wire the
compiled component.

**1. Write the source.** One Defold script per file under `src/`, exporting a
single lifecycle factory as `default` (never two in one file). The factory
decides the compiled kind:

| Source factory       | Compiled artifact         | Referenced by                                                  |
| -------------------- | ------------------------- | -------------------------------------------------------------- |
| `defineScript`       | `<name>.ts.script`        | a game object (`.go` / `.collection`) as a component           |
| `defineGuiScript`    | `<name>.ts.gui_script`    | a GUI scene (`.gui`), as its **Script** property               |
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
built against; `defoldChannel` and `defoldSha` record the resolved release
channel and head sha (both `null` for a fixed-version target, set when a channel
target like `beta` is pinned or passed via `--defold-target`). If `ok` is
`false`, the build failed — surface `error` and follow
[Fix the Lua output](#fix-the-lua-output).

**What `build` writes.** Each `.ts` source under `src/` produces exactly one
output in the Defold project tree — a script component or a `<name>.lua` module,
per the table above. `import` is rewritten to `require("<module>")` resolving
against the emitted `.lua`, so a shared module must be built for its require to
resolve at runtime. Two runtime modules are synthesized at the output root on
demand: `lualib_bundle.lua` (when a source uses a TS runtime helper like
`Object.keys` or spread) and `defold_typescript_timers.lua` (when timers are
used).

Who creates these: [TypeScriptToLua](https://typescripttolua.github.io/) (TSTL)
produces the Lua *content* in memory; the CLI writes the *files*, choosing the
`.ts.script` / `.ts.gui_script` / `.ts.render_script` / `.lua` name and location.
TSTL never touches disk — that is why the outputs carry Defold-correct extensions
instead of plain `.lua`. Treat the `--json` `written` array as the authoritative
list of what landed; do not infer paths.

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
[`game/player.collection`](https://github.com/defold-typescript/toolchain/blob/main/docs/examples/platformer/game/player.collection):

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
lives in [Typed messages](./messages.md#receiving-messages-with-type-narrowing)
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

## Drive the engine build

**Goal:** once the TypeScript surface transpiles clean, run the actual Defold
engine build headlessly — resolve native dependencies, compile the project, or
produce a platform bundle — without opening the editor. This is the autonomous
phase *after* the [type](#verify-against-the-real-api-surface) and
[transpile](#fix-the-lua-output) loop: the `.ts` sources are already emitted as
Defold artifacts, and now [bob](https://defold.com/manuals/bob/) (the engine's
command-line builder) turns the project tree into engine output.

**Commands (run from the project root):**

```sh
bunx @defold-typescript/cli bob status --json    # dry-run: report the resolved target/jar/Java
bunx @defold-typescript/cli bob resolve --json   # fetch native extension deps
bunx @defold-typescript/cli bob build --json     # compile to build/default
bunx @defold-typescript/cli bob bundle --json     # produce a platform bundle
bunx @defold-typescript/cli bob run --json       # debug build, then launch the game
```

Each `bob <sub>` verb shells out to bob and, under `--json`, keeps stdout to
**exactly one JSON object** — bob's own chatter is captured, not streamed, so a
line-reader can `JSON.parse` stdout deterministically. The envelope is:

```json
{ "command": "bob", "subcommand": "build", "ok": true, "exitCode": 0, "defoldVersion": "1.12.4", "defoldChannel": null, "defoldSha": "402218d…", "output": "<bob tail>" }
```

On a non-zero bob exit:

```json
{ "command": "bob", "subcommand": "build", "ok": false, "exitCode": 17, "error": "bob build exited with code 17", "defoldVersion": "1.12.4", "defoldChannel": null, "defoldSha": "402218d…", "output": "<bob tail>" }
```

`output` is a trimmed tail of bob's combined stdout/stderr, present for
diagnostics on both outcomes. Without `--json`, bob's output streams live to the
terminal instead and no JSON is written.

**Target-driven artifact:** bob downloads the `bob.jar` that matches the resolved
`--defold-target`, not a fixed stable head — a pinned version resolves to that
version's artifact SHA, a channel (`stable`/`beta`/`alpha`) resolves to the
channel head by SHA. Under `--json` the envelope reports the resolved
`defoldVersion`, `defoldChannel` (null for a pinned version), and `defoldSha`, so
a caller can confirm exactly which engine build bob ran against.

**Reading `ok` / `exitCode`:** branch on `ok` first — `true` means bob succeeded
and the CLI's exit code is `0`. On `ok: false`, the CLI exit code **is** bob's
own `exitCode` (not a flat `1`), so a caller can distinguish bob failures by
code; read `output` for the tail of what bob printed and `error` for the summary.

**Pre-flight with `bob status`:** `bob status` is a read-only dry-run — it
resolves the `--defold-target` and reports the selected version/channel/SHA, the
sha-keyed `bob.jar` path and whether it is cached, and the resolved Java runtime,
**without downloading the jar or running bob**. It is fully offline for a pinned
version and touches the network only to resolve a moving channel's head; an
offline channel resolution exits non-zero with an actionable `error`. A missing
Java runtime is reported (`java: null`), not fatal. Use it to confirm
preconditions before a `resolve`/`build`:

```json
{ "command": "bob", "subcommand": "status", "ok": true, "defoldVersion": "1.12.4", "defoldChannel": null, "defoldSha": "402218d…", "bobJar": { "path": "~/.cache/defold-typescript/bob/402218d…/bob.jar", "cached": true }, "java": "java" }
```

**Preconditions — now satisfied autonomously:** two setup steps that used to
require a human are handled for you. bob needs a Java runtime, and `bob`
resolves one in order (`--java`/`DEFOLD_JAVA` override → `java` on `PATH` → the
installed editor's bundled JDK), so a machine with only the Defold editor
installed builds with no separate JDK. bob itself (`bob.jar`) is auto-downloaded
to the cache on first use and reused thereafter. The one precondition still
required is **network egress**: the first `bob resolve`/`build` fetches
`bob.jar` and any native extension archives, so an air-gapped run fails until the
cache is warmed.

**Composite build+launch with `bob run`:** `bob run` is the one convenience verb
that combines steps — Bob has no native run, so the CLI composes it: download the
target-matched `bob.jar`, debug-build into `build/default`, ensure a
target-matched engine (the native-extension `build/<platform>/dmengine` when the
build produced one, else the stock engine fetched by the resolved SHA into a
sibling engine cache next to the jar cache and recorded so a later `run` reuses
it), then launch. bob, the typings, and the running engine all share the one
resolved SHA. `--java`/`--build-server` thread into the build as for `bob build`;
a cache hit skips the engine download; an offline download reports an actionable
`error`. A failed build **short-circuits with Bob's exit code and never
launches** — the CLI exit code is that build code. Because a live game cannot be
captured, its output streams to the terminal even under `--json`; the composite
envelope prints on exit:

```json
{ "command": "bob", "subcommand": "run", "ok": true, "build": { "exitCode": 0 }, "launch": { "enginePath": "build/arm64-macos/dmengine", "exitCode": 0 } }
```

**Launch an existing build with `run`:** once `build/default` holds a compiled
project, the top-level `run` command launches it directly — **no transpile, no
Bob, no engine download, no Java**. It reuses the native-extension build engine
(`build/<platform>/dmengine`) when present, otherwise the stock engine a prior
`bob run` cached; when neither the compiled project nor an engine is found it
errors and names the `bob build` / `bob run` that would produce them.

```sh
bunx @defold-typescript/cli run --json           # launch build/default
bunx @defold-typescript/cli run -- --windowed    # engine args pass through after --
```

The engine's exit code becomes the command's exit code, and `Ctrl-C`
(SIGINT/SIGTERM) forwards to the engine for a clean shutdown. Unlike `bob`,
**`run` streams the game live even under `--json`** — a running game is not
capturable — and prints one envelope on exit:

```json
{ "command": "run", "ok": true, "enginePath": "build/arm64-macos/dmengine", "projectc": "build/default/game.projectc", "exitCode": 0 }
```

On a missing build or engine, `run --json` emits `{ "command": "run", "ok":
false, "error": "…" }` and exits `1`.

## Combine components on a game object

**Goal:** put several components — scripts, a sprite, a collision object — on one
game object and let them cooperate.

One `.go` (or an `embedded_instances` block inside a `.collection`) lists each
component under its own `id`. A script reaches a *sibling* component on the same
object by that `#`-prefixed id — no path is needed because they share the object.
The platformer's [`game/player.collection`](https://github.com/defold-typescript/toolchain/blob/main/docs/examples/platformer/game/player.collection)
embeds the player script next to its sprite and collision object exactly this
way; the [Add a script](#add-a-script) runbook shows the `embedded_instances`
form to write when editing the scene file directly.

```ts
import { defineScript } from "@defold-typescript/types";

export default defineScript({
  on_input(self, action_id) {
    if (action_id == hash("jump")) {
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

## Address an object by URL

**Goal:** pick the right URL form for every `msg.post` / `go.get` / `go.set` /
`msg.url` call, and know when the `socket:` prefix is required.

A Defold URL is `[socket:][path][#fragment]` — the first part is optional. Inside
a single world (everything in your bootstrap collection) address by relative id,
absolute path, or sibling component, with **no** `socket:`:

- `"camera"` — a sibling instance by id, resolved relative to the current component.
- `"/camera"` — the same instance by id, absolute from the current world's root.
- `"#health"` — a sibling component on the *same* game object.
- `"/enemy#ai"` — a named component on a different object in the same world.

The `socket:` segment is reserved for crossing into a **collection-proxy-loaded
world**: `msg.post("level_a:/door#sensor", "open")` reaches `door#sensor` in the
collection whose `Name` property is `level_a`. That value is the *target*
collection's `Name`, not the proxy component's id — and a collection's `Name` is
a field distinct from its folder, so a bare `"main:…"` copied from a Lua example
is fragile (it assumes your bootstrap collection happens to be named `main`).

The two-arg `msg.url(socket, path, fragment)` call is a runtime error — only
`msg.url()`, `msg.url(urlstring)`, and the all-required three-arg form are
supported. The tightened overloads in `msg-overloads.d.ts` reject the two-arg
form at compile time, so the typings are the warning.

Confirm every address resolves and the snippet builds — see
[Verify against the real API surface](#verify-against-the-real-api-surface). For
the full address grammar and the cross-world proxy case, follow up with the
[TypeScript gotchas URL addressing entry](./typescript-gotchas.md#url-addressing-same-world-objects-are-relative-socket-crosses-worlds).

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
