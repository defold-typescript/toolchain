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
   markdown target (gated on a fidelity comparison; a lossy README stays
   ts-defold-sourced).
4. **None of the above** → it is an **authored** target, and you choose between
   *fork*, *hand-author*, and *keep*.

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
| `ref` | yes | The exact release tag to pin. Resolve the newest stable tag (`git ls-remote --tags <repo>`) — never invent one. |
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
from a primary source — and **no fidelity command**: a fork's fidelity is 100% by
construction (see below).

## 3. Fidelity is by construction

The generated lanes report a coverage number because a parse can lose type
information the original had. An authored `.d.ts` cannot: the emitted golden is
the vendored source, so the go/no-go gate is a **forked-vs-generated identity
diff** — `generated/<namespace>.d.ts` is byte-identical to the vendored
`fixtures/authored/<moduleId>.d.ts`. The package tests assert exactly this parity,
so a stray edit to one file but not the other fails loudly. No `fidelity/` artifact
is written.

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
