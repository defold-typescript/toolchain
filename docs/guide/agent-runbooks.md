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

**Goal:** add a new gameplay script to a TypeScript Defold project. There is no
`add` verb — the workflow composes ordinary file creation with the shipped
`build` verb.

**Command (from the project root, after writing the `.ts` file under `src/`):**

```sh
bunx @defold-typescript/cli@latest build --json
```

Write the source first — one Defold script per file, exporting a single
lifecycle factory (`defineScript` / `defineGuiScript` / `defineRenderScript`) as
`default`. Which hooks the file should export (`init`, `update`, `fixed_update`,
`on_message`, `on_input`, `final`, …) and how `self` is typed are covered in
[Script lifecycle](./script-lifecycle.md). Then build — or, if a
[`watch --json`](#fix-the-lua-output) is already running, just save the file and
read its `rebuild` event instead of invoking `build`.

**Returns** the one-shot envelope keyed `command: "build"`, plus the build
context fields:

```json
{
  "command": "build",
  "ok": true,
  "written": ["build/<script>.lua", "..."],
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

**Reading `ok`:** if `ok` is `true`, the script transpiled — read `written` for
the emitted `.lua` path to add as a `.script` component in the editor;
`defoldVersion` and `apiSurface` record which API surface it was built against;
`defoldChannel` records the resolved release channel (`stable` unless pinned or
passed via `--channel`; it does not yet change which surface is fetched).
If `ok` is `false`, the build failed — surface `error` and follow
[Fix the Lua output](#fix-the-lua-output).

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
