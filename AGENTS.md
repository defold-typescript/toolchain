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
- Every time you touch the changelog, re-condense the **unreleased (top, untagged) section as a whole** — never the frozen released sections below it. This goes past the per-feature fold above: merge *sibling* entries that describe the same kind of change into **one parent bullet with a nested second-level list**. Put the shared framing on the parent line and give each item its own 2-space-indented child bullet — never run the items together into a single paragraph-bullet, which is unreadable. Lead each child with the thing it is about in bold (e.g. the library or command name) so the list scans. For example the several "the `<lib>` library types are now maintained in this repo, regenerated from upstream" entries collapse to one parent bullet stating the common pipeline / pin / maintained-here framing, with one child bullet per library (`- **[tweener](/api/tweener)** (`Insality/defold-tweener`, tag `6`) — per-easing helpers …`) carrying only that library's specifics. Keep the `### Breaking`/`### Improved`/`### Fixed` taxonomy and condense within each subsection; a subsection left with a single parent-plus-children item is the goal, not a loss. Two sibling entries do not need this — a nested list earns its keep at roughly three or more.
- In that same unreleased section, convert every symbol or doc reference into an internal link **when a target page already exists** — do not invent links, and never add links inside frozen released sections. Library/module names and exported type names link to their API-reference page under `/api/` (e.g. `[base](/api/base)`, `[Opaque](/api/Opaque)`); a reference to another guide page links to `./<page>.md#anchor` (e.g. `[resolve](./resolve.md)`). Link the first mention in a bullet, not every repeat.
- **The one edit a frozen released section accepts is redacting a link whose target no longer exists.** Released history goes stale when what it points at is retired — a dropped library takes its `/api/` route with it, a deleted guide page takes its `./<page>.md` link, a rewritten page takes its `#anchor` — and `guide-links.test.ts` reds on all three until each one is dealt with. Replace the whole link with its bare target as inline code, keeping the visible text if the label carried meaning the target no longer does: `[starly](/api/starly)` becomes `` `api/starly` ``, `[wall](./wall.md)` becomes `` `wall.md` ``. The reader still sees what shipped, and nothing navigates to a dead page. Repointing instead of redacting is allowed **only** when the same target moved and still documents the same thing (a bare-namespace migration: `/api/log.log` -> `/api/log`). Nothing else in a released section may change: not the prose, not the version, not a link that still resolves.

## Layout invariants

- `packages/types` — typings only, no runtime code.
- `packages/transpiler` — depends on `@defold-typescript/types`; produces Lua output.
- `packages/cli` — the only package that exposes a binary (`defold-typescript`).
- New packages go under `packages/`; do not create siblings at the repo root.

## Testing

- A test must be able to fail from a production change: assertions on authored prose, and test-local inventories or parsers standing in for a production source, do not qualify. The one exception is a content-hash pin over an input a recorded verdict or measurement was derived from — an *upstream vendored* copy (`markdown-fidelity-gate.test.ts`, `authored-parity-floor.test.ts`) or the *authored-lane* fork a severed library's verdict resolves against (`markdown-fidelity-gate.test.ts`) — which defends the input rather than the code. An upstream digest is never re-baselined; an authored-lane digest is re-pinned in the same commit as the deliberate edit, once the verdicts reading it have been re-checked.
- `bun test` runs the full suite from the repo root.
- Co-locate unit tests next to the source: `foo.ts` ↔ `foo.test.ts`.
- Snapshot transpiler output for representative inputs; do not assert on Lua substrings.
- Browser end-to-end specs use the `*.e2e.ts` suffix so root `bun test` (which auto-discovers `*.test.ts`/`*.spec.ts`) skips them; run them via a package-local opt-in command (docs-site `test:e2e`, Playwright), never in `ci`.

## Agent runbooks

- Procedures for driving the CLI from an automated agent live in [`packages/docs/guide/agent-runbooks.md`](packages/docs/guide/agent-runbooks.md).
