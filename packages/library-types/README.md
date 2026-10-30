# @defold-typescript/library-types

Vendored TypeScript type declarations for a curated set of popular Defold Lua
libraries, core-type-renamed against
[`@defold-typescript/types`](https://www.npmjs.com/package/@defold-typescript/types).

This is a support package for the
[`@defold-typescript`](https://github.com/defold-typescript/toolchain) toolchain.
You normally do not install it directly — it ships as a dependency of
[`@defold-typescript/cli`](https://www.npmjs.com/package/@defold-typescript/cli),
which reads it at runtime.

## Why it exists

Many popular Defold libraries are plain Lua, installed through the editor's
**Fetch Libraries** and carrying no `.script_api`, so there is nothing for the
CLI's `resolve` command to extract types from. For a curated set of those, this
package ships hand-vetted, ready-to-use TypeScript declarations.

When `resolve` encounters a declared dependency with no `.script_api`, it matches
it against this corpus by source identity, verifies the match against the
downloaded archive's Lua require paths, and prints the corresponding
declarations into the project's `.defold-types/libraries/` from the archive the
project depends on, or from the sources pinned here. The import specifier is
the Lua `require` path — e.g. `import * as dicebag from 'dicebag.dicebag'` — so it
matches what Fetch Libraries installs at runtime.

## What's inside

This package holds the inputs the CLI prints declarations from, and no printed
declarations.

- `data/<version>/` — library data, in folders named by the first CLI version
  that reads them. A CLI reads the highest folder at or below its own version.
  Each folder holds:
  - `luals-targets.json`, `script-api-targets.json`, `authored-targets.json` —
    one entry per library module: its upstream repository, pinned ref, license,
    and the `namespace` it is published under.
  - `fixtures/luals/`, `fixtures/script-api/`, `fixtures/authored/` — the pinned
    upstream sources, or the hand-written declaration fork, each module prints
    from; `fixtures/upstream-lua/` and `fixtures/upstream-native/` hold the
    upstream files the parity checks measure against.
  - `native/<namespace>.d.ts` and `native-targets.json` — the hand-written
    declarations of native extensions that ship no `.script_api`, which
    `resolve` installs as written.
  - `index-slot-classifications.json` — the base each library index slot counts
    from.
- `library-classification.json`, `library-targets.json` — the ts-defold/library
  registries the classification tooling keeps.
- `api-doc/<module>.json` — ref-doc JSON extracted from each declaration, consumed
  by the documentation site to render per-library API pages.
- `NOTICE` — upstream attribution for every vendored library.

## Provenance

The CLI prints each module through the lane its target file names: LuaLS
annotations, a `.script_api`, or a hand-written declaration fork. Many forks
descend from [`ts-defold/library`](https://github.com/ts-defold/library) (MIT)
at the commit pinned in `library-targets.json`. ts-defold's hand-written
`declare module` files already model these libraries faithfully; the only
surface that differs is core-type naming. A codemod
(`packages/cli/src/library/sync-library-types.ts`) walks the TypeScript AST and
rewrites **type references only** — property names, JSDoc, `declare module`, and
passthrough extensions (`LuaMultiReturn`, `LuaMap`) stay byte-identical:

| ts-defold | `@defold-typescript/types` |
| --------- | -------------------------- |
| `hash`, `url` | `Hash`, `Url` |
| `vmath.vector3` / `vmath.vector4` / `vmath.matrix4` / `vmath.quat` | `Vector3` / `Vector4` / `Matrix4` / `Quaternion` |
| `node`, `texture`, … (engine handles) | `Opaque<"node">`, `Opaque<"texture">`, … |

The renamed names resolve against the ambient globals in `@defold-typescript/types`,
so no import injection is needed. Any `vmath.*` reference with no mapping is a hard
error, so a missing rename fails loud rather than degrading to `any`.

Check every target's printed declarations after changing a lane or re-pinning a
source:

```sh
bun test packages/cli/src/library
```

## Direct use

This package exposes no declarations of its own: the CLI prints them from the
inputs here. Let `@defold-typescript/cli resolve` write them into your project;
see the [toolchain docs](https://github.com/defold-typescript/toolchain).

## License

MIT. Vendored declarations retain their upstream authors' licenses, credited in
`NOTICE`.
