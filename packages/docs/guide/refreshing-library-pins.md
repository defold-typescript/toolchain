---
toc-title: Refreshing library pins
---
# Refreshing library pins

Every library whose types this repo ships is pinned to one upstream `ref` in one
of five lane registries under `packages/library-types/`. Upstream keeps moving;
the pins do not. This page is what to do when one of them has fallen behind.

[Authoring LuaLS library types](./authoring-luals-library-types.md) and
[Authoring forked library types](./authoring-forked-library-types.md) cover
*adding* a library. This page covers *moving* one that is already there, which is
a different job: the generation commands are the easy half, and the couplings
that move with the pin are the half that is not discoverable from the sync
scripts.

> This page is for maintainers working inside this repository. Consuming a
> library in your own project is [`resolve`](./resolve.md), and your project's
> declared dependency version is unrelated to the pin here.

## How a stale pin is noticed

`bun run upstream:library-check` scans all five registries and reports, per
upstream repo, whether the pin has fallen behind:

```sh
bun run upstream:library-check          # prose report
bun run upstream:library-check --json   # one object, for tooling
```

The **Library upstream pin check** workflow
(`.github/workflows/library-upstream-check.yml`) runs it weekly and opens one
issue per stale repo, titled by repo slug and upstream version so a rerun before
the bump lands finds its own issue rather than minting a second one. It is also
`workflow_dispatch`-able, which matters because GitHub disables a `schedule:`
trigger after 60 days of repository inactivity.

Two things about the report are worth knowing before you act on it:

- **The unit of work is the repo, not the module.** `britzl/defold-input` backs
  ten authored modules and `britzl/defold-orthographic` is consumed by two lanes.
  One bump answers every dependent, so the check groups by `repo` + `ref` and the
  issue lists the dependents.
- **A commit-pinned repo is only actionable when the delta touches a path this
  repo reads.** The registries already record which upstream files each target
  consumes, so a README-only commit on a pinned repo's default branch reports as
  `behind-head` without asking you to do anything.

A repo the check could not read at all is reported as `unknown` and exits the
command non-zero. That is deliberate: a renamed or deleted upstream must not look
like "current".

## Refresh the lane

Four lanes fetch and regenerate. Run their commands from
`packages/library-types`, in order, after editing the `ref` in the registry:

| Lane | Registry | Commands |
| ---- | -------- | -------- |
| LuaLS | `luals-targets.json` | `bun run luals:fetch`, then `luals:fidelity`, `luals:emit`, `luals:api-doc` |
| Markdown | `markdown-targets.json` | `bun scripts/sync-markdown-types.ts --fetch --fidelity --emit --api-doc` |
| OpenAPI | `openapi-targets.json` | `bun scripts/sync-openapi-types.ts --fetch --fidelity --emit --api-doc` |
| script_api | `script-api-targets.json` | `bun scripts/sync-script-api-types.ts --fetch --fidelity --emit --api-doc` |

`--fetch` is the only step that touches the network; everything after it reads
the committed fixtures, so a regeneration is reproducible offline.

**The authored lane is the exception, and it is the one that surprises people.**
`authored-targets.json` has **no `--fetch`** and no fidelity pass. Its
`fixtures/upstream-lua/` snapshots are vendored by hand and its `.d.ts` is
hand-written, so `sync-authored-types.ts` accepts only `--emit` and `--api-doc`.
Refreshing an authored pin means:

1. edit the entry's `ref`;
2. copy the upstream files named by `upstreamLua` into
   `fixtures/upstream-lua/<repo-name>/…` by hand (the fixture path mirrors the
   upstream path under a repo-name directory);
3. update the hand-written `.d.ts` for whatever the new upstream added or changed;
4. re-run `bun run parity` and `bun scripts/sync-authored-types.ts --emit --api-doc`.

## The couplings a re-pin moves with it

None of these are visible from the sync scripts, and each of them reds `ci` if you
skip it.

- **The committed floor.** `fidelity-floor.json` (fetch-lane targets) and
  `authored-parity-floor.json` (authored targets) hold a per-slot measurement the
  gates assert against. New upstream surface changes the measurement, so the floor
  entry moves with the pin — raise it with `bun run fidelity:floor` rather than
  hand-editing.
- **The vendored-snapshot digest.** `authored-parity-floor.test.ts` pins the
  SHA-256 of every file under `fixtures/upstream-lua/`, because the committed
  parity numbers were measured against exactly those bytes. Re-vendoring changes
  the digest; re-pin it **in the same commit**, after re-running the parity
  report and reviewing the coverage change. Never re-baseline a digest to make a
  red go away — that leaves every committed number standing while silently
  changing what it is about.
- **The docs-site provenance assertions.** `api-surface-loader.test.ts` reads the
  pin back out of the emitted API-doc metadata and asserts it exactly — for
  example `meta.commit` is `1.2.5` and `meta.sourceUrl` is
  `https://github.com/Insality/druid/tree/1.2.5`. A bump moves both, and they are
  in a different package from the registry you edited.
- **The pin-refresh record.** `packages/library-types/pin-refresh.json` states which
  members a bump added and removed, one entry per refresh, each tagged with the
  `lane` it belongs to (`luals`, `script-api`, or `openapi`).
  `packages/library-types/scripts/pin-refresh.test.ts` checks every name it states
  against the surface that lane's own parser yields for the committed fixtures —
  `buildTargetModel`, `committedScriptApiDoc`, or `parseOpenApi`. Regenerating the
  fixtures without updating the record reds `ci`, so derive the new
  entry by diffing the old and new member names rather than from upstream
  release notes. A second key, `deliberatelyUnmoved`, records a pin you examined
  and chose to leave alone, and is guarded on its `ref` alone — so a note left
  standing after that pin later moves also reds. The guard deliberately does not
  check that the record is *complete*, nor its `changedMembers` and `notes`,
  which are prose.
- **The generated docs artifacts.** `packages/docs/llms.txt`,
  `packages/docs/llms-full.txt`, and the docs-site search and symbol indexes are
  committed, not built on demand. Regenerate them with
  `bun --cwd packages/docs-site run build-indexes` whenever the API-doc model
  changed.

## What a re-pin does not touch

The corpus pin and a *consumer's* declared dependency are different things, and
conflating them is the first mistake a repo-wide find-and-replace makes.

Several CLI tests hardcode archive URLs and extracted-entry paths, and some of
them pin *exactly* the corpus string. `packages/cli/src/library-match.test.ts`,
`packages/cli/src/resolve.test.ts` and `packages/cli/src/druid-resolve-e2e.test.ts`
all carry druid's `1.2.5` — the same literal the registry entry holds. That
collision is the reason a repo-wide find-and-replace is unsafe: one `1.2.5` must
move with the bump (the registry entry, and the docs-site provenance assertions
named above), and another must not.

`normalizeSourceId` (`packages/cli/src/library-match.ts`) strips
`/archive/<ref>.zip` and matches on the repo name alone, so a consumer fixture is
version-independent either way — which cuts both ways. Rewriting its version
leaves the suite green, so a green `bun test` is not evidence the rewrite was
correct. The `1.2.3` fixtures in `packages/cli/src/library-scene-materialize.test.ts`
and the later `resolve.test.ts` cases are consumer fixtures on the same footing
and equally out of scope.

**Leave them alone.** A corpus bump changes `packages/library-types/`, the floors,
the emitted artifacts and the docs indexes. It does not change what a test project
declares in its `game.project`.

## Check the work

```sh
bun run typecheck
bun run lint
bun test
```

Then re-run `bun run upstream:library-check` — the repo you bumped should now
report as current, and the issue the workflow opened can be closed.
