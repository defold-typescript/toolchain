---
toc-title: library
---
# library

`library` works on library data: the per-library folders `resolve` prints its
library declarations from. `library add` starts a library's folder from the URL a
game would depend on, and `library check` checks a directory of that data the way
the running CLI reads it, so you can write and validate library data without a
toolchain checkout. `library update` finds what each library's upstream has published
since its pin. Library data is added by a PR to
[`defold-typescript/toolchain`](https://github.com/defold-typescript/toolchain)
under `packages/library-types/data/`, and published from there to
[`defold-typescript/library-data`](https://github.com/defold-typescript/library-data).

```sh
bunx @defold-typescript/cli library add https://github.com/owner/mylib/archive/refs/tags/1.2.3.zip --data path/to/library-data/data
bunx @defold-typescript/cli library check --data path/to/library-data/data
```

## What `library add` writes

`library add <url> --data <dir>` downloads the archive and writes one folder,
named for the repository, into the data folder `library check` reads:

| File | When | What it holds |
| ---- | ---- | ------------- |
| `library.json` | always | `repo`, and `license` when the first line of the archive's `LICENSE` names MIT, Apache-2.0, BSD 2- or 3-Clause or Zlib. You can add [`follows`](#what-library-update-does) by hand. |
| `reviewed.json` | always | `ref`: the tag the URL names, or the commit a branch URL's archive was packed from. `reviews`: [the archive's hashes](#what-library-review-records) and its commit. |
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
| Lua with `---@` annotations | One `luals` entry for `<include_dir>/<include_dir>.lua`, else the first annotated file. See [Authoring LuaLS library types](https://defold-typescript.github.io/library-data/guides/authoring-luals-library-types). |
| An `ext.manifest`, or Lua with no annotations | No recipe. See [Authoring forked library types](https://defold-typescript.github.io/library-data/guides/authoring-forked-library-types). |

The command prints the folder it wrote, anything left to do by hand, and the
`library check` command to run next. That first check reports each generated
module's missing coverage floor and the value it measured; see
[Coverage floors](#coverage-floors).

An archive that declares no `include_dirs`, an entry that steps out of its folder
and a module another library already names are errors, and leave the data folder
as it was. With `--json`, `library` names the folder, `written` holds its absolute
path and `warnings` holds the notes.

## What `library review` records

`library review --data <dir>` downloads `<repo>/archive/<ref>.zip` for each library
and adds what it finds to `reviews` in that library's `reviewed.json`.
`library review <name> --data <dir>` does this for one library, named by its folder.
Each entry holds the commit the archive names and three hashes over the files the
archive shares under its `include_dirs`:

| Hash | Moves when |
| ---- | ---------- |
| `api` | A Lua member is added or removed, a parameter changes, or a `---@` line changes. Any change to a `.script_api` or C-family file, or to a Lua file with a shape the reader cannot follow, also moves it. |
| `doc` | A `---` line that is not `---@` changes. |
| `source` | Any shared file changes. |

`members` holds one short hash per member, so two entries can show what differs.
`api` does not read function bodies or constant values, so a change to what an
unannotated function returns moves `source` alone.

A Lua file counts whole, under one `members` key named by its path, when the reader
cannot follow how it builds its table. That covers a definition or assignment off
column 0, a nested or bracketed one (`function M.sub.start()`, `M["start"] = ...`), a
multiple assignment, a member whose value names something defined elsewhere
(`M.start = start`), and a module that reads no members. Its `api` then moves on any
change except to a comment that is not `---@`.

An archive whose hashes match an entry adds its commit to that entry, and any other
archive adds a new entry. A repeat run changes nothing. `library check` requires no
review, so a repository that has since gone never fails a data PR.

A name the data folder does not hold is an error before any download. A library
whose archive fails is reported by name and the others are still written, and the
command exits 1. A failed download counts as a failure even when a cached copy exists,
and leaves that library's `reviewed.json` untouched.

## What `library update` does

`library update --data <dir>` asks each library's forge, GitHub or Codeberg, what is
newer than its pin. `library update <name> --data <dir>` does this for one library,
named by its folder. `follows` in `library.json` says what to watch:

| `follows` | New commits are |
| --------- | --------------- |
| `tags` | The commits of tags in the pin's series dated after it. `v1.2` is in the series of `v1.1`, and `editor.9` is not in the series of `runtime.8`. The default for a `ref` that is not a commit. |
| `branch` | The head of the default branch, unless it is the pin. The default for a `ref` that is a commit. |
| `none` | None. The library is held and no request is made. |

A commit a review already lists is skipped with no download. Each other commit's
archive is downloaded by its commit, so a tag that moves cannot change what is hashed,
and hashed as [`library review`](#what-library-review-records) hashes it. When all the
hashes match a review, the commit is added to that review, and `ref` stays as it was.

When they do not, the newest such commit moves the library. `ref` becomes its tag, or
the commit itself for a library following a branch, and its hashes go in a new review.
Older commits that differ stay unrecorded, because the data was never checked against
them. The upstream files the library reads are copied from that commit's archive:

- A recipe's LuaLS module has its `source/<namespace>/` folder replaced by what its
  globs select, so a file upstream removed leaves.
- A recipe's `.script_api` module has its `source/<moduleId>.script_api` file replaced.
- Each file under `source/upstream/`, which forks and native extensions read, is
  replaced from the same path in the archive.

`fork/`, `usage/`, `library.json` and `recipe.json` are never written, so run
[`library check`](#what-library-check-runs) afterwards to see whether a fork still fits.

Each library reads as one of these:

| Status | Meaning |
| ------ | ------- |
| `held` | It follows `none`. |
| `current` | Nothing new upstream. |
| `recorded` | Every new commit was added to a review. |
| `regenerated` | The library moved to the newest commit whose hashes no review holds. |

A regenerated library also reports `change`, comparing the new hashes with the review
of this CLI's hash version that lists the pinned commit, wherever it sits in the list:

| `change` | Meaning |
| -------- | ------- |
| `kept` | The `api` hash held: only doc comments or function bodies moved. |
| `added` | Every old member held its hash and new ones exist. |
| `changed` | A member was removed or changed, or no single review lists the pinned commit, so there is nothing to compare with. |

A pinned tag's commit is the one upstream names for it today, so a moved tag compares
with nothing until a review lists its new commit.

`members` lists what `added`, `removed` and `changed`. `---@` annotations and whole
files count as members, so a moved annotation reads `changed`. This says only what
upstream did, not whether a fork still covers it.

A name the data folder does not hold is an error before any request. A library that
cannot be read, such as one whose pinned tag upstream no longer lists or whose download
fails, is reported by name, keeps its folder untouched, and the others still run. So is
a library whose new commit no longer holds a file it reads, reported as
`<path> is gone from <ref>`, or whose archive holds a file that would land outside its
folder. The command then exits 1.

Set `GH_TOKEN` or `GITHUB_TOKEN` to raise GitHub's rate limit.

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
| A fork that lists `upstreamLua` | `{ "callable", "field" }` | Its upstream members declared at the right parameter count, and its upstream fields declared. The library's `parityExceptions` count as declared. See [Surface parity](https://defold-typescript.github.io/library-data/guides/authoring-forked-library-types#4-surface-parity-against-the-upstream-lua). |
| A native extension | `{ "callable", "field" }` | The functions, methods and constants its C++ registers that its declaration names. A wrong module name or parameter count is a problem at any coverage. |

A module below its floor is a problem, and so is a module with no floor or one
that cannot be measured. A fork that records a `parityVerdict` vendors no
upstream to measure against, so it takes no floor. `library check` measures
every module afresh, so it reads no committed report and nothing outside
`--data`.

## `--data`

`--data <dir>` names a directory of version-named data folders (`0.55.0/`,
`0.56.0/`, ...), which the data repo keeps in its `data/` folder. `library check`,
`library add` and `library review` use the one this CLI reads, by the same rule as
[`resolve --library-data`](./resolve.md#flags): the highest folder at or below
the CLI version. A relative `<dir>` resolves against the
working directory. A `<dir>` with no folder for this CLI version is an error.

## `--api-doc-out`

`--api-doc-out <dir>` writes the API model of every library in the data folder
to `<dir>`, the JSON files the [library docs site](https://defold-typescript.github.io/library-data) renders:

```sh
bunx @defold-typescript/cli library check --data path/to/library-data/data --api-doc-out path/to/api-doc
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
defold-typescript library check: /path/to/library-data/data/0.55.0: 81 libraries, no problems
```

Otherwise each problem prints on its own line as
`<library>: <check>: <message>`, followed by a summary error, and the command
exits `1`:

```text
flow: compile: usage/flow-usage.test-d.ts:12 Property 'erase' does not exist on type 'typeof import("flow.ui")'.
defold-typescript library check: error: 1 problem in /path/to/library-data/data/0.55.0
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
  "error": "library check: 1 problem in /path/to/library-data/data/0.55.0",
  "subcommand": "check",
  "dataFolder": "/path/to/library-data/data/0.55.0",
  "problems": [
    { "library": "flow", "check": "compile", "message": "usage/flow-usage.test-d.ts:12 ..." }
  ]
}
```

A clean run has `"ok": true`, an empty `problems` array, `libraryCount`, the
number of libraries the folder holds, and `written`, the absolute path of each
file `--api-doc-out` wrote.

With `--json`, `library review` writes one object:

```json
{
  "command": "library",
  "ok": false,
  "error": "library review: 1 failed in /path/to/library-data/data/0.55.0",
  "subcommand": "review",
  "dataFolder": "/path/to/library-data/data/0.55.0",
  "reviewed": [
    { "library": "flow", "commit": "0123456789abcdef0123456789abcdef01234567", "added": true }
  ],
  "failed": [
    { "library": "monarch", "message": "HTTP 404" }
  ]
}
```

`added` is false when the review was already recorded, and `commit` is `null` for
an archive that names none. A run with no failure has `"ok": true` and `written`,
the absolute path of each `reviewed.json` it changed.

With `--json`, `library update` writes the same shape with `updated` in place of
`reviewed`, and its paths use forward slashes on every platform, with a network
path keeping its leading `//`:

```json
{
  "command": "library",
  "ok": true,
  "subcommand": "update",
  "dataFolder": "/path/to/library-data/data/0.55.0",
  "written": [
    "/path/to/library-data/data/0.55.0/flow/source/upstream/flow/ui.lua",
    "/path/to/library-data/data/0.55.0/flow/reviewed.json"
  ],
  "updated": [
    {
      "library": "flow",
      "status": "regenerated",
      "recorded": [],
      "differs": ["0123456789abcdef0123456789abcdef01234567"],
      "written": ["source/upstream/flow/ui.lua", "reviewed.json"],
      "ref": "v2",
      "change": "added",
      "members": {
        "added": ["flow/ui.lua#draw"],
        "removed": [],
        "changed": []
      }
    }
  ],
  "failed": []
}
```

Each entry's `written` holds the files it wrote, relative to the library's folder, and
the top-level `written` holds the same files as absolute paths. A file upstream removed
is not listed. `ref`, `change` and `members` appear only on a `regenerated` library.
