---
toc-title: Advanced CLI
---
# Advanced CLI

This page covers `wall`, the opt-in command for narrowing the API surface of a
source directory to a single script kind.

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

| Script kind | `types` entrypoint | Namespaces |
| ----------- | ------------------ | ---------- |
| `.script` | `@defold-typescript/types/script` | universal only |
| `.gui_script` | `@defold-typescript/types/gui-script` | universal + `gui` |
| `.render_script` | `@defold-typescript/types/render-script` | universal + `render` |

The root `tsconfig.json` references each walled directory and excludes it from the
root program, so `tsc -b --noEmit` builds every walled directory against only its
narrowed surface — a `render.*` use inside a gui-walled directory becomes a compile
error, while the rest of the project stays full-surface.

A directory is **eligible** to be walled only when every `.ts` source in it is one
kind; a directory mixing kinds cannot be walled, because no single narrowing
applies. `build` and `watch` never touch walls — they are entirely yours to
manage.

## Interactive

Run `wall` with no arguments in a terminal:

```sh
bunx @defold-typescript/cli wall
```

You get a checkbox of every eligible source directory, pre-checked to the
directories already walled. Checking an unwalled directory walls it; unchecking a
walled directory removes its wall. Mixed-kind directories appear disabled, with
their competing kinds shown as the reason. The final selection **is** the desired
wall set — the command reconciles the project on disk to exactly what you checked.

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
