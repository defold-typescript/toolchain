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
downloaded archive's Lua require paths, and materializes the corresponding
declaration into the project's `.defold-types/libraries/`. The import specifier is
the Lua `require` path — e.g. `import * as dicebag from 'dicebag.dicebag'` — so it
matches what Fetch Libraries installs at runtime.

## What's inside

- `generated/<module>.d.ts` — one ambient `declare module '<require-path>'` per
  vendored module, core-type-renamed to the `@defold-typescript/types` surface.
- `library-classification.json`, `library-targets.json` — the registries mapping
  each module to its upstream source and generated path. The CLI reads these to
  drive matching and materialization.
- `api-doc/<module>.json` — ref-doc JSON extracted from each declaration, consumed
  by the documentation site to render per-library API pages.
- `NOTICE` — upstream attribution for every vendored library.

## Provenance

Declarations are adapted from
[`ts-defold/library`](https://github.com/ts-defold/library) (MIT) at a pinned
commit, recorded per module in `library-targets.json`. ts-defold's hand-written
`declare module` files already model these libraries faithfully; the only surface
that differs is core-type naming. A codemod (`scripts/sync-library-types.ts`)
walks the TypeScript AST and rewrites **type references only** — property names,
JSDoc, `declare module`, and passthrough extensions (`LuaMultiReturn`, `LuaMap`)
stay byte-identical:

| ts-defold | `@defold-typescript/types` |
| --------- | -------------------------- |
| `hash`, `url` | `Hash`, `Url` |
| `vmath.vector3` / `vmath.vector4` / `vmath.matrix4` / `vmath.quat` | `Vector3` / `Vector4` / `Matrix4` / `Quaternion` |
| `node`, `texture`, … (engine handles) | `Opaque<"node">`, `Opaque<"texture">`, … |

The renamed names resolve against the ambient globals in `@defold-typescript/types`,
so no import injection is needed. Any `vmath.*` reference with no mapping is a hard
error at regeneration time, so a missing rename fails loud rather than degrading to
`any`. Nothing is authored by hand beyond the source pins, and the committed output
is guarded against drift in CI.

Regenerate after changing the rename table or re-pinning a source:

```sh
bun run --filter @defold-typescript/library-types regen
```

## Direct use

The `exports` map exposes each module under a type-only subpath if you want a
single library's declarations without the CLI. These are ambient type declarations
only — there is no runtime code in this package. For the normal workflow, prefer
letting `@defold-typescript/cli resolve` materialize them for you; see the
[toolchain docs](https://github.com/defold-typescript/toolchain).

## License

MIT. Vendored declarations retain their upstream authors' licenses, credited in
`NOTICE`.
