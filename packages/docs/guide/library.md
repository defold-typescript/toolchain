---
toc-title: library
---
# library

`library` works on library data: the per-library folders `resolve` prints its
library declarations from. `library check` checks a directory of that data the
way the running CLI reads it, so you can validate library data you are editing
without a toolchain checkout.

```sh
bunx @defold-typescript/cli library check --data path/to/library-data
```

## What `library check` runs

It runs three checks in order, and a check that fails stops the ones after it:

1. **Data** — the reader that `resolve` uses accepts the data folder: each
   library folder is named for its repo, has a `reviewed.json`, and lists
   complete entries; every module id and native namespace is a plain name
   (letters, digits, `_`, `.` and `-`, not starting with `.` or `-`), as is
   every LuaLS `namespace`; every path an entry names stays inside its library
   folder, and every `apiDoc` stays under `api-doc/`; and no module is named by
   two libraries.
2. **Print** — every module the data serves prints, as `resolve` prints it
   when a project's dependency archive is not at hand.
3. **Compile** — one TypeScript program compiles every printed declaration,
   every native-extension declaration and every `usage/` example together,
   against the engine types this CLI ships. It runs with `skipLibCheck: false`,
   `strict`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, so a
   declaration that passes also compiles in a scaffolded project. A declared
   file TypeScript cannot load, because it is missing or is not a TypeScript
   file, is a problem of its library.

The engine types (`@defold-typescript/types`) and the language extensions
(`@typescript-to-lua/language-extensions`) that a usage example references come
from this CLI's own install. `library check` never reads a `node_modules` beside
the data, and any other bare import in the data resolves only to a module the
printed declarations declare.

## `--data`

`--data <dir>` names a directory of version-named data folders (`0.55.0/`,
`0.56.0/`, ...). `library check` reads the one this CLI reads, by the same rule
as [`resolve --library-data`](./resolve.md#flags): the highest folder at or
below the CLI version. A relative `<dir>` resolves against the working
directory. A `<dir>` with no folder for this CLI version is an error.

## `--api-doc-out`

`--api-doc-out <dir>` writes the API model of every library in the data folder
to `<dir>`, the JSON files the docs site renders:

```sh
bunx @defold-typescript/cli library check --data path/to/library-data --api-doc-out path/to/api-doc
```

It writes only after every check passes, so a failing run leaves `<dir>` as it
was. A relative `<dir>` resolves against the working directory, and `<dir>` is
created if it is missing. Files already in `<dir>` that the run does not write
stay in place. Each model reads only the data folder, and two entries naming
the same output file is an error.

## Problems and the exit code

A clean data folder prints one line and exits `0`:

```text
defold-typescript library check: /path/to/library-data/0.55.0: 81 libraries, no problems
```

Otherwise each problem prints on its own line as
`<library>: <check>: <message>`, followed by a summary error, and the command
exits `1`:

```text
flow: compile: usage/flow-usage.test-d.ts:12 Property 'erase' does not exist on type 'typeof import("flow.ui")'.
defold-typescript library check: error: 1 problem in /path/to/library-data/0.55.0
```

`<library>` is the library folder. `<check>` is `data`, `print` or `compile`.
A `compile` message starts with the file and line, relative to the library
folder: a fork or a native declaration names its own file, a usage example its
`usage/` path, and a module printed from upstream sources
`printed/<module>.d.ts`. A `print` message starts with the module that did not
print.

## JSON output

With `--json`, `library check` writes one object:

```json
{
  "command": "library",
  "ok": false,
  "error": "library check: 1 problem in /path/to/library-data/0.55.0",
  "subcommand": "check",
  "dataFolder": "/path/to/library-data/0.55.0",
  "problems": [
    { "library": "flow", "check": "compile", "message": "usage/flow-usage.test-d.ts:12 ..." }
  ]
}
```

A clean run has `"ok": true`, an empty `problems` array, `libraryCount`, the
number of libraries the folder holds, and `written`, the absolute path of each
file `--api-doc-out` wrote.
