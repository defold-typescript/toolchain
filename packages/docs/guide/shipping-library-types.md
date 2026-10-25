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
    └── my_library.d.ts
```

- Only files directly in `types/` are read. A `.d.ts` in a subfolder, one
  whose name holds a `\`, or one anywhere else in the repository, is ignored.
- Keep `types/` outside `include_dirs`. Defold copies the shared folders into
  every project that depends on the library, and the declarations have no use
  at runtime.
- Each file installs under its own name into the project's
  `.defold-types/extensions/shipped/<repo>/` folder, and `resolve` reports each
  installed file name without `.d.ts`. A file that adds global names is not
  installed when another file is in module form (see
  [Module form, global form, or both](#module-form-global-form-or-both)).
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

A Lua `require` path is typed with a module declaration. A pure-Lua library's
path names a real module, so mark it `@noResolution` and the transpiler leaves
the `require` path as written. A native extension registers a **global table**
instead — no Lua module answers to its name, so a plain `require` of it fails
when Defold loads the script — so mark it `@globalTable`:

```ts
/** @globalTable */
declare module "my_library" {
  export interface Hit {
    id: Hash;
    position: Vector3;
  }
  export function cast(from: Vector3, to: Vector3, target?: Url): Hit | undefined;
  export function bounds(): LuaMultiReturn<[number, number]>;
}
```

A project then writes `import * as my_library from "my_library"` or
`import { cast } from "my_library"`; either import compiles to a local alias
of the `my_library` global instead of a `require`. When the global's name
differs from the module id, name it in the tag (`@globalTable b2d.body`); a
tag naming an invalid Lua global fails the build with an error giving the
file and line.

A native extension also registers a global table. A file that points the global
at the module adds a global name:

```ts
declare const my_library: typeof import("my_library");
```

A file adds global names when it holds a top-level declaration outside a
`declare module "<name>"` block, or a `declare global` block. Such a file
installs only when the library ships no module-form file. Beside a module,
`resolve` skips it: a global name collides with project code and other
libraries, and the import reaches the same API under any name the project
picks. Ship the module form; a library that ships both gives projects the
module alone.

## What `resolve` prints

When the files pass the check, the project's `resolve` run prints:

```
  my_library <- <url> (shipped types)
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

## Starting from the curated types

If your library already has types here (see
[Vendored library types](./resolve.md#vendored-library-types) and
[Curated native extensions](./resolve.md#curated-native-extensions)), export
them into your repository:

```sh
bunx @defold-typescript/cli export-types <library> [path]
```

`<library>` is the repository name, such as `defold-daabbcc`, or the URL a
project puts in `game.project`. `path` is your repository root and defaults to
the current folder.

The command writes the files `resolve` installs for the library today,
unchanged, into `<path>/types/`, and prints each one:

```
defold-typescript export-types: wrote types/daabbcc.d.ts
```

It runs the same check first, over the folder as it will be: the `.d.ts` files
directly in `types/`, with each exported file in place of the file it
overwrites. That is the file of the same name or, on a file system that ignores
letter case (macOS and Windows by default), one whose name differs only in
case, which keeps its name and is the name printed. When `resolve` would skip
an exported file, or a file it would install fails the check, the command
prints the first error and writes nothing. A curated file that relies on
another library's types fails the check this way. A file already in `types/`
that an exported file overwrites is replaced under its own name; other files
there are left alone.

A native extension's file is already in the
[module form](#module-form-global-form-or-both): a
`/** @globalTable */ declare module "daabbcc"` that projects reach with
`import * as daabbcc from "daabbcc"`. The namespaces that were globals in
v0.53.0 (`daabbcc`, `share`, `uuid4` and `tile_raycast`) also declare a
deprecated `declare const daabbcc: typeof import("daabbcc")`, so a project
still calling the global keeps compiling. That line makes the file add a
global name, so it installs only while `types/` holds no module-form file;
delete it once your users import the module.

Once a release carries the `types/` folder, projects that depend on that
release get your shipped types. The curated copy is then retired here in a
reviewed change. A project still on an older release of your library loses
the curated types at that point, until it updates the dependency.

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
