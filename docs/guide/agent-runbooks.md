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

## Scaffold a project

**Goal:** create a new TypeScript surface — either a fresh project, or the
TypeScript layer added to an existing Defold project.

**Command (fresh project, empty folder):**

```sh
bunx @defold-typescript/cli@latest init --json
```

**Command (existing Defold project — run inside the folder that holds
`game.project`):**

```sh
bunx @defold-typescript/cli@latest init --json
```

`init` detects whether a `game.project` is already present and either scaffolds a
whole new project or adds the TypeScript surface alongside the existing one.

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
bunx @defold-typescript/cli@latest init-agents --json
```

This writes two files. `AGENTS.md` carries a managed block delimited by HTML
comment markers; `CLAUDE.md` is the single line `@AGENTS.md`, re-exporting it.
Only the content **between** the markers is ever rewritten, so any notes you add
above or below the block survive re-runs untouched. If `AGENTS.md` already exists
without the markers, the block is appended after one blank line and your prior
content is left intact; a `CLAUDE.md` that already equals `@AGENTS.md` is left
byte-for-byte unchanged. The block is versionless — its guide pointer resolves to
`node_modules/@defold-typescript/cli/docs/guide/README.md`, which the install
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
defold-typescript resolve --json
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
bunx @defold-typescript/cli@latest build --json
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
bunx @defold-typescript/cli@latest build --json
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
