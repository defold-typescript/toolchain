---
toc-title: Authoring LuaLS library types
---
# Authoring LuaLS library types

Some pure-Lua Defold libraries ship their own type information as inline
[LuaLS](https://luals.github.io/) (`---@`) annotations rather than a `.script_api`.
This toolchain generates TypeScript declarations for them from those annotations
and commits the result into `@defold-typescript/library-types`, so a consumer that
declares the library gets autocomplete and `tsc` coverage with no hand-written
`.d.ts`. [`resolve`](./resolve.md#vendored-library-types) then materializes the
committed declaration into the consumer's project.

Adding such a library is **data, not code**: you add one entry to
`packages/library-types/luals-targets.json`, run the four generation commands, and
commit the emitted artifacts. There is no pipeline source to touch — the same
front-end that produces the druid types produces yours.

> This page is for **library-type authors** working inside this repository. If you
> only want to *use* a vendored library in your own game, you need nothing here —
> just declare the dependency and run [`resolve`](./resolve.md).

## Is your library a LuaLS target?

Two facts decide it:

- **It is plain Lua** (installed via Defold's **Fetch Libraries**, no
  `.script_api`), and
- **its source carries inline `---@` annotations** — `---@class`, `---@field`,
  `---@param`, `---@return` on the public module.

A hand-written library with no annotations is not a LuaLS target; those are
maintained as hand-vendored `.d.ts` files elsewhere in `library-types`. A library
whose annotations are sparse (near-zero fidelity coverage, see below) will emit a
hollow surface and is not worth adding.

The library's runtime `require` path (its `moduleId`) must not already be claimed
by another entry in `library-types` — two front-ends emitting the same module
would collide.

## 1. Add a `luals-targets.json` entry

Each entry pins its own repository and tag — a LuaLS library ships no `.d.ts`, only
annotations, and each lives in its own repo at its own release. The fields:

| Field | Required | What it is |
| ----- | -------- | ---------- |
| `repo` | yes | The GitHub repository URL, e.g. `https://github.com/Insality/druid`. |
| `ref` | yes | The exact release tag to pin. Resolve the newest stable tag (`git ls-remote --tags <repo>`) — never invent one. |
| `sourceGlobs` | yes | Globs selecting the `.lua` files to snapshot, relative to the repo root (e.g. `["druid/**/*.lua"]`). |
| `moduleId` | yes | The library's runtime `require` path, dotted (e.g. `druid.druid`). This names the emitted `declare module` and scopes the module-function surface to `<moduleId-as-path>.lua`. |
| `namespace` | yes | The artifact stem — the emitted files are `generated/<namespace>.d.ts`, `fidelity/<namespace>.json`, `api-doc/<namespace>.json`. |
| `license` | no | SPDX-style license id, surfaced by the docs-site provenance block. Defaults to `""`. |
| `typeRenames` | no | Map from a LuaLS type name to the TypeScript name to emit (e.g. `{ "vector3": "Vector3" }`). Omit or `{}` when the library references no renamed types. |
| `ignore` | no | Globs excluded from `sourceGlobs` — tests, examples, editor widgets. Defaults to `[]`. |

A missing required field fails loudly, naming both the field and the offending
entry.

## 2. Generate the artifacts

Run the four commands from `packages/library-types`, in order. Each iterates every
target in `luals-targets.json`, so an unchanged entry re-emits byte-for-byte and
only your new entry produces new files.

```sh
cd packages/library-types

bun run luals:fetch      # snapshot the pinned sources into fixtures/luals/<namespace>/
bun run luals:fidelity   # build fidelity/<namespace>.json — the coverage report
bun run luals:emit       # emit generated/<namespace>.d.ts — the committed types
bun run luals:api-doc    # lower api-doc/<namespace>.json — the docs-site model
```

- **`luals:fetch`** reads the pinned tree, applies `sourceGlobs` minus `ignore`,
  and writes each selected `.lua` under `fixtures/luals/<namespace>/`, preserving
  tree shape. This is the only command that touches the network; everything after
  it reads those committed fixtures, so the pipeline is reproducible offline.
- **`luals:fidelity`** parses the fixtures and reports how much of the surface
  resolved to a known type (see below).
- **`luals:emit`** produces the `.d.ts` a consumer eventually sees. Interfaces and
  aliases come from the whole snapshot; the module's own functions come only from
  the `moduleId` file.
- **`luals:api-doc`** lowers the same model to the JSON the docs-site `/api` page
  renders.

## 3. Read the fidelity report

`fidelity/<namespace>.json` tells you whether the emit is worth committing:

- **`coverage`** — the fraction of type tokens that resolved to a known type. Druid
  sits around `0.9`; a healthy new library lands in the same range. Near-zero means
  the source is not meaningfully annotated — reconsider the target.
- **`unknownTokens`** — the distinct type names that fell back to `unknown`. Cross-
  library references (another Insality module) and generic placeholders (`_`,
  `function`) are expected here and are safe fallbacks. A rename that *should* have
  applied shows up as an unexpected entry — fix `typeRenames` and re-emit.
- **`undocumentedMembers`** — members with no annotation at all; informational.

## 4. Validate, then commit

The emitted `.d.ts` is type-checked under `skipLibCheck: false` by the
`dts-declaration-validity` gate, and the byte-for-byte emit and fidelity parity are
gated per namespace — so add your `generated/<namespace>.d.ts` to the
`include` list in `packages/library-types/tsconfig.dts-check.json`, then run the
package tests:

```sh
bun test          # from packages/library-types
bun run typecheck  # from the repo root
```

Commit the new entry, the snapshotted `fixtures/luals/<namespace>/`, and all three
emitted artifacts (`generated/`, `fidelity/`, `api-doc/`) together. Every commit
must also add a [changelog](./changelog.md) bullet — a pre-commit gate enforces it.

## Worked example — druid

The druid entry is the reference shape:

```json
{
  "repo": "https://github.com/Insality/druid",
  "ref": "1.2.5",
  "license": "MIT",
  "sourceGlobs": ["druid/**/*.lua"],
  "moduleId": "druid.druid",
  "namespace": "druid",
  "typeRenames": {
    "vector": "Vector",
    "vector3": "Vector3",
    "vector4": "Vector4"
  },
  "ignore": ["**/test/**", "**/example/**", "**/example_*/**"]
}
```

`sourceGlobs` snapshots the whole `druid/` tree; `ignore` drops its tests and
examples; `moduleId` `druid.druid` scopes the exported functions to
`druid/druid.lua` while the interfaces merge from every file; `typeRenames` maps
druid's vmath references onto the toolchain's branded `Vector*` types. Running the
four commands emits `generated/druid.d.ts`, which
[`resolve`](./resolve.md#vendored-library-types) materializes into a consuming
project as `druid.druid`.
