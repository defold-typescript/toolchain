# Agent guide

This repo is designed to be driven by AI agents (clankers) as well as humans. Treat this file as the contract.

## Ground rules

- Use Bun for everything: install, run, test. Never invoke `npm` or `node` directly.
- Lint and format with Biome (`bun run lint`, `bun run lint:fix`). Do not introduce ESLint or Prettier.
- Do not add comments unless the *why* is non-obvious. Names should carry intent.
- Keep `packages/docs/guide/` current as features land; a user-visible command, flag, type, or workflow change updates the relevant guide page in the same body of work.
- Never commit without an explicit human request, unless the active skill workflow calls for it.
- Every commit must update `packages/docs/guide/changelog.md` (a pre-commit gate in `scripts/changelog-gate.ts` enforces it, running on every commit with no glob) — bypass a genuine exception with `git commit --no-verify`.
- The changelog's top `## vX.Y.Z` heading is the *sole unreleased* section; a version counts as released only once its git tag exists (the gate compares the top heading against the latest release tag), so everything below the first untagged heading is frozen history — never renumber or edit a released section. The unreleased number is provisional until tagged: pick it from the **highest-impact change the cycle has accumulated**, and **re-version the existing pending heading in place** rather than opening a second heading above it (two unreleased headings must never coexist). A new user-facing feature — or any pre-1.0 breaking change — promotes the pending release to a **minor** (`## v0.<Y+1>.0`) even when the heading so far read as a patch carrying only fixes; reserve a patch bump for a cycle that is fixes/internal-only. So when a feature lands on a pending `v0.Y.Z+1` fixes section, rename that heading to `v0.Y+1.0` and fold its fixes under it — do not stack a new minor above it.
- Write changelog entries for the end user, not the contributor. Keep each bullet to one or two short sentences on what a user would actually notice: real additions, behavior changes, backward-compatibility and breaking changes, and bugs they would have hit. Omit internal-only work — docs-tooling, refactors, test scaffolding, naming nitpicks — unless it changes something a user sees. Fold multiple commits toward one feature into a single merged sentence rather than one bullet per commit. While a feature is still in progress, each new commit **rewrites that feature's single bullet from scratch** to stay within one or two sentences — never append a clause to it. If the bullet has grown past two sentences, it is being appended to, not collapsed: replace the whole thing.

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
