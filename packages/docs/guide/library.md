---
toc-title: library
---
# library

`library` works on library data: the per-library folders `resolve` prints its
library declarations from. `library add` starts a library's folder from the URL a
game would depend on, and `library check` checks a directory of that data the way
the running CLI reads it, so you can write and validate library data without a
toolchain checkout.

```sh
bunx @defold-typescript/cli library add https://github.com/owner/mylib/archive/refs/tags/1.2.3.zip --data path/to/library-data
bunx @defold-typescript/cli library check --data path/to/library-data
```

## What `library add` writes

`library add <url> --data <dir>` downloads the archive and writes one folder,
named for the repository, into the data folder `library check` reads:

| File | When | What it holds |
| ---- | ---- | ------------- |
| `library.json` | always | `repo`, and `license` when the first line of the archive's `LICENSE` names MIT, Apache-2.0, BSD 2- or 3-Clause or Zlib. |
| `reviewed.json` | always | `ref`: the tag the URL names, or the commit a branch URL's archive was packed from. |
| `recipe.json` | when the library can generate a module | A starting entry, chosen below. |
| `source/` | with `recipe.json` | The upstream files that entry reads, at the paths a later re-pin writes. |

`<url>` is a `<repo>/archive/<ref>.zip` URL. A `refs/heads/` name, `master` and
`main` are branches and pin the commit; any other name is read as a tag. A branch
archive that names no commit is an error, so use a tag URL for it.

A folder that already exists, including one created during the download, is an
error and stays as it was.

What the archive shares under its `[library] include_dirs` picks the recipe,
leaving out example, test, demo and sample directories:

| The archive holds | `library add` writes |
| ------------------ | -------------------- |
| A `.script_api` file with a Lua module at `<include_dir>/<name>.lua` | A `scriptApi` entry, `moduleId` `<include_dir>.<name>`, per file. |
| A `.script_api` file with no such module | No entry: it documents a native global, and [`resolve` types it](./extensions.md) from the dependency's own archive. |
| Lua with `---@` annotations | One `luals` entry for `<include_dir>/<include_dir>.lua`, else the first annotated file. See [Authoring LuaLS library types](./authoring-luals-library-types.md). |
| An `ext.manifest`, or Lua with no annotations | No recipe. See [Authoring forked library types](./authoring-forked-library-types.md). |

The command prints the folder it wrote, anything left to do by hand, and the
`library check` command to run next. That first check reports each generated
module's missing coverage floor and the value it measured; see
[Coverage floors](#coverage-floors).

An archive that declares no `include_dirs`, an entry that steps out of its folder
and a module another library already names are errors, and leave the data folder
as it was. With `--json`, `library` names the folder, `written` holds its absolute
path and `warnings` holds the notes.

## What `library check` runs

It runs four checks in order, and a check that fails stops the ones after it:

1. **Data** — the reader that `resolve` uses accepts the data folder: each
   library folder is named for its repo, has a `reviewed.json`, and lists
   complete entries; every module id and native namespace is a plain name
   (letters, digits, `_`, `.` and `-`, not starting with `.` or `-`), as is
   every LuaLS `namespace`; every path an entry names stays inside its library
   folder, and every `apiDoc` stays under `api-doc/`; every `floors` and
   `parityExceptions` key names a module its library measures; and no module is
   named by two libraries.
2. **Print** — every module the data serves prints, as `resolve` prints it
   when a project's dependency archive is not at hand.
3. **Compile** — one TypeScript program compiles every printed declaration,
   every native-extension declaration and every `usage/` example together,
   against the engine types this CLI ships. It runs with `skipLibCheck: false`,
   `strict`, `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`, so a
   declaration that passes also compiles in a scaffolded project. A declared
   file TypeScript cannot load, because it is missing or is not a TypeScript
   file, is a problem of its library.
4. **Floor** — every module's coverage, measured from the library's own files,
   meets its floor in the library's `library.json`. See
   [Coverage floors](#coverage-floors).

The engine types (`@defold-typescript/types`) and the language extensions
(`@typescript-to-lua/language-extensions`) that a usage example references come
from this CLI's own install. `library check` never reads a `node_modules` beside
the data, and any other bare import in the data resolves only to a module the
printed declarations declare.

## Coverage floors

Each library's `library.json` holds its floors in `floors`, keyed by module id,
and by namespace for a native extension:

```json
{
  "repo": "https://github.com/owner/mylib",
  "floors": {
    "mylib.generated": 0.98,
    "mylib.fork": { "callable": 1, "field": 1 }
  }
}
```

| Module | Floor | What is measured |
| ------ | ----- | ---------------- |
| Generated from LuaLS annotations or a `.script_api` file | a ratio | The share of its type tokens that map to a known type. |
| A fork that lists `upstreamLua` | `{ "callable", "field" }` | Its upstream members declared at the right parameter count, and its upstream fields declared. The library's `parityExceptions` count as declared. See [Surface parity](./authoring-forked-library-types.md#4-surface-parity-against-the-upstream-lua). |
| A native extension | `{ "callable", "field" }` | The functions, methods and constants its C++ registers that its declaration names. A wrong module name or parameter count is a problem at any coverage. |

A module below its floor is a problem, and so is a module with no floor or one
that cannot be measured. A fork that records a `parityVerdict` vendors no
upstream to measure against, so it takes no floor. `library check` measures
every module afresh, so it reads no committed report and nothing outside
`--data`.

## `--data`

`--data <dir>` names a directory of version-named data folders (`0.55.0/`,
`0.56.0/`, ...). `library check` and `library add` use the one this CLI reads, by
the same rule as [`resolve --library-data`](./resolve.md#flags): the highest
folder at or below the CLI version. A relative `<dir>` resolves against the
working directory. A `<dir>` with no folder for this CLI version is an error.

## `--api-doc-out`

`--api-doc-out <dir>` writes the API model of every library in the data folder
to `<dir>`, the JSON files the docs site renders:

```sh
bunx @defold-typescript/cli library check --data path/to/library-data --api-doc-out path/to/api-doc
```

It writes only after every check passes, so a failing run leaves `<dir>` as it
was. A relative `<dir>` resolves against the working directory, and `<dir>` is
created if it is missing. Files already in `<dir>` that the run does not write
stay in place. Each model reads only the data folder and stays under `<dir>`.
Entries that name one output file, including paths that differ only by case or a
file also used as a folder, fail before anything is written.

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

`<library>` is the library folder. `<check>` is `data`, `print`, `compile` or
`floor`.
A `compile` message starts with the file and line, relative to the library
folder: a fork or a native declaration names its own file, a usage example its
`usage/` path, and a module printed from upstream sources
`printed/<module>.d.ts`. A `print` message starts with the module that did not
print, and a `floor` message with the module it measured.

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
