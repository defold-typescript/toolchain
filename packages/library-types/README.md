# @defold-typescript/library-types

Vendored TypeScript types for popular Defold Lua libraries, adapted from
[ts-defold/library](https://github.com/ts-defold/library) (MIT) so they type-check
against `@defold-typescript/types` instead of `@ts-defold/types`.

ts-defold's hand-written `declare module` files already model these libraries
faithfully; the only surface that differs is core-type naming. This package
re-derives them with a single automated rename and locks the result with a
type-level proof.

## Layout

- `library-targets.json` — the pinned ts-defold/library commit and the source
  path for each vendored module. This is the reproducibility baseline.
- `fixtures/ts-defold/` — the upstream `.d.ts` files, committed verbatim at the
  pinned revision. Never edited by hand; excluded from Biome.
- `scripts/sync-library-types.ts` — `codemodDeclaration`, the core-type rename,
  plus `regenerate`, which reads each fixture and writes `generated/`.
- `generated/` — the renamed, publishable `declare module` files.
- `test-d/library-types.test-d.ts` — the type-level proof that every generated
  module compiles against `@defold-typescript/types`.

## Core-type rename

`codemodDeclaration` walks the TypeScript AST and rewrites **type references
only** — property names, JSDoc, `declare module`, and passthrough extensions
(`LuaMultiReturn`, `LuaMap`) are left byte-identical. ts-defold's global
core-type names map to our surface:

| ts-defold | `@defold-typescript/types` |
| --------- | -------------------------- |
| `hash`, `url` | `Hash`, `Url` |
| `vmath.vector3` / `vmath.vector4` / `vmath.matrix4` / `vmath.quat` | `Vector3` / `Vector4` / `Matrix4` / `Quaternion` |
| `node`, `texture`, … (engine handles) | `Opaque<"node">`, `Opaque<"texture">`, … |

The renamed names resolve against the ambient globals declared in
`@defold-typescript/types` `engine-globals.d.ts`, so no import injection is
needed. `table` is intentionally **not** renamed: ts-defold modules declare their
own local `type table = {}` alias. Any `vmath.*` reference with no mapping is
reported by `regenerate` (a hard error) so a missing rename fails loud.

## Regenerate

```sh
bun run --filter @defold-typescript/library-types regen
```

Run after changing the rename table or re-capturing fixtures. The generated
output is committed.
