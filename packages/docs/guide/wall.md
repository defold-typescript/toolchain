---
toc-title: wall
---
# Wall

This page covers `wall`, the opt-in command for narrowing the API surface of a
source directory to a single script kind. To *add* a surface for native-extension
namespaces instead of narrowing one, see [`resolve`](./resolve.md).

## Full surface by default

Defold scopes two namespaces to a script kind: `gui.*` resolves only inside a
`.gui_script`, and `render.*` only inside a `.render_script`. Every other
namespace (`go`, `msg`, `vmath`, `sys`, `physics`, …) is available in every kind.

By default `defold-typescript` gives you the **full** `@defold-typescript/types`
surface everywhere. `init`, `build`, and `watch` never change this: they scaffold
and build against whatever entrypoint your `tsconfig` names and never add, remove,
or prune a wall. The full surface never rejects a call the engine would allow, but
it also can't catch a `gui.*` use in a plain `.script`. To get the engine's wall
at compile time, opt in with `wall`.

## What a wall is

A wall is a composite `tsconfig.json` written into a single-kind source directory
that narrows `compilerOptions.types` to that kind's subpath:

| Script kind      | `types` entrypoint                        | Namespaces           |
| ---------------- | ----------------------------------------- | -------------------- |
| `.script`        | `@defold-typescript/types/script`         | universal only       |
| `.gui_script`    | `@defold-typescript/types/gui-script`     | universal + `gui`    |
| `.render_script` | `@defold-typescript/types/render-script`  | universal + `render` |
| `.editor_script` | `@defold-typescript/types/editor-script`  | `editor` only        |

`.editor_script` is the odd one out: it runs in the editor's own Lua VM, so its
surface is disjoint from the runtime kinds rather than a narrowing of them — no
`go`, `msg` or `vmath`. It is offered like any other kind, so a directory holding
only editor scripts is eligible and walls to that subpath; see
[editor scripts](./editor-scripts.md).

Under a pinned Defold surface a wall narrows to `<surface>/<kind>` only for the
kinds that surface actually wrote. Every surface carries the runtime trio; a
surface carries `editor-script` only when the Defold target it was built from
ships an editor-scripting document of its own. Today only the current default
target does, so an editor-script wall in a project pinned to an older target
keeps naming the installed `@defold-typescript/types/editor-script` package
entrypoint while its runtime siblings narrow to the pinned surface.

The root `tsconfig.json` references each walled directory and excludes it from the
root program, so `tsc -b --noEmit` builds every walled directory against only its
narrowed surface — a `render.*` use inside a gui-walled directory becomes a compile
error, while the rest of the project stays full-surface.

A directory is **eligible** to be walled only when every `.ts` source **in its
whole subtree** is one kind; a directory whose subtree mixes kinds cannot be
walled, because no single narrowing applies. `build` and `watch` never touch
walls — they are entirely yours to manage.

**Inheritance.** A wall narrows every directory beneath it, so declare it at the
boundary — `src/gui`, not `src/gui/hud` and `src/gui/menu` separately. A
directory whose sources all live in subdirectories is eligible on their behalf,
and a `src/gui/settings/` added later is narrowed with no second `wall` run.

**Override.** A descendant that declares its own wall replaces the inherited one:
the ancestor excludes that descendant from its program, so the descendant's kind
subpath cannot widen the ancestor. Without the exclusion the two would
*intersect* — the descendant's files would stay in the ancestor's program and
inject their namespaces there, letting `gui.*` type-check inside a `script` wall.

**Kind-neutral helpers.** A `.ts` with no lifecycle factory declares no kind, so
it never makes a directory eligible and never blocks an ancestor from rolling up
to a single kind. But a helper *inside* a walled subtree still compiles in that
wall's narrowed program — so a helper shared across kinds belongs outside every
walled subtree.

## Interactive

Run `wall` with no arguments in a terminal:

```sh
bunx @defold-typescript/cli wall
```

You get a checkbox of every eligible source directory — including the ancestors
that hold no sources of their own — pre-checked to the directories already
walled. Checking an unwalled directory walls it; unchecking a walled directory
removes its wall. A directory already governed by an ancestor's wall is labelled
`[inherited from <dir>]` rather than pre-checked, since checking it would declare
a redundant second wall. Mixed-kind directories appear disabled, with their
competing kinds shown as the reason. The final selection **is** the desired wall
set — the command reconciles the project on disk to exactly what you checked.

## Flags

For agents, CI, and scripted use, pass directories explicitly (a bare `wall` with
no TTY errors rather than hanging on an unrenderable prompt):

```sh
# Wall these directories (added to any already walled)
bunx @defold-typescript/cli wall src/ui src/rendering

# Remove a wall
bunx @defold-typescript/cli wall --remove src/ui

# List current and eligible walls (writes nothing)
bunx @defold-typescript/cli wall --list
bunx @defold-typescript/cli wall --list --json
```

`--json` emits the resulting `directoryWalls` (and, for `--list`, the `eligible`
set) for machine consumption. `--json` is machine-driven intent, so a bare
`wall --json` never opens the interactive menu — pass directories or `--list`.

`wall --list --json` also carries `resolved`: one entry per source directory a
wall actually narrows, so an inherited narrowing is traceable to the declaration
that caused it. Each entry adds `declaredIn` (the directory the governing wall is
declared on) and `origin` — `"declared"` when the directory carries the wall
itself, `"inherited"` when an ancestor's wall governs it. The human `--list` line
names the inherited directories the same way (`src/gui/hud <- src/gui`).

## Import the factory from the kind subpath

A wall only holds if a walled source imports its lifecycle factory from the **kind
subpath**, not the main entry:

```ts
// src/ui/hud.ts — inside a gui wall
import { defineGuiScript } from "@defold-typescript/types/gui-script"; // correct
```

Importing the same factory from the main `@defold-typescript/types` entry pulls
*every* `declare global` namespace (including `render`) into the wall's program and
silently defeats the narrowing — `render.*` would type-check inside a gui wall:

```ts
// Wrong: re-introduces the full surface, defeating the wall
import { defineGuiScript } from "@defold-typescript/types";
```

The interactive snippets scaffolded by `init` already import from the kind
subpaths. `build` enforces this: a walled source that imports a lifecycle factory
from the main entry fails the build before transpile, naming the file and the kind
subpath it should import from instead. (`watch` does not enforce it yet — its
session path is a separate slice.)
