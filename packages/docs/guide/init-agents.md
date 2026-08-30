---
toc-title: init-agents
---
# Init agents

`init-agents` writes the agent contract at the project root: `AGENTS.md`, which
tells any AI harness (or human) opening the repo how this project is built and
where the installed docs are, and `CLAUDE.md`, which re-exports it.

```sh
bunx @defold-typescript/cli init-agents .                # current folder
bunx @defold-typescript/cli init-agents path/to/project  # a specific project
```

> [!TIP] [`init`](./init.md) already writes this contract as part of its
> scaffold, and [`upgrade`](./upgrade.md) refreshes it, so a project on the
> current toolchain has one. Reach for this verb to add a contract to a project
> that has none, or to restore a managed block you edited or deleted.

## A destination is required

Like [`init`](./init.md#a-destination-is-required), the verb takes an explicit
destination — there is no implicit "current folder" default, so it never writes
where you did not mean to. Pass a path, or `.` for the folder you are already in.
A missing path fails fast and writes nothing.

## What it writes

`AGENTS.md` carries a **managed block** delimited by HTML-comment markers:

```
<!-- defold-typescript:agents:start -->
…the managed contract…
<!-- defold-typescript:agents:end -->
```

Only the content *between* those markers is ever rewritten. Notes you add above
or below the block survive every re-run untouched. If `AGENTS.md` already exists
without the markers, the block is appended after one blank line and your prior
content is left intact.

`CLAUDE.md` re-exports it, for harnesses that look for that filename instead of
`AGENTS.md`, so the contract itself lives in one file. Written fresh, it is the
single line `@AGENTS.md`. A `CLAUDE.md` that already says exactly that is left
byte-for-byte unchanged and reported as untouched; one holding your own notes
keeps them and takes the re-export in a managed block appended below, the same
shape `AGENTS.md` gets.

The block tells an agent to author TypeScript under the `include` paths in
`tsconfig.json`, to drive the CLI with `--json`, where the typed API and the
guide live, and the hard rules that are expensive to rediscover — never commit
`build/` or `.defold-types/`, one `define*` factory per script file, and the
`defold-target` pin's exact `package.json` key.

## Re-running is safe

The block is **versionless**: its pointers resolve to
`node_modules/@defold-typescript/docs/llms.txt`, `llms-full.txt`, and
`guide/<page>.md` — paths the install swaps under you — so none of them has to be
rewritten when the toolchain moves. A run that would reproduce the file
byte-for-byte skips the write entirely, so re-running the verb on a current
project touches nothing and reports nothing.

The block's wording does change between toolchain releases, and you rarely have
to think about it: [`upgrade`](./upgrade.md) re-scaffolds with `--force`, which
refreshes the managed block for you. So does `init . --force`. A plain re-init
does not — it leaves a contract that is already there untouched.

That leaves this verb for the cases those do not cover: a project that has no
contract yet, or a managed block you edited or deleted and want restored without
re-scaffolding anything else.

## Machine-readable output

`--json` writes exactly one JSON object to stdout:

```json
{ "command": "init-agents", "ok": true, "written": ["AGENTS.md", "CLAUDE.md"] }
```

`written` lists only the files actually touched: a re-run that changes nothing
returns `[]`, and one that refreshes a stale block lists `AGENTS.md` alone. On
failure — a missing destination, or an unwritable path — the envelope carries the
reason and no `written` field:

```json
{ "command": "init-agents", "ok": false, "error": "<message>" }
```

The two files are written one after another rather than as a transaction, so a
failure on the second leaves the first on disk. `ok: false` therefore means *this
run did not finish*, not *nothing changed* — re-run the verb rather than assuming
the project was left as it was.

See [Agent runbooks](./agent-runbooks.md#install-the-agent-contract) for this
verb inside a full agent procedure.
