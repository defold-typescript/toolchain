---
toc-title: Changelog
llms-full: false
---
# Changelog

What changed in each published `defold-typescript` toolchain release. Sections
are headed by the **toolchain** version (the `vX.Y.Z` git tag) — a different axis
from the **Defold** engine version the API reference's version switcher selects
(`1.12.4`, `1.13.0`, …). Upgrading the toolchain and upgrading your pinned Defold
target are independent moves.

Entries are curated by hand from the git history; the most recent releases are
listed per-patch, older releases are rolled up per minor version. Breaking
changes are called out first because the toolchain is pre-1.0.

## v0.24.0

### Breaking

- Library surfaces corrected against their upstream pins, so code written to the old shapes stops type-checking until it is updated.
  - **[defsave](/api/defsave)** (`v1.2.6`) — `save` and `set` returned `void` and now return `boolean | undefined`, and `load` narrows from `unknown` to `boolean | undefined`. Code that assigned or asserted on those results may need updating.
  - **[druid](/api/druid)** — the drag callback declares the six parameters the runtime really passes, `(self, dx, dy, x, y, touch)` instead of `(self, touch)`, so a handler that read `touch` out of the second argument (actually `dx`) needs its parameter list updated; and `layout.on_size_changed.subscribe` takes the inherited [event](/api/event) signature `subscribe(callback, context?)` returning `boolean`, so calls passing a leading placeholder argument need it removed.
  - **[yagames](/api/yagames)** (`0.19.0`) — the banner functions are replaced by the sticky-banner API upstream documents: `banner_init`, `banner_create`, `banner_delete`, `banner_refresh` and `banner_set` are gone in favour of `adv_show_banner_adv`, `adv_hide_banner_adv` and `adv_get_banner_adv_status`.
- [`wall`](./wall.md) judges a directory by its whole subtree rather than only the sources it directly holds, so a directory whose own files are one kind but whose subdirectories add another is no longer eligible. Wall the single-kind directories beneath it instead.

### Improved

- Libraries whose upstream ships no usable structured source — or only one too lossy to generate from — are now first-party forked `.d.ts`s maintained in this repo: declaring the upstream dependency resolves and materializes the types through [`resolve`](./resolve.md), and each docs page imports the library under its module id. Type surfaces generally carry over unchanged — only their provenance and end-to-end resolution move; [defsave](/api/defsave), [orthographic](/api/orthographic.camera), [yagames](/api/yagames), [metrics](/api/metrics.fps), [gooey](/api/gooey) and [boom](/api/boom) are the exceptions, where being maintained here is what let a surface be corrected against its pin.
  - **[defcon](/api/defcon)** (`britzl/defcon` `2.6.0`) — imported as `import * as defcon from "defcon.console"`.
  - **[deftest](/api/deftest)** (`britzl/deftest` `2.8.0`) — imported as `import * as deftest from "deftest.deftest"`; its ambient test-DSL globals (`describe`, `test`, `assert_*`) carry along in the fork.
  - **[defmath](/api/defmath)** (`subsoap/defmath` `c67c2273`) — imported as `import * as defmath from "defmath.defmath"`; pinned to a commit SHA as upstream ships no tags.
  - **[zzfx](/api/zzfx)** (`thejustinwalsh/defold-zzfx` `8c90e12c`) — imported as `import * as zzfx from "zzfx.api"`; pinned to a commit SHA as upstream ships no tags.
  - **[boom](/api/boom)** (`britzl/boom` `5d47820c`) — imported as `import * as boom from "boom.boom"`; the game framework's ambient globals (`add`, `vec2`, `rand`, the color constants) and component interfaces carry along in the fork. The pin moves off the `1.0.0` tag, which predates the camera helpers `to_screen` and `to_world` — both now declared.
  - **[nakama](/api/nakama)** (`heroiclabs/nakama-defold` `v3.4.0`) — all three modules are forked here now, with types and the `import * as nakama from "nakama.nakama"` import unchanged; the core module's reference page moves from `/api/nakama.nakama` to `/api/nakama`, and the three modules share one Libraries-nav card instead of two.
  - **[defsave](/api/defsave)** (`subsoap/defsave` `v1.2.6`) — imported as `import * as defsave from "defsave.defsave"`; the previous binding declared about half the module, so the fork adds the seven missing functions (`obfuscate`, `get_file_path`, `key_exists`, `isset`, `reset_to_default`, `is_loaded`, `final`) and the config fields (`autosave`, `enable_obfuscation`, …), and gives `save` its `force` argument.
  - **[persist](/api/persist)** (`whiteboxdev/library-defold-persist` `b37f6104`) — imported as `import * as persist from "persist.persist"`; its types are unchanged, and its reference page moves from `/api/persist.persist` to `/api/persist`.
  - **[orthographic](/api/orthographic.camera)** (`britzl/defold-orthographic` `3.6.3`) — imported as `import * as camera from "orthographic.camera"`, with its page and import unchanged. `camera.follow` now accepts an array of game objects as well as a single one, and `camera.get_view` and `camera.get_projection` return [`Matrix4`](/api/Matrix4) instead of `unknown` — both matching what upstream documents.
  - **[yagames](/api/yagames)** (`indiesoftby/defold-yagames` `0.19.0`) — imported as `import * as yagames from "yagames.yagames"`, with its import unchanged; its reference page moves from `/api/yagames.yagames` to `/api/yagames`. `player_get_id` keeps a correctly spelled pointer to `player_get_unique_id`, and `leaderboards_init` is now marked deprecated as upstream marks it — it still exists, but the other `leaderboards_*` calls no longer need it.
  - **[starly](/api/starly)** (`VowSoftware/starly` `85d1b2af`) — imported as `import * as starly from "starly.starly"`, with its import and types unchanged; its reference page moves from `/api/starly.starly` to `/api/starly`. Pinned to a commit SHA as upstream ships no tags.
  - **[defold-input](/api/in.button)** (`britzl/defold-input` `4.7.1`) — all ten `in.*` modules, imported and typed exactly as before with their `/api/in.<mod>` pages unmoved; in the Libraries nav they now group under `in` rather than `defold-input`.
  - **[monarch](/api/monarch.monarch)** (`britzl/monarch` `6.0.2`) — all three `monarch.*` modules, imported and typed exactly as before with their `/api/monarch.*` pages, descriptions and nav grouping unmoved. Note that upstream's README documents the focus listener as `on_focus_change`; the function the runtime defines, and the one these types bind, is `on_focus_changed`.
  - **[richtext](/api/richtext.richtext)** (`britzl/defold-richtext` `5.22.1`) — all three `richtext.*` modules, imported and typed exactly as before with their `/api/richtext.*` pages unmoved; in the Libraries nav they now group under `richtext` rather than `defold-richtext`.
  - **[metrics](/api/metrics.fps)** (`britzl/defold-metrics` `1.2.1`) — both `metrics.*` modules, imported as before with their `/api/metrics.*` pages unmoved; in the Libraries nav they now group under `metrics` rather than `defold-metrics`. Each module also gains the module-level `update()`, `draw()` and `fps()`/`mem()` calls upstream defines over its built-in singleton, which the previous binding omitted — so you can read the FPS or memory figure without creating an instance.
  - **[gooey](/api/gooey)** (`britzl/gooey` `10.5.3`) — imported as `import * as gooey from "gooey.gooey"`, with its import and types unchanged; its reference page moves from `/api/gooey.gooey` to `/api/gooey`. `gooey.group` now takes the `action_id` and `action` arguments the runtime requires, so the four-argument call every upstream example writes finally type-checks.
  - **[bzAnim](/api/bzAnim)** (`jbp4444/bzAnim` `v.1.2`) — types unchanged; its reference page moves from `/api/bzAnim.bzLibrary` to `/api/bzAnim` and its documented import from `import * as bzLibrary` to `import * as bzAnim`, over the same `"bzAnim.bzLibrary"` module path. The fork is what keeps the hand-written `animate` and `animateSequence` options tables, which no generated source documents.
  - **[platypus](/api/platypus)** (`britzl/platypus` `4.3.1`) — types unchanged, and its documented import `import * as platypus from "platypus.platypus"` is unchanged too; only its reference page moves, from `/api/platypus.platypus` to `/api/platypus`. The fork is what keeps the hand-written `PlatypusConfig` collision-group table and the 19-method instance object `platypus.create` returns, neither of which any generated source documents.
  - **[dicebag](/api/dicebag)** (`8bitskull/dicebag` `0.3`) — types unchanged, and its documented import `import * as dicebag from "dicebag.dicebag"` is unchanged too; only its reference page moves, from `/api/dicebag.dicebag` to `/api/dicebag`. The fork is what keeps `roll_custom_dice`'s weighted-sides array, `table_create`'s rollable-table array and `set_up_rng`'s optional seed, all three of which upstream's documentation leaves untyped.
  - **[rendy](/api/rendy)** (`whiteboxdev/library-defold-rendy` `b72ee24`) — types unchanged, and its documented import `import * as rendy from "rendy.rendy"` is unchanged too; its reference page moves from `/api/rendy.rendy` to `/api/rendy`, and its attribution moves to the current `whiteboxdev` account the old `klaytonkowalski` URL redirects to. The fork is what keeps every function's parameter list — `get_stack`'s screen coordinates and `CameraId[]` return, `shake`'s optional `scaler`, the `CameraId` alias itself — none of which upstream's prose-only README documents.

- More of each generated library's surface now carries a real type where it previously fell back to `unknown`.
  - **Callback parameters** — arguments documented only as `function` in [event](/api/event), [lang](/api/lang), and [druid](/api/druid) are callable types now, so you can pass a typed function literal and call the value back without a cast.
  - **Nullable unions** — values documented as a union with nil, such as [bridge](/api/bridge.bridge)'s `platform.id`, `platform.tld`, `platform.payload`, `player.id`, and `player.name`, type as `string | undefined`, so you can use them after a null check without a cast.
  - **[druid](/api/druid) callbacks and multi-returns** — `druid.button`'s six style hooks and `druid.drag`'s `init` callback name their real parameter types now, and `druid.layout`'s `rows` field is a `druid_layout_row_data[]`. A function documented with several return values, such as `druid.layout.get_content_size`, returns a `LuaMultiReturn` tuple instead of `unknown`.
  - **[druid](/api/druid) callback fields** — `on_click`, `on_hover`, and every other component callback field are [event](/api/event) objects you can `subscribe` to, rather than `unknown`. Declare `defold-event` alongside druid so the type resolves.
  - **[log](/api/log.log)** — `get_default_logger_name` takes the real `debug.getinfo()` table instead of `unknown`, so reading `short_src` off it type-checks.
  - **[decore](/api/decore)** — `ecs.world` returns a world plus a variable number of further values, so its type is now a rest tuple you can spread instead of a fixed pair whose second slot was a single anonymous `unknown`.

- Every generated library's type coverage is now pinned by a committed floor, so regenerating it can no longer quietly reduce how much of its surface is typed — a drop fails the suite instead of rewriting the report. [Authoring LuaLS library types](./authoring-luals-library-types.md) covers locking in a genuine improvement.

- A library's API reference page now shows more of what its types actually say.
  - **Options shapes** — an options object documents its fields instead of rendering as a bare type name — 29 shapes across five libraries, including [monarch](/api/monarch.monarch)'s `ShowOptions`, [richtext](/api/richtext.richtext)'s `Settings`, and [gooey](/api/gooey)'s `ButtonState`. An optional field is marked with `?`, so a table whose fields are all optional no longer reads as all-required.
  - **Deprecations** — an upstream `@deprecated` marker shows as a `Deprecated` line carrying its explanation, in the same block the engine pages use for their version-keyed deprecations — from forked types ([yagames](/api/yagames)'s `player_get_id` and `leaderboards_init`) and generated ones alike ([druid](/api/druid)'s `text:set_to`). A tag on a *type* rather than a member reaches the shipped `.d.ts`, where your editor strikes the name through, but not the page; [authoring forked library types](./authoring-forked-library-types.md) and [authoring LuaLS library types](./authoring-luals-library-types.md) note the tag for authors.
  - **Ambient globals** — a library declaring most of its surface outside its module block finally documents it: [boom](/api/boom) goes from 1 symbol to 112 and [deftest](/api/deftest) from 2 to 32. Each ambient global is marked `G` on its heading, and the page's import step notes that those symbols are callable without the import.

- The [agent runbooks](./agent-runbooks.md) now warn that the script lifecycle factory needs a *value* import — the `import type` plus `declare const` form builds `ok: true` while leaving the hooks unerased — and route Defold's resulting `FORMAT_ERROR` resource cascade back to that fix.

- [`wall`](./wall.md) understands nested walls, so you declare one at the boundary you actually mean instead of at every leaf.
  - **Inheritance** — a wall can be declared on a parent directory that holds no sources of its own, and it narrows every directory beneath it; a subdirectory added later is covered with no second `wall` run.
  - **Override** — a nested wall now fully replaces the one it sits inside, instead of leaving its files in the outer program where their kind's namespaces leaked upward and let `gui.*` type-check inside a `script` wall.
  - **Provenance** — `wall --list --json` reports every narrowed directory with `origin` (`declared` or `inherited`) and the `declaredIn` ancestor that caused it; the plain `--list` line names the inherited pairs.

- A new `--fail-on-drift` flag turns the [installed-editor-vs-pin drift notice](./pinning-defold-target.md) into a non-zero exit on `build`, `watch`, [`run`](./run.md), `upgrade`, and `bob build`/`bundle`/`run`, so CI stops passing on a warning nobody reads — the notice text and `--json` payload are unchanged, and a command that already failed keeps its own exit code. It is unrelated to `resolve --frozen`, which fails on a native-extension cache miss, and never appears on `resolve`.

### Fixed

- A dependency that ships modules across two of this repo's registry lanes now resolves and materializes every module; [`resolve`](./resolve.md) previously kept only the first lane's module and silently dropped the rest.
- The upstream-migration fidelity gate is stricter about when a documentation source may replace a library's existing types, so no migration can quietly downgrade a surface you already depend on.
  - **No parameter or return types** — a source that names a library's functions but documents none of their signatures previously scored as a clean match and would have swapped a fully-typed surface for argument-less stubs. [persist](/api/persist) was the first library to hit this and keeps its existing types.
  - **Truncated comparison surface** — a binding whose types use `//*` section comments had everything up to the next block-comment terminator silently hidden from the gate, so members that would have been reported lost were not visible to lose. [yagames](/api/yagames) was the only such binding, with 9 of its 52 members hidden; the gate refused the migration, so that documentation source did not replace its types.
  - **Surface published through one exported object** — a binding that exports a single handle (`export = exportThis`) presented that handle as its whole surface, so every loss the gate measures came back empty against a surface it had never read. It now reads through the handle to the object's real members; `starly` was the only such binding, and its 21 members now carry a comparison that still refuses the migration.
- [narrator](/api/narrator)'s `Story.observe` callback parameter is now named `value`, after the argument the library actually passes it, rather than repeating the name of the variable being observed.
- Guide pages that described behavior the tools do not actually have are corrected.
  - **[TypeScript vs Lua](./typescript-vs-lua.md)** — the "self-contained Lua" wording no longer suggests a sufficiently pure npm package can work, and [TypeScript gotchas](./typescript-gotchas.md) gains an entry with the exact build failure, why `node_modules` is never read, and how to vendor the source under `src/` instead. It shows the output paths a scaffolded project really produces — `src/vendor/pure-pkg.lua` beside `src/main.ts.script` — and notes that include-base stripping runs only when `outDir` names a directory other than `.`.
  - **[Forked-library authoring](./authoring-forked-library-types.md) — `defmath`** — the worked example now describes how a fork's core engine types resolve, through the `@defold-typescript/types` ambient reference the validity gate pulls in, instead of the previous wrong claim about `vmath.*` member types and "vmath aggregation."
  - **Forked-library authoring — [defsave](/api/defsave)** — the worked example had the retired binding's member counts wrong (7 functions plus `appname`, not 8 functions and no fields), and its "100% fidelity" claim now reads accurately: the identity diff proves the emit is lossless, not that the surface matches upstream.
  - **Forked-library authoring — fork source and namespace** — the step-by-step procedure now matches the lane it documents instead of contradicting its own worked examples: a fork copies the shipped `generated/` golden rather than the raw ts-defold fixture, and a publish namespace may be dotted, in which case the cutover overwrites the retired goldens in place instead of deleting them.
- [go](/api/go) and [msg](/api/msg) now document the overloads the toolchain actually ships, each row carrying the description and parameter table its own call shape takes: `go.get` and `go.set` lead with their curried property-key generic and no longer show arguments it cannot accept, `go.property` lists its eight typed forms, `msg.post` its two, and `msg.url` its three real arities with a description apiece. The committed `llms-full.txt` carries the same forms.
- A library whose types are generated from its README now reads an argument bracketed across a comma (`data [, overwrite]`) or through an escaped bracket (`duration \[, scaler]`) as optional rather than required, and marks every argument inside a multi-argument group (`[b, c]`) optional.
- The explicit type-argument factory form the [script lifecycle](./script-lifecycle.md) guide documents — `export default defineGuiScript<MenuSelf>({ … })` — now builds to its component file (`src/menu.ts.gui_script`) instead of falling through to a plain `.lua` module of the wrong kind, and a type-only name imported alongside the factory (`import { defineGuiScript, type Hash }`) no longer fails the build with an unresolvable `require` of `@defold-typescript/types`. The scaffolded agent contract matches: it now states that both self-typing forms work, rather than warning agents off the generic one.

## v0.23.0

### Breaking

- More libraries' types are now maintained in this repo — each regenerated from its upstream source through the shared LuaLS / ref-doc pipeline (as with [druid](/api/druid) and [decore](/api/decore)) and marked with the maintained-here pin in the docs; each surface now follows upstream, so it differs from the previous hand-written binding.
  - **[tweener](/api/tweener)** (`Insality/defold-tweener`, tag `6`) — per-easing helpers are no longer module-level constants.
  - **[bridge.bridge](/api/bridge.bridge)** (`Playgama/bridge-defold`, `v2.0.0`) — regenerated from its committed `.script_api` as an importable `declare module`.
  - **[event](/api/event.event)** (`Insality/defold-event`, tag `19`) — the former untyped `any` passthrough now carries real types (`event.create`, subscribe/trigger, promise and queue instances).
  - **[lang](/api/lang.lang)** (`Insality/defold-lang`, tag `5`) — the twelve typed functions are tightened, and `load_langs`, the state getters, and typed `lang.data`/`lang.state` are added.
  - **[log](/api/log.log)** (`Insality/defold-log`, tag `6`) — `get_logger`'s name argument is now optional and its forced-level argument a plain `string`, and the logger's level methods now require their `data` argument.
  - **[proto](/api/proto.proto)** (`Insality/defold-proto`, tag `1`) — `get`/`decode`/`verify` return the native `LuaTable`, `set_logger` takes a typed `proto_logger`, and the full encoding API is surfaced.
  - **[saver.saver](/api/saver.saver)** and **[saver.storage](/api/saver.storage)** (`Insality/defold-saver`, tag `8`) — `init`, `save_game_state`, `get_save_path`, and `set_logger` take their typed optional arguments and the full save and key-value storage APIs are surfaced.
  - **[immutable](/api/immutable.immutable)** (`paweljarosz/lua-immutable`, tag `v1.1`) — `make` returns the typed `Immutable` interface rather than a generic `Readonly<T>`.
  - **[squid](/api/squid.squid)** (`paweljarosz/squid`, tag `1.2`) — the previous binding typed only `save_logs`/`get_config().is_enabled`; the surface now exports the module log-level constants and logging API, a typed `get_config`/`SquidConfig`, and a typed `SquidInstance` from `new()`.
  - **[narrator](/api/narrator)** (`astrochili/narrator`, tag `1.8`) — replaces the hand-written passthrough with the upstream parser plus the `Narrator.Story` runtime API, made runtime-faithful: `parse_content` takes its `inclusions` argument optionally, `continue()` returns a single paragraph or an array of them, and the internal `Object`/`constructor` tables no longer leak into the surface.

### Improved

- The editor-scripting authoring path is now documented: a [Core-concepts guide page](./editor-scripts.md) walks through `defineEditorScript`, the `<name>.ts.editor_script` artifact, and the editor's auto-load discovery, with a worked custom-command example.
- LuaLS library types ([druid](/api/druid), [decore](/api/decore), [tweener](/api/tweener), [event](/api/event.event), [lang](/api/lang.lang)) now emit every nil-bearing trailing argument — both `T | nil` unions and type-suffix `T?` params — as optional, and nilable interface fields (`function | nil`, `string?`) as omittable object properties. Faithful upstream calls like `event.create()`, `instance.subscribe(cb)`, `lang.set_lang("en")`, `lang.set_next_lang()`, and `lang.init([{ id, path }])` now type-check instead of demanding an explicit `undefined`, and object literals may drop fields like `loader` they faithfully omit. Event and promise instances are also callable now (`instance(payload)`), matching their runtime `__call`.

### Fixed

- Installed packages can now resolve the [bridge.bridge](/api/bridge.bridge) library again — its script_api resolve manifest was missing from the published tarball, so the [`resolve`](./resolve.md) command silently dropped `bridge` on a real install.
- A script_api library whose types reference engine handles ([Hash](/api/Hash), [Vector3](/api/Vector3), [Url](/api/Url), ...) now emits an importable `declare module` instead of a broken module augmentation, so `import { ... } from "<library>"` resolves instead of failing with `TS2307`.
- LuaLS library types ([druid](/api/druid), [event](/api/event.event), [log](/api/log.log), [tweener](/api/tweener)) no longer leak non-public members: fields and methods marked `@private`/`@protected`/`@package` (and methods marked `@local`) are hidden from the generated declarations, the `/api` docs, and the fidelity report alike, so the three surfaces describe one identical public set. For example the `log` logger drops `_last_gc_memory`/`_last_message_time`/`format`/`log`, and druid components drop the base's protected lifecycle hooks and `get_uid`.
- A dependency that ships several modules from one repository (for example defold-saver's [saver](/api/saver.saver) and [storage](/api/saver.storage)) is now fully handled: the [`resolve`](./resolve.md) command materializes every module instead of keeping only the first, and the docs-site Libraries navigation groups them into a single entry instead of one per module.
- The LuaLS front-end now reliably infers a constructor's return type and instance methods when the function-local class declares extra locals, and a stale `---@type fun(...)` method annotation no longer attaches across intervening lines to a later member key — a latent mis-emit fixed before any maintained library shipped it.

## v0.22.0

### Added

- Editor scripts are now recognized and built: a source that does
  `export default defineEditorScript({ get_commands, ... })` compiles to a
  `<name>.ts.editor_script` returning the hooks table the Defold editor loads —
  mixing an `EditorCommand` type import with the factory erases cleanly (no stray
  `require`), and editor-only directories are never offered as per-kind type walls.
  The typed `editor.*` API and project scaffolding land in follow-ups.

### Improved

- The repo-maintained-library marker in the API reference is now green and easier
  to spot: in the sidebar it sits on each library namespace leaf instead of the
  parent folder row, and it also appears on the `/libraries` index cards.

### Fixes

- `init` now scaffolds the `.gitattributes` the Defold editor emits (linguist
  overrides for correct GitHub rendering and language stats) and ignores Windows
  `Thumbs.db` alongside `.DS_Store`. Both merge into existing files on upgrade,
  so an editor-created project gains only what it was missing.
- `init` now writes a `.defignore` so the Defold editor and bob skip
  `node_modules`, `.defold-types`, and `.vscode` when scanning for resources.
  It merges into an existing file, keeping any lines you added.

## v0.21.1

### Improved

- The `upgrade` guide page is now a CLI verb page (`toc-title: upgrade`, `# Upgrade`)
  sitting in the **CLI** sidebar subgroup right after `init`.

### Fixes

- Applied Biome's current formatting rule to inline type literals in the guide-docs
  test, clearing the lint gate after a formatter-rule update.

## v0.21.0

### Added

- Typed bindings for LuaLS-annotated pure-Lua libraries.
  `defold-typescript resolve` now materializes generated `.d.ts` for libraries such as:
  - **Druid**
  - **Decore** (first two libraries to proof concept)
  > Dependencies — generics, inheritance, variadics, and
  multi-returns preserved — each with a rendered API page at `/api/<name>`, and the
  new [Authoring LuaLS library types](authoring-luals-library-types.md) guide covers
  adding further libraries as a config-only change, including how to fill an empty
  API-page description.
- Library reference pages and the sidebar Libraries tree both show a map-pin
  marker beside libraries whose type bindings this repo maintains (Druid, Decore),
  with a hover hint, so you can tell them apart from vendored libraries at a glance.

## v0.20.8

### Added

- In progress: typed bindings for LuaLS-annotated pure-Lua libraries (starting
  with Druid). The plumbing is landing release by release — source ingest and
  the LuaLS-to-TypeScript type mapper are in place, with the mapper now emitting
  valid TypeScript for vararg parameters and function return unions; the
  generated library `.d.ts` you import ships in a later release.

## v0.20.7

### Added

- Guide pages for the `run` and `bob` commands, covering the launch/build
  workflow, the two `run` resolver errors, the `bob.jar` cache, and the
  per-subcommand `--json` shapes.
- A pre-commit gate that fails any commit not staging a change to this
  changelog, so it can no longer drift behind the work that lands; bypass a
  genuine exception with `git commit --no-verify`.

### Fixed

- `bob status` now honors the `--java` / `DEFOLD_JAVA` override, matching
  executing Bob commands, so the preflight reports the same Java runtime a build
  will actually use.

## v0.20.6

### Fixed

- Cutting a release now refreshes the published `/changelog` on its own: the new
  tag's date replaces `- Unreleased` for the shipped version without a manual docs
  redeploy.

## v0.20.5

### Improved

- The installed-editor pin-drift notice now covers `watch`, `run`, `bob`, and
  the `update` alias, warning when the editor you have open drifts from the
  project's version pin.

### Fixed

- `run` derives its project directory from the arguments before `--`, so pin
  drift is no longer read from a `<cwd>/--` path.

## v0.20.4

### Improved

- Defold-pin drift checks are unified under a single `verify-docs-drift` mise
  task, with the drift-root split from the evidence-root so staleness is the sole
  trigger.
- Release-smoke overrides derive from the CLI manifest, with a pinned TypeScript.

## v0.20.3

### Added

- `bump:defold` orchestration command for Defold version bumps, including an
  offline `--check` release-evidence gate.
- `regen:all` aggregate regeneration command.
- `set-target` verb to write the `defold-target` pin.
- A docs-site color-token parity drift guard.

### Improved

- `--defold-target` now notifies when it overrides a live `package.json` pin, and
  points the override notice at `set-target`.
- `resolve` prunes orphaned extension version-pins.

## v0.20.2

### Fixed

- Opaque signature deep-link hrefs now respect the deploy base path.

## v0.20.x

The API reference moved to a combined, multi-version surface and the `upgrade`
verb landed.

### Breaking

- The `/api` route domain is inverted: the combined multi-version surface now
  owns the canonical `/api`, each tracked version gets an explicit
  `/api/defold-<version>` family, and the previous `/api/combined/*` routes are
  `noindex` compatibility redirects.

### Added

- `upgrade` verb (with `update` as a synonym): resolve the latest toolchain, then
  hand off to the newer CLI or re-scaffold in process, captured under `--json`.
  A new upgrading guide documents it.
- Combined union API surface with an N-version availability model, a version
  selector, a declaration-backed `api-signatures` artifact, and combined-only
  availability badges.
- Defold 1.13.0 type surface promoted, with a deterministic release importer, an
  offline release-readiness gate, a 1.13.0 upgrade guide, and catalogued 1.13.0
  deprecations (camera-focus messages, `reset_constant`) surfaced via
  `@deprecated`.
- `--help` / `-h`, top-level and per command.

### Fixed

- nil-bearing engine returns are typed as `T | undefined`, and the nil-return
  truthiness guidance is corrected to `~= nil`.
- Every promise derived from a captured spawn settles, so an unspawnable child
  leaves no orphaned rejection.

## v0.19.x

### Added

- `init` writes the agent contract (`AGENTS.md`), re-syncing an existing one only
  under `--force`.

### Improved

- `llms-full.txt` inlines guide bodies with web chrome stripped and headings
  nested under `## Guide`.
- Scaffold commands survive a broken toolchain via lazy-loaded transpiler
  dispatch verbs.

### Fixed

- Refuse to re-release a commit that already carries a release tag.
- Pin `typescript@6.0.2` in the scaffold and cap the `tstl-plugin` peer below the
  TS7 native port.

## v0.18.x

### Added

- Vendored native and pure-Lua library types materialized into `.defold-types`
  during `resolve`, with `/api` docs pages grouped by author, a Libraries nav
  tab, and a live-fetch drift gate; the `library-types` package is published.
- Covariant vmath functions typed with generics, so same-type-in yields
  same-type-out.

### Improved

- `init` merges into an existing `tsconfig.json` instead of clobbering it and
  reports per-file operations.
- `watch` stays alive through startup compile errors with located highlighting,
  and build failures surface located, one-per-error source positions.

### Fixed

- `init` never excludes `src/main.ts` and self-heals a tool-added exclude on
  merge.
- The CLI node-runtime spawn crash; Java resolution falls back to the editor's
  bundled JDK when running `bob`.

## v0.17.x

### Added

- More vendored library types (persistence, text and narrative, platypus,
  defold-event, input, monarch), a pure-Lua classification manifest, and a
  library-types drift gate.
- `types.is_*` checks emitted as user-defined type guards.

### Improved

- The API overview replaced tables with cards, then a linked signature list.
- Lua `type()` return tightened to its closed string union.

### Fixed

- Upgraded the GitHub Pages deploy actions off deprecated Node 20.
- Long space-less inline code wraps on narrow screens instead of scrolling.

## v0.16.x

### Added

- Canonical JSDoc for the six core value types, a typed-messages guide page, a
  previous/next pager on every article, and shiki line-highlighting plus
  `[!MORE]` tap-to-reveal disclosures in the Tetris tutorial.

### Improved

- The Tetris tutorial is inverted into inline walkthroughs with the full script
  collapsed into a disclosure.
- Global-type docs render as markdown from their JSDoc.

### Fixed

- The scaffold declares a direct `lua-types` devDependency so Lua stdlib globals
  resolve.
- Scaffold `.gitignore` lines match Defold's canonical `/build` and `/.internal`
  form.

## v0.15.x

### Improved

- Several mise tasks ported to shell-free Bun scripts (release-pack-proof,
  current-version, `dev:slides`).
- `init --force` migrates a deprecated `biome.json` to the preset.

### Fixed

- Tetris tutorial file-create and scene-wiring steps, plus a window-size step so
  the board centers.
- `ScriptPropertiesOf` exported from the barrel.

## v0.14.x

### Improved

- The docs renderer supports same-line GitHub alert markers, and wide tables
  scroll.

### Fixed

- Migrated `biome.json` off deprecated `recommended` to the preset (Biome 2.5.1).

## v0.13.x

### Added

- The Build Tetris tutorial guide page and its runnable example under
  `docs/examples`, code-block filename chips from a `title=` fence, and a loadable
  scaffolded `game.project` with a `[bootstrap]` collection and input binding.

### Improved

- The scaffold no longer enforces `noDoubleEquals`; `===` and `==` compile to
  identical Lua, and the guidance is reframed accordingly.

## v0.12.x

### Improved

- Data-structures guide: Lua table extensions documented, `LinkedList` dropped.

### Fixed

- `sourceMappingURL` is kept as the generated file's last line.
- Full builds prune kind-switch outputs and warn on sourceless orphans.

## v0.11.x

### Breaking

- npm publishing moved to CI OIDC trusted publishing; local `bun-publish` is
  retired.

### Added

- The docs API version selector, with per-version `/api` routes and search
  indexes, global value-type reference pages, the offline `llms.txt` knowledge
  pack, and topical Defold-way agent runbooks.
- Signature override stores for the Lua standard library (`string`, `table`,
  `os`, `math`, `io`, `socket`, and the rest), with an AST drift guard.

### Improved

- Releases require CI green before publish.
- A responsive docs-site topbar and a collapsible sidebar drawer.

### Fixed

- A Windows separator leak in the client graph.
- GitHub-compatible heading slugs so in-page anchors resolve.

## v0.10.x

### Added

- A top-of-page function summary table on `/api` pages.
- A presence-parity gate enumerating `ts-defold-types`-only symbols.
- Socket handle methods emitted as receiver interfaces.

### Improved

- Lifecycle-hook and `InputAction` / `InputTouch` members documented with
  fixture-pinned JSDoc.
