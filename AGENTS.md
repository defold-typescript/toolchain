# Agent guide

This repo is designed to be driven by AI agents (clankers) as well as humans. Treat this file as the contract.

## Ground rules

- Use Bun for everything: install, run, test. Never invoke `npm` or `node` directly.
- Lint and format with Biome (`bun run lint`, `bun run lint:fix`). Do not introduce ESLint or Prettier.
- Do not add comments unless the *why* is non-obvious. Names should carry intent.
- Keep `docs/guide/` current as features land; a user-visible command, flag, type, or workflow change updates the relevant guide page in the same body of work.
- Never commit without an explicit human request, unless the active skill workflow calls for it.

## Layout invariants

- `packages/types` — typings only, no runtime code.
- `packages/transpiler` — depends on `@defold-typescript/types`; produces Lua output.
- `packages/cli` — the only package that exposes a binary (`defold-typescript`).
- New packages go under `packages/`; do not create siblings at the repo root.

## Testing

- `bun test` runs the full suite from the repo root.
- Co-locate unit tests next to the source: `foo.ts` ↔ `foo.test.ts`.
- Snapshot transpiler output for representative inputs; do not assert on Lua substrings.

## Agent runbooks

- Procedures for driving the CLI from an automated agent live in [`docs/guide/agent-runbooks.md`](docs/guide/agent-runbooks.md).
