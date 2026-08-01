---
toc-title: Authoring forked library types
---
# Authoring forked library types

Some Defold libraries ship **no** usable structured type source — no
`.script_api`, no inline [LuaLS](https://luals.github.io/) (`---@`) annotations,
and no README that documents the surface precisely enough to parse. The
[LuaLS](./authoring-luals-library-types.md), `.script_api`, and markdown
front-ends all ingest a *primary* source and generate a declaration; a library
with none of those has nothing to generate *from*. Its `.d.ts` must be **written
by hand** — either forked from an existing hand-authored declaration or authored
fresh — and vendored into `@defold-typescript/library-types` as first-party
source. [`resolve`](./resolve.md#vendored-library-types) then materializes the
committed declaration into the consumer's project exactly as it does for the
generated lanes.

Like the other lanes, adding such a library is **data, not code**: you add one
entry to `packages/library-types/authored-targets.json`, vendor the `.d.ts`, run
the two generation commands, and commit the artifacts. The authored front-end
(`packages/library-types/scripts/sync-authored-types.ts`) is the reusable
machinery; you touch config and fixtures, not the pipeline.

> This page is for **library-type authors** working inside this repository. If you
> only want to *use* a vendored library in your own game, you need nothing here —
> just declare the dependency and run [`resolve`](./resolve.md).

## The decision: fork, hand-author, or keep?

Reach this lane only after ruling out the generated ones. Ask, in order:

1. **Does upstream ship a `.script_api`?** → it is a
   [script_api target](./authoring-luals-library-types.md#libraries-that-ship-a-script_api).
2. **Does its Lua carry inline `---@` annotations?** → it is a
   [LuaLS target](./authoring-luals-library-types.md).
3. **Does its README document the full surface precisely?** → it may be a
   markdown target (gated on a fidelity comparison; a lossy README is a `no-go`
   and the library does not regenerate from markdown).
4. **None of the above** → it is an **authored** target, and you choose between
   *fork*, *hand-author*, and *keep*.

A markdown `no-go` is a verdict on the **markdown source**, not on the ts-defold
dependency. It says the README cannot regenerate the surface; it says nothing
about where the surface should be maintained. That second question is this
lane's, and a `no-go` library reaches question 4 with it still open — so run the
cost model below on it exactly as you would on a library that never had a README
at all. `keep` is a legitimate answer, but it has to be *chosen*, not inherited
from the refusal. `persist.persist` is the worked example.

### The cost model

An authored `.d.ts` has no upstream source to regenerate from, so **every future
upstream API change is a manual edit** to the vendored declaration. That is the
standing cost. Weigh it against the gain of severing ts-defold: a first-party
authored surface is **authored-here**, carries its own upstream repo/tag pin
(not the shared `ts-defold/library` commit), and is maintained on this repo's
own cadence rather than inherited from a third-party vendoring.

- **Fork** — copy the retired ts-defold `.d.ts` verbatim as the first-party
  fixture. Zero fidelity risk (the surface is identical to what shipped), and the
  provenance moves to the real upstream. Best when the ts-defold binding is
  already correct and the surface is small and stable, so the manual-maintenance
  cost is low.
- **Hand-author** — write a fresh `.d.ts` from the library's documentation. Only
  worth it when the ts-defold binding is wrong or absent and the surface is small
  enough to author confidently.
- **Keep** — leave the library ts-defold-sourced. Correct when the surface is
  large or churns often, so the manual-maintenance cost outweighs the
  provenance gain, or when a generated lane is likely to become available.

## 1. Add an `authored-targets.json` entry

Each entry pins the library's own upstream repository and tag — an authored
library is the sole maintainer of its namespace, so it carries its own
`repo`/`ref` rather than the shared vendored commit. The fields:

| Field | Required | What it is |
| ----- | -------- | ---------- |
| `repo` | yes | The GitHub repository URL, e.g. `https://github.com/britzl/defcon`. |
| `ref` | yes | The immutable upstream ref to pin. Prefer the newest stable release tag (`git ls-remote --tags <repo>`) — never invent one. When upstream publishes no tags, pin the current default-branch commit SHA instead; the docs page renders the full SHA as the source ref. |
| `authored` | yes | Package-relative path of the vendored authored/forked `.d.ts` — `fixtures/authored/<moduleId>.d.ts`. |
| `moduleId` | yes | The library's runtime `require` path, dotted (e.g. `defcon.console`). This is the `declare module` name inside the vendored `.d.ts`. |
| `namespace` | yes | The artifact stem — the emitted files are `generated/<namespace>.d.ts` and `api-doc/<namespace>.json`. |
| `generated` | yes | The committed `.d.ts` output path (`generated/<namespace>.d.ts`). |
| `apiDoc` | yes | The docs-site model output path (`api-doc/<namespace>.json`). |
| `license` | no | SPDX-style license id, surfaced by the docs-site provenance block. Defaults to `""`. |
| `fidelity` | no | Defaults to `fidelity/<namespace>.json`. A fork records no fidelity artifact (see below); the field mirrors the sibling lanes for a future hand-authored target that wants one. |

A missing required field fails loudly, naming both the field and the offending
entry.

## 2. Vendor the `.d.ts` and generate the artifacts

Put the authored/forked declaration at the `authored` path. For a fork, that is a
verbatim copy of the retired `fixtures/ts-defold/<moduleId>.d.ts`; for a
hand-authored library, it is the declaration you wrote. Either way it must be a
`declare module '<moduleId>'` ambient — the target form the emit passes through
unchanged. Then run the two commands from `packages/library-types`:

```sh
cd packages/library-types

bun scripts/sync-authored-types.ts --emit       # emit generated/<namespace>.d.ts — the committed types
bun scripts/sync-authored-types.ts --api-doc     # lower api-doc/<namespace>.json — the docs-site model
```

- **`--emit`** writes the vendored `.d.ts` verbatim to the bare-namespace
  `generated/<namespace>.d.ts` golden. There is no parse or transform: an authored
  source is already target-form, so the emitted surface *is* the vendored surface.
- **`--api-doc`** runs `extractApiDoc` over the vendored `.d.ts` under the pinned
  publish `namespace`, producing the `api-doc/<namespace>.json` the docs-site `/api`
  page renders.

There is **no fetch command** — the source is vendored by hand, not snapshotted
from a primary source — and **no fidelity command**: there is no primary source to
compare against, and the emit is lossless by construction (see below).

## 3. Emission fidelity is by construction

The generated lanes report a coverage number because a parse can lose type
information the original had. An authored `.d.ts` cannot: the emitted golden is
the vendored source, so the go/no-go gate is a **forked-vs-generated identity
diff** — `generated/<namespace>.d.ts` is byte-identical to the vendored
`fixtures/authored/<moduleId>.d.ts`. The package tests assert exactly this parity,
so a stray edit to one file but not the other fails loudly. No `fidelity/` artifact
is written.

Read that gate narrowly. It proves **emission** fidelity — both sides of the diff
are this repo's own files, so all it certifies is that the golden loses nothing
relative to the vendored `.d.ts`. It says nothing about whether the vendored
surface matches upstream, and there is no primary source to measure it against —
that is what "no structured type source" means. A *verbatim* fork inherits
whatever accuracy the binding it copied already had; a *corrected* fork (see
`defsave` below) is only as accurate as the manual audit behind it. So pin the
corrections with per-library shape assertions in
`packages/library-types/scripts/sync-authored-types.test.ts` — the closest thing
this lane has to an upstream check.

## 4. Cut the library over and validate

Severing ts-defold for the library is the same single-module cutover the
generated lanes use:

- Drop the library's row from `library-targets.json` and its dir from
  `library-classification.json`, and delete the retired
  `fixtures/ts-defold/<moduleId>.d.ts`, `generated/<moduleId>.d.ts`, and
  `api-doc/<moduleId>.json`. The namespace now resolves to your authored artifacts.
- Remove the `./<moduleId>` subpath from `package.json` `exports` if present —
  authored libraries carry none, matching the LuaLS libraries.
- Add `generated/<namespace>.d.ts` to the `include` list in
  `tsconfig.dts-check.json` (the `dts-declaration-validity` gate type-checks it
  under `skipLibCheck: false`), and remove any hand-written block for the old
  dotted specifier from `test-d/library-types.test-d.ts`.

The docs-site fourth `maintainedHere` loader reads `authored-targets.json`, so the
namespace becomes **authored-here** — absent from the ts-defold classification and
present in a first-party corpus — and its `/api` page carries the upstream pin
automatically. Then run the gates:

```sh
bun test           # from packages/library-types
bun run typecheck  # from the repo root
```

Commit the new entry, the vendored `fixtures/authored/<moduleId>.d.ts`, and both
emitted artifacts (`generated/`, `api-doc/`) together, along with the config and
manifest deletions. Every commit must also add a [changelog](./changelog.md)
bullet — a pre-commit gate enforces it.

## Worked example — `defcon.console`

`britzl/defcon` is a plain-Lua console library with no `.script_api` and no
`---@` annotations, so it is a Bucket-E authored target. Its ts-defold binding
was a correct 24-line single-module surface, and the surface is small and stable
— exactly the low-maintenance-cost case the **fork** path is for. Keeping it
ts-defold-sourced would forgo the provenance gain for no real saving; a fresh
hand-author would be redundant work when the existing binding is already right.
So the decision is **fork**: copy the retired `.d.ts` verbatim, sever ts-defold,
and pin to the real upstream. The reference entry:

```json
{
  "repo": "https://github.com/britzl/defcon",
  "ref": "2.6.0",
  "license": "MIT",
  "authored": "fixtures/authored/defcon.console.d.ts",
  "moduleId": "defcon.console",
  "namespace": "defcon",
  "generated": "generated/defcon.d.ts",
  "apiDoc": "api-doc/defcon.json"
}
```

`authored` vendors the fork; `moduleId` `defcon.console` names the `declare
module` a consumer imports; `namespace` `defcon` is the single-segment artifact
stem, so the goldens are `generated/defcon.d.ts` and `api-doc/defcon.json` — not
the dotted `moduleId` — keeping the docs Libraries tree and file layout uniform
with the other severed libraries. The `defcon` page then attributes to
`britzl/defcon` at `2.6.0`, not the `ts-defold/library` corpus.

## Worked example — `deftest.deftest`

`britzl/deftest` (a test runner, pinned to `2.8.0`) is a second fork with the
same reference-entry shape as `defcon.console`. It illustrates one wrinkle: its
`.d.ts` declares ambient top-level globals (`describe`, `before`, `after`,
`test`, `assert_*`) alongside `declare module 'deftest.deftest'`. A fork copies
the surface **verbatim**, so those globals carry into `generated/deftest.d.ts`
and therefore into the `dts-declaration-validity` gate's compilation. That is
fine — they raise no duplicate-identifier clash — and the api-doc lowering still
scopes the page to the module's exports (`add`, `run`), so the ambient globals
never leak into the `deftest` reference page. Do not alter a vendored fork to
suppress such globals; they are part of the library's real surface.

## Worked example — `defmath.defmath`

`subsoap/defmath` (a pure-Lua math-helper module) is a third fork with the same
reference-entry shape, illustrating the **no-tag** case: upstream publishes no
git tags, so `ref` pins the default-branch commit SHA
(`c67c227322334056cea7a631f3ddcdf2bcfd480c`) rather than a semver tag. The
`defmath` page attributes to that SHA and its `sourceUrl` points at
`.../tree/c67c2273…` — expected, not a defect. Its surface also references core
engine types: upstream writes them as `vmath.vector3 | vmath.vector4` /
`vmath.quaternion`, but the fork — like every vendored declaration in this
package — carries the core-type-renamed ambient `Vector3 | Vector4` /
`Quaternion`. These resolve in the `dts-declaration-validity` gate via the
`@defold-typescript/types` reference that `test-d/dts-check-ambient.ts` pulls
in, so a fork consuming engine types needs no special wiring.

## Worked example — `defsave.defsave`

`subsoap/defsave` (a save/load helper, pinned to the `v1.2.6` tag) is the first
fork to **correct** a surface rather than re-home it: the ts-defold binding
declared 7 of upstream's 14 functions and just one of its 16 config fields
(`appname`), and three of the seven returned the wrong type. Neither pure option
fits — *keep* fails the cost model (upstream is frozen and the surface is tiny)
and a *fork* alone would knowingly re-home a half-missing surface, while a full
*hand-author* would rewrite five declarations that are already right (four
correct functions plus `appname`). So fork first, then hand-correct against the
pin: copy the retired `.d.ts`, add the missing members, and fix the wrong
signatures reading upstream's Lua as the authority. Extending a fork is
gate-safe: the identity diff compares the golden to the vendored fixture, not to
the retired ts-defold surface. But that diff proves **emission** fidelity only —
the golden loses nothing relative to the vendored `.d.ts`; it does not check the
vendored surface against upstream. That accuracy rests on the manual audit
against `defsave.lua` at the pin plus the per-library shape assertions in
`packages/library-types/scripts/sync-authored-types.test.ts`, so correcting a
fork moves the accuracy burden onto the author, not onto a gate. Narrowing a wrong return is a breaking change
for consumers and belongs in the changelog's `### Breaking` section; a types
package's value is accuracy, so do not keep a declaration you can see is wrong.

Two limits are worth knowing before you correct a surface. Upstream Lua that
falls off the end of a function returns `nil`, so a predicate like defsave's
`key_exists` is `boolean | undefined`, not `boolean` — read every branch, not
just the explicit `return`s. And a module's `export let` fields are still
read-only through a consumer's `import * as ns`, so a compile proof pins their
types by reading them; there is no way to prove assignability through a
namespace import.

## Worked example — `persist.persist`

`whiteboxdev/library-defold-persist` (a save/load helper, pinned to the
`b37f6104…` commit SHA since upstream publishes no tags) is the first fork to
arrive here from a **markdown `no-go`** rather than from having no documented
source at all. Its README documents all six functions by name but no parameters
and no returns, so the markdown gate scored `signature-loss` and refused the
cutover. That verdict retired the README as a regeneration path — and nothing
more. Running the cost model on the still-open maintenance question gives
*fork*: the ts-defold surface is five fully-typed functions in 34 lines,
upstream is abandoned (its README redirects to a successor project) so the
surface cannot churn, and the recorded loss was the README's, not the `.d.ts`'s.
So the fork is **verbatim** — the identity diff makes fidelity 100% by
construction, and the cutover ships no type change at all. Enrichment from
upstream prose, if ever wanted, is a later and separately-auditable edit to a
file this repo now owns.

Severing does not erase the markdown verdict. persist's `no-go`/`signature-loss`
record and its README snapshot stay exactly as recorded, and the gate still
re-derives the decision on every run — it just compares against the vendored
fork instead of the deleted `fixtures/ts-defold/` snapshot, which is sound
precisely because a verbatim fork is byte-identical to it. Keeping a dead
`library-targets.json` row alive to feed that lookup would have been the wrong
fix: it would make the file stop meaning *still ts-defold-sourced*, which is the
signal the remaining Bucket-C libraries are measured against.
