---
toc-title: Upgrading the toolchain
---
# Upgrading the toolchain

One command moves a project to the latest toolchain:

```sh
bunx @defold-typescript/cli@latest upgrade
```

> [!TIP] `update` is a synonym — both spellings run the same verb, so you never have to
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
mise run # and pick defold-typescript:upgrade
# or
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
`tsconfig.json` settings all survive the upgrade untouched. Inside a managed
`mise.toml` task the refresh rewrites only the two keys the scaffold authors —
`description` and `run` — so a key you added there, such as an `alias` or a
`depends`, survives too.

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

## Upgrading toolchain vs Defold API target

Upgrading the toolchain and moving the Defold API surface are separate decisions.
See [Pinning the Defold target](./pinning-defold-target.md) for the pin's own
lifecycle — how to choose a version or a release channel, and how the surface is
materialized.
