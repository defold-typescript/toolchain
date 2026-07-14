---
toc-title: Upgrading the toolchain
---
# Upgrading the toolchain

One command moves a project to the latest toolchain:

```sh
bunx @defold-typescript/cli@latest upgrade
```

`update` is a synonym — both spellings run the same verb, so you never have to
remember which one this CLI chose.

## What the verb does

`upgrade` always resolves the latest published `@defold-typescript/cli` from the
npm registry first, then branches on how it compares to the CLI that is running:

- **The running CLI is behind** — it hands off to the newer one, which re-scaffolds
  the project in place. An older binary must never re-scaffold from its own
  templates: it would exit successfully while moving the project *backwards*.
- **The running CLI is already the latest** — it re-scaffolds in place directly, with
  no hand-off.

Either entry point therefore lands on the same place — the latest templates and
the latest pins — whether you invoke `@latest` from outside the project or the
copy already installed in it. The re-scaffold is `init --force`, and the verb
finishes by running your package manager's install so the refreshed pins are
actually on disk.

The `mise` task the scaffold writes is the same verb:

```sh
mise run defold-typescript:upgrade
```

## What it refreshes, and what it never touches

The re-scaffold refreshes the **managed** files: it re-pins the managed
`@defold-typescript/types` and `@defold-typescript/cli` devDependencies to the new
CLI's version, refreshes the managed `mise.toml` task block and the managed
`AGENTS.md` block, and reconciles `tsconfig.json`.

It **never** clobbers files you authored. An entry script you have written —
`src/main.ts` — is left exactly as it is; the scaffold reports it as `skipped`
rather than overwriting it. Notes you keep outside the `AGENTS.md` markers, your
own `[tools]` and `[tasks.*]` entries in `mise.toml`, and your other
`tsconfig.json` settings all survive the upgrade untouched.

## What it does to your `defold-target` pin

The upgrade repairs the `defold-typescript` namespace in `package.json` rather
than resetting it:

- A valid `defold-target` pin is **left untouched** — it round-trips byte for byte,
  so upgrading the toolchain never silently moves your Defold API surface.
- A legacy `defold-version` or `channel` key is **migrated** to `defold-target`,
  keeping its value, and you get a warning naming the key that moved.
- If both a legacy key and a valid `defold-target` are present, the legacy key is
  dropped and the `defold-target` pin wins.
- A project with no pin at all has `defold-target` seeded with the current stable
  version.

Upgrading the toolchain and moving the Defold API surface are separate decisions.
See [Pinning the Defold target](./pinning-defold-target.md) for the pin's own
lifecycle — how to choose a version or a release channel, and how the surface is
materialized.

## Reading the result

Pass `--json` when a script or an agent runs the upgrade:

```sh
bunx @defold-typescript/cli@latest upgrade --json
```

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

`from` and `to` are the running and the resolved-latest CLI versions, and
`handedOff` says whether the newer CLI did the re-scaffold. When `from` and `to`
are equal, `handedOff` is `false` and the project was re-scaffolded in place.

`written` lists the managed files the re-scaffold touched. When `handedOff` is
`true` it is the list the **newer CLI reports** for the re-scaffold it performed,
read back from the delegated run; when `handedOff` is `false` it is the running
CLI's own list.

Upgrading is the one command that needs the network. If the registry is
unreachable, the run fails — `ok` is `false` with a non-zero exit — rather than
quietly re-scaffolding against the version you already have. See the
[upgrade runbook](./agent-runbooks.md#upgrade-the-toolchain) for the agent-facing
procedure.
