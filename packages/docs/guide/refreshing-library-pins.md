---
toc-title: Refreshing library pins
---
# Refreshing library pins

Every library whose types this repo ships is pinned to one upstream `ref` in one
of five lane registries under `packages/library-types/`: the LuaLS, script_api and
authored registries, with the fixtures their entries name, sit in the newest
library data folder (`data/<version>/`), and the markdown and OpenAPI registries
at the package root. Upstream keeps moving;
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
issue per stale repo, titled by repo slug, upstream version and internal marker
so a rerun before the bump lands finds its own issue rather than minting a second
one. It is also
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
- **A pin that feeds only the fidelity comparison is marked internal.** When
  every dependent is a markdown or OpenAPI target whose `decision` is not `go`,
  no user receives its output, so the report sets `internal`, the prose line and
  the issue title end in `(internal)`, and the issue says the bump needs no
  changelog bullet. It is still actionable: a stale spec hides upstream movement
  from the go/no-go comparison.

A repo the check could not read at all is reported as `unknown` and exits the
command non-zero. That is deliberate: a renamed or deleted upstream must not look
like "current".

The check reads GitHub and Codeberg; a repo on any other host reports `unknown`.
When an upstream moves, search the author's old repos for a pointer to the new
home before withdrawing the library. Re-pointing means a new `repo` and a new
`ref` together, because a moved repo often has rewritten history and the old
commit no longer exists there.

## Survey the Asset Portal

The registries only see libraries someone already added.
`packages/library-types/asset-portal.json` records every
[Defold Asset Portal](https://defold.com/assets/) entry, pinned to a
`defold/asset-portal` commit, with the GitHub repo each entry names classified
by what a dependency on it installs:

```sh
GITHUB_TOKEN="$(gh auth token)" bun run --cwd packages/library-types asset-portal:sync
```

The sync refuses to start without `GITHUB_TOKEN` or `GH_TOKEN`, because it makes
about five API calls per entry. It follows renames, so `repo` is the canonical
URL (the portal's `britzl/extension-imgui` is recorded as
`defold/extension-imgui`). Each repo is read at its latest release, else its
newest tag, else its default-branch head.

Files count only inside the repo's `game.project` `[library] include_dirs`,
since nothing else reaches a project that adds the dependency. Each entry's
`kind` is the first row that matches:

| `kind` | The repo at its pin |
| ------ | ------------------- |
| `no-source` | is not readable on GitHub; `reason` is `no-github-url` or `not-found` |
| `not-a-dependency` | declares no `include_dirs`: a tool, sample or editor integration |
| `script-api` | ships a `.script_api`, which [`resolve`](./resolve.md) already types |
| `native-untyped` | ships an `ext.manifest` without a `.script_api` |
| `pure-lua-annotated` | ships Lua, and one of up to four sampled files carries `---@` annotations |
| `pure-lua` | ships Lua with no annotated sample |
| `no-lua-api` | ships no Lua: shaders, materials, sounds or editor scripts only |

`bun run asset-portal:report` joins the manifest against every lane registry
and the `defold` org listing in `defold-extensions.json`, offline, and prints
four answers:

- **Tracked**: entries whose repo a registry already pins, counted per lane. The
  `portal` lane counts the `script-api` entries that have reference pages. A
  tracked entry files here whatever its `kind`.
- **Candidates**: untracked entries of kind `script-api`, `native-untyped`,
  `pure-lua-annotated` or `pure-lua` that are not archived, not a fork, were
  pushed within 730 days of the sync, and carry no verdict. They are grouped by
  kind and ranked by stars, which only order the list and say nothing about
  quality.
- **Declined**: untracked entries with a recorded verdict, each with its
  reason.
- **Nothing to type**: untracked `no-lua-api`, `not-a-dependency` and
  `no-source` entries.

A line between them counts the untracked entries with a Lua API that fail the
maintenance rule.

After a manifest sync, give every `script-api` candidate its reference pages:

```sh
GITHUB_TOKEN="$(gh auth token)" bun run asset-portal:script-api
```

It converts each `.script_api` under the entry's `include_dirs` at the pin
`asset-portal.json` recorded, writes the page list to
`packages/library-types/asset-portal-script-api.json` and one doc per page under
`asset-portal-script-api/api-doc/`, and rebuilds that directory on every run.
Those entries then count as tracked on the `portal` lane. A doc that fails to
convert, a page key that would take another page's `/api/` route, or a page key
that is not one safe route and file name (ASCII letters, digits, `_`, `.` and
`-`, starting and ending with a letter, digit or `_`, and not a Windows device
name such as `CON` or `NUL` before its first `.`) stops the sync before it
changes any file, instead of dropping the page.

A library that moved forge keeps a stale portal entry: the portal's
`Klaleus/library-defold-checkpoint` is gone from GitHub, and the authored lane
pins `codeberg.org/Klaleus/defold-checkpoint`. Map such an entry to the tracked
repo in `packages/library-types/asset-portal-aliases.json`. The report refuses
to run when an alias names an entry the manifest no longer lists, or a repo no
registry pins.

An entry whose pinned tree holds no runtime module a project would `require`,
such as an editor script, an import tool or a project template, stays a
candidate until someone looks. Record the decision in
`packages/library-types/asset-portal-verdicts.json`: a map from entry id to one
short reason naming what the tree holds instead. A verdict takes the entry off
the candidate list for good, whatever its maintenance state. The report refuses
to run when a verdict names an entry the manifest no longer lists, or an entry a
registry pins directly or through an alias, since either verdict is stale.
`bun scripts/ratchet-backlog.ts asset-portal-candidates` prints the candidates
still open, one per line, for the planning intake.

The weekly **Library upstream pin check** workflow also compares the portal
head's entry ids with the manifest. When ids were added or removed, it opens one
issue, titled *Asset portal entries differ from asset-portal.json*, that lists
them and names the re-sync command. The title never changes, so later
runs stay quiet while that issue is open. A changed entry under an unchanged id
is not reported, because the portal rewrites release metadata every six hours.

## Refresh the lane

Four lanes fetch and regenerate. Run their commands from
`packages/library-types`, in order, after editing the pinned `ref`:

| Lane | Pin | Commands |
| ---- | --- | -------- |
| LuaLS | the library folder's `reviewed.json` | `bun run luals:fetch`, then `luals:fidelity`, `api-doc` |
| Markdown | `markdown-targets.json` | `bun ../cli/src/library/sync-markdown-types.ts --fetch --fidelity --api-doc` |
| OpenAPI | `openapi-targets.json` | `bun ../cli/src/library/sync-openapi-types.ts --fetch --fidelity --api-doc` |
| script_api | the library folder's `reviewed.json` | `bun ../cli/src/library/sync-script-api-types.ts --fetch --fidelity`, then `bun run api-doc` |

A library folder sits in the newest version-named folder under
`packages/library-types/data/`, named for its repository: the URL's last path
segment, lowercased, without `.git`.

`--fetch` is the only step that touches the network; everything after it reads
the committed fixtures, so a regeneration is reproducible offline. No lane
writes a declaration: `resolve` prints each target's types from its fixtures, so
check them by printing them with `bun test packages/cli/src/library` from the
repo root.

Set `GITHUB_TOKEN` before fetching. The fetchers read it (`sync-luals-types.ts`
and `sync-library-types.ts` both send it as a bearer token) and GitHub degrades
unauthenticated API traffic — the `git/trees` calls behind `--fetch` and
`upstream:library-check` can return `504 Gateway Timeout` on every attempt while
the rate-limit budget still shows requests remaining, so a 504 here is not
evidence that the pin or the repo is wrong.

```sh
GITHUB_TOKEN="$(gh auth token)" bun run luals:fetch
```

**The authored lane is the exception, and it is the one that surprises people.**
A library's forks have **no `--fetch`** and no fidelity pass. Their
`source/upstream/` snapshots are vendored by hand and their `.d.ts` is
hand-written, so `bun run api-doc` is the only command they take.
Refreshing an authored pin means:

1. edit the `ref` in the library folder's `reviewed.json`;
2. copy the upstream files named by `upstreamLua` into the library folder's
   `source/upstream/…` by hand (the path under it mirrors the upstream path);
3. update the hand-written `.d.ts` for whatever the new upstream added or changed;
4. re-run `bun run parity` and `bun run api-doc`.

## The couplings a re-pin moves with it

None of these are visible from the sync scripts, and each of them reds `ci` if you
skip it.

- **The committed floor.** `floors` in the library's `library.json` holds a
  per-module measurement the gates and `library check` assert against. New upstream
  surface changes the measurement, so the floor entry moves with the pin — raise a
  generated module's ratio with `bun run fidelity:floor`, and edit a fork's or native
  extension's `{ callable, field }` pair by hand.
- **The vendored-snapshot digest.** `authored-parity-floor.test.ts` pins the
  SHA-256 of every file under each forked library's `source/upstream/`, because the committed
  parity numbers were measured against exactly those bytes. Re-vendoring changes
  the digest; re-pin it **in the same commit**, after re-running the parity
  report and reviewing the coverage change. Never re-baseline a digest to make a
  red go away — that leaves every committed number standing while silently
  changing what it is about.
- **The docs-site provenance assertions.** `api-surface-loader.test.ts` reads the
  pin back out of the emitted API-doc metadata and asserts it exactly — for
  druid, `meta.commit` is the `ref` in `druid/reviewed.json` and
  `meta.sourceUrl` is `https://github.com/Insality/druid/tree/<ref>`. A bump
  moves both, and they are in a different package from the pin you edited.
- **The pin-refresh record.** `packages/library-types/pin-refresh.json` states which
  members a bump added and removed, one entry per refresh, each tagged with the
  `lane` it belongs to (`luals`, `script-api`, or `openapi`).
  `packages/cli/src/library/pin-refresh.test.ts` checks every name it states
  against the surface that lane's own parser yields for the committed fixtures —
  `buildTargetModel`, `committedScriptApiDoc`, or `parseOpenApi`. Regenerating the
  fixtures without updating the record reds `ci`, so derive the new
  entry by diffing the old and new member names rather than from upstream
  release notes. A second key, `deliberatelyUnmoved`, records a pin you examined
  and chose to leave alone, and is guarded on its `ref` alone — so a note left
  standing after that pin later moves also reds. The guard deliberately does not
  check that the record is *complete*, nor its `changedMembers` and `notes`,
  which are prose.
- **The compile-only surface proofs.** The `.test-d.ts` files under each
  library folder's `usage/` assert the emitted `.d.ts` by assigning from it, and pin the *absence* of
  non-public members with `@ts-expect-error`. A bump breaks them in both
  directions: a member that left the public surface fails the assignment, and a
  member upstream stopped marking `@field private` or `@local` makes its
  expect-error directive unused (TS2578). The second is the easy one to
  misread — check the old and new fixture annotations before assuming the
  emitter regressed, because dropping a `private` marker upstream is a real
  surface change and the declaration is then correct to emit.
- **The generated docs artifacts.** `packages/docs/llms.txt`,
  `packages/docs/llms-full.txt`, and the docs-site search and symbol indexes are
  committed, not built on demand. Regenerate them with
  `bun run --cwd packages/docs-site build-indexes` whenever the API-doc model
  changed.

## What a re-pin does not touch

The corpus pin and a *consumer's* declared dependency are different things, and
conflating them is the first mistake a repo-wide find-and-replace makes.

Several CLI tests hardcode archive URLs and extracted-entry paths, and some of
them pin *exactly* the corpus string. `packages/cli/src/library-match.test.ts`,
`packages/cli/src/resolve.test.ts` and `packages/cli/src/druid-resolve-e2e.test.ts`
all carry a druid version literal in consumer archive URLs, and it can equal the
`ref` the registry entry holds. That collision is the reason a repo-wide
find-and-replace is unsafe: one copy of the version must move with the bump (the
registry entry, and the docs-site provenance assertions named above), and
another must not.

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

## Retiring a curated target

A curated target is only needed while its upstream ships no types `resolve` can
use. Once an upstream release ships a `types/` folder that `resolve` accepts,
every project on that release gets those files in place of the curated copy,
and the curated copy only costs a pin, a parity floor and a re-pin per release.

`bun run upstream:shipped-types-check` reads the newest release of every repo
behind a curated target, across the authored, LuaLS, script_api and native
lanes, and runs its `types/` folder through the same selection and compile
check `resolve` applies:

```sh
bun run upstream:shipped-types-check          # prose report
bun run upstream:shipped-types-check --json   # one object, for tooling
```

The newest release is the newest tag by commit date, or the default branch head
for a repo with no tags. Each repo reports `accepted`, `rejected` with the
check's first error, or `none`. A repo it could not read reports `unknown` and
exits the command non-zero.

The **Library upstream pin check** workflow runs the same sweep weekly and opens
one issue per accepted repo, titled
`retire curated types for <slug>: <ref> ships types`. The issue lists the
shipped files and every curated entry the repo backs.

The issue retires nothing. Retirement is a reviewed change, as `pixels` was
(`git show a32a1972`), that removes each listed entry's registry entry, the
input the issue lists for it, its `/api` page, vendored upstream source and
parity floor, along with the tests that named it. Before making it, weigh the projects left
behind: a project still on a release before the one that ships types has no
`types/` folder to fall back on once the curated copy is gone.

An upstream maintainer gets the curated files to commit with `export-types`, as
[Shipping types with a library](./shipping-library-types.md#starting-from-the-curated-types)
describes.
