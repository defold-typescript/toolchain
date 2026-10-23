---
toc-title: Shipping types with a library
---
# Shipping types with a library

A Defold library can ship its own TypeScript declarations. When a project
declares the library in `game.project` and runs [`resolve`](./resolve.md),
those declarations are installed as they are, ahead of anything this toolchain
would otherwise generate or curate for the library. You keep the types in step
with the library, in the same repository, with no entry here.

This page is for **library authors**. If you only use a library, see
[Types a library ships](./resolve.md#types-a-library-ships).

## Where the files go

Put `.d.ts` files in a `types/` folder at the repository root, beside
`game.project`:

```
my-library/
├── game.project
├── my_library/        # the folder [library] include_dirs shares
│   └── ...
└── types/
    ├── my_library.d.ts
    └── my_library.global.d.ts
```

- Only files directly in `types/` are read. A `.d.ts` in a subfolder, one
  whose name holds a `\`, or one anywhere else in the repository, is ignored.
- Keep `types/` outside `include_dirs`. Defold copies the shared folders into
  every project that depends on the library, and the declarations have no use
  at runtime.
- Every file installs, under its own name, into the project's
  `.defold-types/extensions/shipped/<repo>/` folder, and `resolve` reports each
  file name without `.d.ts`.
- The files keep their names, so they may reference each other by relative
  path (`export * from "./foo"`, `typeof import("./index")`), and an
  `index.d.ts` is fine.

## Which type names to use

The files are compiled against
[`@defold-typescript/types`](/api), so use its names: `Hash`, `Vector3`,
`Vector4`, `Quaternion`, `Url`, and engine functions such as `buffer.create`
reached through `typeof`. Lua multiple returns are `LuaMultiReturn<[...]>`.

ts-defold's names are not declared there. `hash` is a function rather than a
type, and `vmath.vector3` is a function rather than a type, so a file that
writes `h: hash` or `v: vmath.vector3` fails the check.

## Module form, global form, or both

A Lua `require` path is typed with a module declaration. For a native
extension, mark it `@noResolution` so the transpiler leaves the `require` path
as written:

```ts
/** @noResolution */
declare module "my_library" {
  export interface Hit {
    id: Hash;
    position: Vector3;
  }
  export function cast(from: Vector3, to: Vector3, target?: Url): Hit | undefined;
  export function bounds(): LuaMultiReturn<[number, number]>;
}
```

A project then writes `import * as my_library from "my_library"`.

A native extension also registers a global table. To type it with no import,
add a second file that points the global at the module:

```ts
declare const my_library: typeof import("my_library");
```

Ship one form or both. Every file in `types/` installs, so shipping both lets a
project either import the module or use the global.

## What `resolve` prints

When the files pass the check, the project's `resolve` run prints:

```
  my_library, my_library.global <- <url> (shipped types)
```

and `resolve --json` marks the dependency `typeSurface: "shipped"`.

When a file fails the check, the project gets what it would get without a
`types/` folder (a `.script_api` namespace, a curated declaration, or nothing),
and `resolve` prints a warning with the first error and how many more there
are:

```
defold-typescript resolve: warning: shipped types from <url> do not compile against @defold-typescript/types; using what the archive declares otherwise: my-library-main/types/my_library.d.ts(3,27): 'hash' refers to a value, but is being used as a type here. Did you mean 'typeof hash'?
```

The check covers the engine surface only. Each dependency's files are checked
on their own, so a file cannot rely on another dependency's types.

## Checking your files

Check the files from a project that depends on the library:

1. Point the dependency at a branch or commit that carries the `types/` folder.
2. Run `bunx @defold-typescript/cli resolve` in the project.
3. Confirm the line ends in `(shipped types)` and no `shipped types from`
   warning is printed.
4. Run `bunx tsc --noEmit` in the project to see the declarations in use.

A project that copied your `types/` files into its own sources by hand deletes
those copies once `resolve` installs them. Otherwise each name is declared
twice: a second `declare const` is TS2451, and a second exported type alias is
TS2300.
