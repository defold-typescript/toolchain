# Agent runbooks

Harness-neutral procedures for driving `defold-typescript` from an automated
agent. `defold-typescript` is an npm CLI plus a types package; it ships no
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

---

More runbooks — `add script` and `fix Lua output`, both multi-step loops over the
`watch` NDJSON event stream — are coming in a follow-up slice. This page is not
yet the complete set.
