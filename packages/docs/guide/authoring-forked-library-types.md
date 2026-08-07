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
from the refusal. `persist.persist` and `orthographic.camera` are the worked
examples.

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
| `namespace` | yes | The artifact stem — the emitted files are `generated/<namespace>.d.ts` and `api-doc/<namespace>.json`. Either a bare stem (`defcon`) or the dotted `moduleId` (`orthographic.camera`): fork onto the retired module name when it already equals the publish namespace, and reach for a bare stem only when nothing else owns it. The `orthographic.camera` worked example below settles the choice. |
| `generated` | yes | The committed `.d.ts` output path (`generated/<namespace>.d.ts`). |
| `apiDoc` | yes | The docs-site model output path (`api-doc/<namespace>.json`). |
| `license` | no | SPDX-style license id, surfaced by the docs-site provenance block. Defaults to `""`. |
| `fidelity` | no | Defaults to `fidelity/<namespace>.json`. A fork records no fidelity artifact (see below); the field mirrors the sibling lanes for a future hand-authored target that wants one. |
| `upstreamLua` | one of two | Package-relative paths of the vendored upstream `.lua` this target's surface is measured against. See [surface parity](#4-surface-parity-against-the-upstream-lua). |
| `parityVerdict` | one of two | Why this target vendors no upstream `.lua`: `{ "reason": ..., "note": ... }`. Mutually exclusive with `upstreamLua`. |

A missing required field fails loudly, naming both the field and the offending
entry.

`upstreamLua` and `parityVerdict` are individually optional but jointly
**mandatory**: every entry declares exactly one. Neither field is in the required
list, yet an entry declaring neither — or both — fails the same way, naming the
offender. That is deliberate. A target with no declaration would otherwise sit in
the config indistinguishable from a measured-and-clean one, so the config cannot
express "nobody has looked at this yet"; you either measure the surface or record
why you cannot.

## 2. Vendor the `.d.ts` and generate the artifacts

Put the authored/forked declaration at the `authored` path. For a fork, that is a
verbatim copy of the retired library's shipped `generated/<moduleId>.d.ts`
golden — not the raw ts-defold fixture, which the ts-defold lane type-maps on the
way out (`hash`/`url`/`vmath.vector3` → `Hash`/`Url`/`Vector3`) while the authored
lane emits its input verbatim, so forking the fixture would ship upstream's Lua
type names and fail the `dts-declaration-validity` gate. The two forms coincide
when the library references no mapped core types (persist), which is why the rule
is safe to state unconditionally. For a hand-authored library, it is the
declaration you wrote. Either way it must be a
`declare module '<moduleId>'` ambient — the target form the emit passes through
unchanged. Then run the two commands from `packages/library-types`:

```sh
cd packages/library-types

bun scripts/sync-authored-types.ts --emit       # emit generated/<namespace>.d.ts — the committed types
bun scripts/sync-authored-types.ts --api-doc     # lower api-doc/<namespace>.json — the docs-site model
```

- **`--emit`** writes the vendored `.d.ts` verbatim to the
  `generated/<namespace>.d.ts` golden, for whatever stem the entry pins. There is
  no parse or transform: an authored source is already target-form, so the
  emitted surface *is* the vendored surface.
- **`--api-doc`** runs `extractApiDoc` over the vendored `.d.ts` under the pinned
  publish `namespace`, producing the `api-doc/<namespace>.json` the docs-site `/api`
  page renders. A member's `@deprecated` tag carries through to the page as a
  `Deprecated` line, with the tag's own text when it has any — so mark a
  deprecated member in the fork rather than only saying so in its prose.

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

## 4. Surface parity against the upstream Lua

The previous section holds for **types**: upstream ships none, so there is nothing
to measure a fork's type annotations against. It does *not* hold for the
**surface**. Upstream Lua declares its member names and its parameter names in
plain source, and those are comparable — a fork that never got a member, or that
dropped a trailing parameter, is measurable without any type information at all.

### Opting a target in

The upstream path is derived from `moduleId`: replace the dots with slashes and
append `.lua`, so `in.button` is `in/button.lua` and `richtext.richtext` is
`richtext/richtext.lua`. Fetch that path at the entry's pinned `ref` and vendor it
under `packages/library-types/fixtures/upstream-lua/`, at
`<repo-name>/<upstream-path>` within it, where `<repo-name>` is the last segment
of the entry's `repo` URL — so
`britzl/defold-input` at `in/button.lua` lands at
`fixtures/upstream-lua/defold-input/in/button.lua`. Vendor only the module file
the target names, never the whole repository: the digest map is per-file, and an
unused copy is dead weight the pin still has to defend.

The reader accepts two closing forms: a bare `return M`, and a callable module's
`return setmetatable(M, { … })` — on one line or spread over several, as long as it
starts at column 0. It **refuses** a metatable carrying `__index`, and one named by a
variable whose keys it cannot see, in both cases throwing rather than parsing. A
delegated member never appears at column 0, so parsing anyway would report a short
surface as the whole one and raise the target's coverage for it. An indented
`return setmetatable(instance, { … })` inside a factory function is not the module's
close and is ignored, which is what the column-0 rule buys.

List the vendored paths in `upstreamLua`, then regenerate:

```sh
bun run --cwd packages/library-types parity
```

That writes `fidelity/authored/<namespace>.json` per measured target. Both halves
of the upstream surface are compared, on two axes reported side by side. The
declared side of each is the fork's `api-doc/<namespace>.json` — the surface the
[/api](/api) page renders, so the report measures what a reader actually sees.

Only the fork's *own* members are compared. An api-doc element marked `global: true`
is a file-scope name the library installs into the environment, defined upstream in
files the target does not vendor, so it is a member of no module and enters neither
axis — calling one a phantom would describe real upstream API as invented.
`declaredGlobals` records how many were set aside: 30 for `deftest`, whose telescope
assertions are ambient, and 87 for `boom`, which declares one module member beside its
whole ambient game API.

The **callable** axis, upstream members carrying a parameter list against api-doc
`FUNCTION` elements:

| Field | What it counts |
| ----- | -------------- |
| `upstreamMembers` | Callable members the upstream module defines. |
| `declaredGlobals` | Declared names the fork installs into the environment rather than onto the module. Counted, never compared. |
| `declaredMembers` | Functions the fork declares. |
| `missingMembers` | Upstream members the fork does not declare at all. |
| `phantomMembers` | Declared members upstream does not have. |
| `arityMismatches` | Shared names whose parameter *counts* disagree, each with both numbers. Names are not compared — a fork may rename parameters freely. |
| `undocumentedMembers` | Upstream prose that reached neither the fork nor the import — a member whose accepted block carries no summary to lower, being nothing but tags or nothing but the member's own name. |
| `importedDocs` | Declared elements carrying upstream's own summary because the fork supplied none. Counted on both axes. |
| `refusedDocBlocks` | Upstream comment blocks the reader declined, no segment of them opening with `---`. Counted on both axes, and the one term that reports prose the import never saw. |
| `variadicMembers` | Shared members compared against a floor rather than an exact count, upstream being variadic. |
| `callableCoverage` | Fraction of upstream members that are declared *and* agree on arity. |

An upstream definition ending in `...` has no fixed parameter count to disagree
with, so `function M.play(...)` is compared against its *named* parameters as a
floor: the fork must declare at least them, and anything beyond is the rest.
`variadicMembers` says how many shared members that weaker check covered, so a
`callableCoverage` of 1 over a variadic surface cannot be read as fully verified.

The **field** axis, upstream constants (`M.SOME_CONSTANT = "X"`) against api-doc
`VARIABLE` elements. A `TYPEDEF` is a type rather than a runtime member and enters
neither axis:

| Field | What it counts |
| ----- | -------------- |
| `upstreamFields` | Non-callable members the upstream module defines. |
| `declaredFields` | Non-callable members the fork declares. |
| `missingFields` | Upstream constants the fork does not declare — values its users cannot reach. |
| `phantomFields` | Declared constants upstream has in neither half — names the fork invented. |
| `fieldCoverage` | Fraction of upstream fields the fork declares. |

A name that is callable on **either** side belongs to the callable axis and is
never also counted as a field, so one defect is never charged twice.
`monarch.transitions.gui` is the case that forces the rule: it declares its twelve
transitions as `VARIABLE` while upstream defines them as functions, which the
callable axis already reports as twelve `missingMembers`. Listing them as phantom
fields too would double-count and describe an upstream name as invented.

`authored-parity-floor.json` ratchets **both** axes per artifact, each against its
own floor: either may rise, neither may fall. A regeneration that lowers either
number reds the gate, and a floor entry that names only one axis is rejected at
parse time rather than leaving the other unratcheted.

**A non-empty `missingMembers`, `phantomMembers`, `arityMismatches`,
`missingFields`, or `phantomFields` is a correction to make in the fork — never a
number to re-baseline.** The measurement exists so the gap stays visible while it
is being closed; the current numbers are the honest starting point, not a target.
The vendored `.lua` copies are SHA-256-pinned for the same reason: re-vendoring at
a different upstream ref would change what every committed number means without
changing the number, so the pin must break loudly and the reports be re-measured
rather than the digest updated.

`nakama` is the worked example and the reason this exists: its fork declares 166
functions against upstream's 156, only **4** of them agree on arity, and it
declares **none** of upstream's 12 constants.

`boom` is the opposite shape: it declares **one** of the six members
`boom/boom.lua` defines, the other five being the `final`/`init`/`on_input`/
`on_message`/`update` lifecycle hooks `boom.script` calls rather than API a user
writes. The gap is real and recorded, but read it beside `declaredGlobals`: nearly
the whole library reaches its users as ambient globals, which this axis does not
measure.

### Upstream LuaDoc import

A measured target's api-doc does not stop at the fork. Where the fork leaves a
member's `brief` and `description` both empty and upstream documents it, upstream's
own LuaDoc summary is lowered into `api-doc/<namespace>.json` and rendered on
[/api](/api), marked so a reader can tell it apart from the fork's own prose.

Five rules bound it:

- **Tags never come with the summary.** The block is truncated at the first line
  starting with `@`, and a tag's unmarked continuation lines go with it. No
  parameter name, type, or `@return` text from LuaDoc ever reaches the api-doc.
- **One blank line inside a comment run does not end the block.** Upstream often
  wraps a long `@param` list around a blank line, which would otherwise truncate the
  block to its tag half and lose the summary above it. The blank is crossed only when
  the segment touching the definition opens no `---` block of its own, so a
  blank-separated section header above a documented member never merges into it, and
  only ever one blank is crossed.
- **A brief never restates its own symbol.** Where upstream writes the member's name
  as the block's first line and the summary beneath it, the name line is dropped, so
  the rendered brief is the summary rather than the symbol you are already reading. A
  first line that merely mentions the name is prose and survives; a block that is
  *only* the name imports nothing at all.
- **Fork prose always wins.** A member the fork documents — with either a `brief`
  or a `description` — keeps exactly what the fork wrote. Writing the member's
  doc-comment in the fork is therefore how you opt it out; there is no exclusion
  list, because the only thing one would add is "show no prose at all", which is
  worse than writing the correct brief.
- **The import is the api-doc's alone.** `fixtures/authored/<moduleId>.d.ts` and
  the `generated/<namespace>.d.ts` golden are untouched, so the forked-vs-generated
  identity diff still proves the emit is lossless and imported prose stays
  distinguishable from the fork's forever after.

A block whose every segment opens with a plain `--` rather than `---` is **refused**,
and counted as `refusedDocBlocks` on the target's parity report. Nothing distinguishes
such a block from a section header sitting above a run of constants — `monarch`'s
`-- transition messages` and `boom`'s `-- initialize boom` are the same shape to any
parser — so admitting the class would attach one member's heading to another's
documentation. The remedy is to author that member's doc-comment in the fork, where a
human makes the judgment and the result correctly renders as first-party. The count is
what makes the loss visible: `defmath` writes all 36 of its blocks that way.

An imported symbol's `/api` heading carries a `U` dot labelled *Documentation
imported from upstream*, beside the `G` dot an ambient global carries. The page's
provenance block already names the repo and `ref` the text came from.

### Why the two axes are never averaged

Neither number is "the" coverage of a target, and no single figure replaces them.
A module can agree completely on one axis while missing the other entirely, so
folding them into one mean would let each mask the other — exactly the reading the
split exists to prevent.

`platypus` is the worked case. It defines one module function and 14 constants, so
its `callableCoverage` is `1` over a single comparison. That figure used to sit
beside a bare count of 14 unexamined fields and a warning to read it as thin;
it now sits beside `fieldCoverage: 0.8571` and a named gap of `SEPARATION_RAYS`
and `SEPARATION_SHAPES` — a second real number rather than a caveat.

Read the two together. A perfect `callableCoverage` over a handful of functions
still says nothing about a large `upstreamFields`, and a perfect `fieldCoverage`
says nothing about arity. A phantom on either axis enters no coverage figure,
having no upstream member to be a fraction of, so it is visible only in its list.

### When a target cannot be measured

Record a `parityVerdict` instead of an empty `upstreamLua`. The `reason` comes
from a closed set — an unknown one throws, naming the entry — and the `note` must
say what was actually looked at:

| `reason` | When it applies |
| -------- | --------------- |
| `unresolved-path` | The `moduleId`-derived path does not resolve at the pinned `ref`, including a repository that no longer exists there. `starly.starly` is the corpus example: `VowSoftware/starly` returns 404 at its pinned SHA. |
| `no-module-file` | Upstream resolves, but declares no single module file this target could be measured against. |
| `unparseable-shape` | The module file exists but closes in a way the reader refuses — a metatable carrying `__index`, or one it cannot read the keys of, either of which could delegate members no column-0 scan would find. No corpus target carries this verdict: `boom.boom` and `in.accelerometer` once did, and were lifted into measurement when the reader learned the `return setmetatable(M, { __call = … })` form they close with. |

A verdict is a recorded finding, not a way to skip the work. It says someone
looked and what stopped them, which is exactly what an absent declaration cannot
say.

## 5. Cut the library over and validate

Severing ts-defold for the library is the same single-module cutover the
generated lanes use:

- Drop the library's row from `library-targets.json` and its dir from
  `library-classification.json`, and delete the retired
  `fixtures/ts-defold/<moduleId>.d.ts`. Its `generated/<moduleId>.d.ts` and
  `api-doc/<moduleId>.json` goldens are deleted only when the fork publishes under
  a *different* namespace; when `namespace` === `moduleId` they are instead
  overwritten in place by the two commands above. The namespace now resolves to
  your authored artifacts.
- Remove the `./<moduleId>` subpath from `package.json` `exports` if present —
  authored libraries carry none, matching the LuaLS libraries.
- Add `generated/<namespace>.d.ts` and `test-d/<library>-usage.test-d.ts` to the
  `include` list in `tsconfig.dts-check.json` (the `dts-declaration-validity`
  gate type-checks both under `skipLibCheck: false`), moving any hand-written
  block for the old dotted specifier into that per-library compile proof.

The ts-defold registry is now empty: every library it once carried has severed,
so `library-targets.json` holds `"targets": []`. The file stays committed anyway
— the CLI's registry loader treats a *missing* file as "no vendored libraries at
all" and would drop the LuaLS, script_api and authored lanes with it, and
`library-classification.json` pins its commit against that `source` block.

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
with the other bare-stem severed libraries. Nothing else owned `defcon`, so it was
free to take; `orthographic.camera` below is the case where it is not. The `defcon` page then attributes to
`britzl/defcon` at `2.6.0`, not the `ts-defold/library` corpus.

## Worked example — `deftest.deftest`

`britzl/deftest` (a test runner, pinned to `2.8.0`) is a second fork with the
same reference-entry shape as `defcon.console`. It illustrates one wrinkle: its
`.d.ts` declares ambient top-level globals (`describe`, `before`, `after`,
`test`, `assert_*`) alongside `declare module 'deftest.deftest'`. A fork copies
the surface **verbatim**, so those globals carry into `generated/deftest.d.ts`
and therefore into the `dts-declaration-validity` gate's compilation. That is
fine — they raise no duplicate-identifier clash — and the api-doc lowering
publishes them alongside the module's exports (`add`, `run`), each marked as an
ambient global so the reference page distinguishes what the import reaches from
what is callable without it. Do not alter a vendored fork to suppress such
globals; they are part of the library's real surface.

A file-scope *type* is held to a stricter rule than a file-scope value: it
publishes only when a published signature names it **and** it carries members
(an `interface`, or a `type` alias over an object literal). A union, a function
type, or an internal generic helper stays off the page, so a fork's incidental
type machinery does not become reference content.

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
So the cutover itself was **verbatim** — the identity diff made fidelity 100% by
construction, and it shipped no type change at all. The later and
separately-auditable edit that anticipated has since landed: the fork now also
declares `exists`, the sixth function upstream's Lua defines and ts-defold never
had.

Severing does not erase the markdown verdict. persist's `no-go`/`signature-loss`
record and its README snapshot stay exactly as recorded, and the gate still
re-derives the decision on every run — it just compares against the vendored
fork instead of the deleted `fixtures/ts-defold/` snapshot. That is sound
because the comparison is re-derived against whatever the fork now declares, not
against an identity: adding `exists` moved two name-set terms and left the
`no-go`/`signature-loss` decision exactly where it was. Keeping a dead
`library-targets.json` row alive to feed that lookup would have been the wrong
fix: it would make the file stop meaning *still ts-defold-sourced*, which is the
signal the remaining Bucket-C libraries are measured against.

## Worked example — `orthographic.camera`

`britzl/defold-orthographic` (a camera suite, pinned to tag `3.6.3`) is a second
markdown `no-go` that answered *fork*, and it settles two questions persist's
surface never raised.

**Which namespace does the fork publish under?** persist took the bare
`persist`. orthographic cannot: it is the markdown lane's one registered target,
so `generated/orthographic.d.ts` and `api-doc/orthographic.json` are already
committed regeneration proofs owned by that lane, and the `no-go` hides the bare
`orthographic` namespace from page enumeration. Forking under it would overwrite
the proofs *and* render no page. So the authored target keeps the **dotted**
`orthographic.camera` — the `nakama.engine.defold` shape — which overwrites the
retired ts-defold golden in place and leaves the route and import string
byte-identical. The rule generalizes: when the retired module name already equals
the publish namespace, fork onto it; only reach for a bare namespace when nothing
else owns it.

**Which file do you copy?** The ts-defold lane runs a type-mapping pass, so
`fixtures/ts-defold/orthographic.camera.d.ts` says `hash`/`url`/`vmath.vector3`
while the shipped `generated/` golden says `Hash`/`Url`/`Vector3`. persist's two
forms were identical, so the template never had to choose. Copy the **`generated/`
golden** — the authored lane emits its input verbatim, so forking the raw fixture
would ship ts-defold's upstream type names and fail the declaration-validity
gate. Forking the golden makes the cutover a byte-for-byte no-op, which is what
lets you prove the severance and any type correction as two separate diffs.

orthographic then took that second diff: upstream documents `follow` as accepting
one game object *or a table of them*, and the ts-defold binding typed only the
singular `target: Hash | Url`. On a file this repo now owns, widening it to
`targets: Hash | Url | (Hash | Url)[]` is a one-line edit plus a re-emit. It
moves no recorded gate number — the fidelity comparison scores member names, the
`unknown` token, parameter *count*, return `void`-ness, and optionality, and a
rename plus a union widening touches none of them.
