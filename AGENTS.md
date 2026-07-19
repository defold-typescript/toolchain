# Agent guide

This repo is designed to be driven by AI agents (clankers) as well as humans. Treat this file as the contract.

## Ground rules

- Use Bun for everything: install, run, test. Never invoke `npm` or `node` directly.
- Lint and format with Biome (`bun run lint`, `bun run lint:fix`). Do not introduce ESLint or Prettier.
- Do not add comments unless the *why* is non-obvious. Names should carry intent.
- Keep `packages/docs/guide/` current as features land; a user-visible command, flag, type, or workflow change updates the relevant guide page in the same body of work.
- Never commit without an explicit human request, unless the active skill workflow calls for it.
- Every commit must update `packages/docs/guide/changelog.md` (a pre-commit gate in `scripts/changelog-gate.ts` enforces it, running on every commit with no glob) — bypass a genuine exception with `git commit --no-verify`.

## Layout invariants

- `packages/types` — typings only, no runtime code.
- `packages/transpiler` — depends on `@defold-typescript/types`; produces Lua output.
- `packages/cli` — the only package that exposes a binary (`defold-typescript`).
- New packages go under `packages/`; do not create siblings at the repo root.

## Testing

- `bun test` runs the full suite from the repo root.
- Co-locate unit tests next to the source: `foo.ts` ↔ `foo.test.ts`.
- Snapshot transpiler output for representative inputs; do not assert on Lua substrings.
- Browser end-to-end specs use the `*.e2e.ts` suffix so root `bun test` (which auto-discovers `*.test.ts`/`*.spec.ts`) skips them; run them via a package-local opt-in command (docs-site `test:e2e`, Playwright), never in `ci`.

## Agent runbooks

- Procedures for driving the CLI from an automated agent live in [`packages/docs/guide/agent-runbooks.md`](packages/docs/guide/agent-runbooks.md).
