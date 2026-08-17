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

## v0.25.0

### Breaking

- **starly** is no longer part of the library corpus: its types, its reference page and its entry in the resolvable set are gone. The library was withdrawn upstream — its repository and its author's account were both deleted, it never published a release, and the only surviving copy is an unaffiliated third-party mirror — so no one can obtain a runtime for the declarations. For a 2D camera, use [shutter](/api/shutter), added this release as the closest replacement, or the longer-standing [orthographic](/api/orthographic.camera) and [rendy](/api/rendy).

### Improved

- **The CLI now works with the running editor.** A reload does not re-run `init`, so whatever it set up belongs in [`on_reload`](./script-lifecycle.md#hot-reload-and-on_reload), and Defold's own build errors still reach only the editor's Build Errors tab.
  - **[`watch --hot-reload`](./watch.md#hot-reload)** — scaffolded as the `defold-typescript:watch-hr` mise task, it pushes every successful rebuild into the running game, reloading nothing when a build fails, reloading the editor's extensions instead when the emit was an [editor script](./editor-scripts.md), and naming the editor in your terminal when a reload is refused, after which it stops reporting that editor as attached until a reload actually lands; with or without that flag, `watch` prints the running game's [runtime errors and warnings with their tracebacks](./watch.md#runtime-errors-in-the-terminal) into your terminal, and stopping it goes quiet at once — the console stream closes, a reload already on the wire is cancelled rather than left outstanding, and nothing further is reported: not a reload still waiting to attach, not the later commands of a reload that pushes more than one, and not a `game.project` re-resolve that finishes after the stop. [`build`](./build.md) names the editor it found under a timeout, so a stale port file pointing at a process that never answers is treated as no editor at all instead of holding the build.
  - **[`reload`](./reload.md)** — a one-shot counterpart for scripts and agents: it pushes a single reload into the running game — or the editor's own extensions with `--extensions` — then reads the editor console for a bounded window (`--wait`, default 2s), exiting non-zero when the reloaded code throws, when the editor refuses, and when a requested window could not be opened at all; a stale editor port ends the command on a deadline instead of parking it. Exit 0 claims only that the post was accepted — plus a quiet console when a window was read, and nothing more under `--wait 0`, which opts out of the read entirely — and `--json` reports which of the two happened as `consoleObserved`.
  - **Console errors name your TypeScript** — on both surfaces a reported location now carries the authored `.ts` line and column in front of the generated chunk one (`src/main.ts:5:11 (/src/main.ts.script:4)`), read from the source map the build writes beside every output and naming the file you edit under any layout, including a project that builds into an `outDir`, on the first build and on every rebuild alike. It is best-effort and never invents a location: a chunk with no usable map, a generated line the map does not cover, and a map resolving to anything that is not a file in your project are all left exactly as the console sent them, while under `reload --json` the raw `consoleErrors` stay unchanged and the translations arrive beside them as `consoleErrorLocations`.
- **Editor scripts get a typed editor API.** The new `@defold-typescript/types/editor-script` entrypoint exports the `defineEditorScript` and `defineEditorCommand` factories — both erasing to plain tables the editor can load — and carries the editor VM without the game runtime: `editor.get`/`bob`/`execute`/`transact`/`tx.*`, the `editor.ui.*` dialog toolkit and `editor.prefs.*` (its `schema` group and the `COLOR`/`SCOPE`-style constant tables included, with every builder returning one nominal component handle `editor.ui.show_dialog` accepts), the VM's own `http`, `json`, `zip`, `zlib`, `pprint`, `localization` and `tilemap.tiles` libraries with every call shape Defold documents accepted as written (`zip.pack(archive, ["build"])`, a two-argument `http.server.route`) and `json.decode`/`json.encode` returning real values rather than nothing, and a command's `active`/`run` opts bag typed from its own `query`, so a `"one"` selection reads as a single node, a `"many"` one as a list, and a member the query never declared is a compile error. [`wall`](./wall.md) now offers a directory holding only [editor scripts](./editor-scripts.md) as a target like any other kind, so you no longer set `types` by hand.
- **Walled directories follow your pinned Defold target.** A [pinned](./pinning-defold-target.md) surface now carries the editor-scripting API of the target that declares one, and a [wall](./wall.md) narrowed to a pinned kind resolves both its ambient namespaces and its `@defold-typescript/types/<kind>` factory import from that one surface — a target declaring no [editor-script](./editor-scripts.md) document of its own keeps the installed entrypoint, and a wall never narrows to a kind its surface did not write. That redirect is the only module mapping a wall manages and resolves against whatever `baseUrl` your root `tsconfig.json` declares — absolute ones included — so the aliases your root and the wall's own config declare keep resolving inside a walled directory, and dropping the pin leaves them untouched.
- **New libraries in the corpus**, each maintained here against its pinned upstream and materialized by [`resolve`](./resolve.md) once you declare the dependency:
  - **[shutter](/api/shutter)** (`Klaleus/defold-shutter`) — a 2D camera covering the ground starly's withdrawal left open: the camera table, the three viewport behaviors, the screen/world conversions and the shake helpers.
  - **[nakama.socket](/api/nakama.socket) and [nakama.session](/api/nakama.session)** (`heroiclabs/nakama-defold`, pin `v3.4.0`) — the realtime socket's chat, match, matchmaking, party and status calls, each also bound onto the socket instance `create` returns, plus the helpers that build, check, store and restore a session. `match_create` takes a nil name to let the server generate one and `match_join` takes either a match id or a matchmaker token, so unnamed creation and token-only joins type-check; the v0.24.0 note that a socket binding needed vendoring of your own no longer applies.
  - **[checkpoint](/api/checkpoint)** (`Klaleus/defold-checkpoint`) — the successor to the abandoned [persist](/api/persist), typed for reading and writing save files as JSON or binary. It needs `britzl/defold-lfs` at runtime, which this corpus does not type.
- **The editor completes what your project declares.** In an editor running the [transpile-diagnostics plugin](./transpile-diagnostics.md), the suggestions are listed after everything the editor already offers, nothing it offers is removed, and a caret inside a `hash("…")` completes the slot the call around it occupies one level out, so the hashed form offers what the bare literal does while a doubled `hash(hash("…"))` offers nothing. They are read from an index the plugin holds across requests and refreshes whenever a file it reads changes, so completing repeatedly in one slot no longer re-walks your project and a newly authored id is offered without restarting the editor.
  - **Game-object paths and component ids** — inside an address argument the caret picks the half: from the `#` onward you get the component ids your project's `.go` and `.collection` files declare, replacing the `#fragment` only, and anywhere before it — including a literal carrying no `#` yet — you get the game-object paths those files compose, replacing the path half alone. A collection instanced inside another prefixes every path it holds (`/player/player`, never a bare `/player`), while a `children:` edge is a transform relation and adds no segment.
  - **Node ids** — a caret inside [`gui.get_node`](/api/gui)'s argument offers the node ids of the one `.gui` scene that owns the script you are editing, replacing the whole quoted name; ownership is resolved through the same `outDir` and `include` rules the build uses, so a project with a separate output tree completes too. A script no scene owns, or one that two scenes both claim, offers nothing.
  - **Animation ids** — a caret inside [`sprite.play_flipbook`](/api/sprite)'s `id` argument offers the animations declared by the atlas of the sprite the *sibling* argument addresses, again replacing the whole quoted name. The address must be the same-object `"#id"` literal: a path form, a variable or a `msg.url(…)` call names a component this file cannot decide, so nothing is offered.
  - **Resource paths** — a caret inside one of the six [`resource`](/api/resource) property constructors (`atlas`, `buffer`, `font`, `material`, `texture`, `tile_source`) offers the project's own files of the one kind that constructor accepts, as the `/`-prefixed paths Defold resolves. `build/` output and the directories [`init`](./init.md)'s `.defignore` names (`node_modules`, `.defold-types`, `.vscode`) are left out, as are the built-path slots and the extension-less loaders.
  - **Config keys** — a caret inside the `key` argument of [`sys.get_config_string`](/api/sys), `sys.get_config_int`, `sys.get_config_number` or `sys.get_config_boolean` offers the `SECTION.KEY` ids your project's own `game.project` declares, replacing the whole quoted text. Only what that file writes is offered — a key it omits answers the reader's default at runtime — and a project without one offers nothing.
  - **Action ids** — a caret inside a `hash("…")` compared against your handler's `action_id` (`action_id === hash("")`, either operand order, `defineScript`'s `on_input` method included) offers the actions every `.input_binding` in your project declares, replacing the whole quoted text. The comparison is what scopes it — a `hash("…")` carrying none, the hoisted `const JUMP = hash("jump")` form included, offers nothing — and the slot is Defold's own ambient `hash`, so a `hash` your project declares or imports itself is never offered ids.
  - **Where a suggestion came from** — highlighting one of these suggestions names the project files that declare it, every kind covered: the `.go` for a component id, the collection declaring a game-object path's leaf segment, the `.atlas` or `.tilesource` an animation id was read from, the owning `.gui` for a node id, `game.project` for a config key, every `.input_binding` that declares an action. Inside an address the panel follows the caret's half exactly as the suggestions do, and anything the project cannot attribute exactly — a scene that failed to parse, a script two game objects both claim — keeps your editor's own panel rather than a guessed one.
- **Address slots say what they address.** The 27 URL parameters that name a scene object — [go](/api/go)'s `id`/`url` slots, [msg](/api/msg)'s `receiver` and `urlstring` — read `SceneGameObjectAddress`, `SceneComponentAddress` or `SceneAddress` instead of `string`, so the reference distinguishes a game-object path from a component one. The aliases accept every string, so nothing that compiles today stops compiling.
- **A hashed name remembers the string it came from.** `hash("#sprite")` now reads as [`Hash<"#sprite">`](/api/Hash) rather than a bare `Hash`, so the idiomatic `const SPRITE = hash("#sprite")` still says which component it addresses. The parameter defaults to `string` and constrains nothing, so every existing `Hash` annotation and every call — `hash("jump")`, `go.set("#sprite", hash("tint"), v)` — compiles unchanged.

### Fixed

- [`run`](./run.md) hands the engine every argument after `--`, including ones sharing a name with a CLI flag. `run . -- --json` now launches the engine with `--json` instead of consuming it and switching the CLI's own output into JSON mode.
- Keys you add to a managed `mise.toml` task now survive [`init`](./init.md) and [`upgrade`](./upgrade.md), wherever in the task you wrote them and however TOML lets you spell the key — after a blank line, below a hand-edited multi-line `run`, or written as `env . CONFIG`, `env."MY VAR"` or an escaped `"run"` — and tables of your own, with whatever their values happen to contain, stay tables of your own. A refresh used to replace each `defold-typescript:*` block wholesale, end it at the first blank line, and judge a key by its raw spelling, so an `alias`, a `depends` or a comment was dropped or hoisted into the root table and an escaped key was duplicated or quietly deleted, in the worst case leaving a `mise.toml` that `mise` refused to parse at all; a block now ends where its TOML table does, and only the keys that really mean `description` and `run` are rewritten.
- A [walled](./wall.md) directory under a [pinned](./pinning-defold-target.md) surface no longer type-checks against the installed release's API alongside the pinned one. The `@defold-typescript/types/<kind>` factory import used to resolve through `node_modules` to the installed package, so the program saw the union of both surfaces and a call the pinned release does not declare compiled anyway; it is now the compile error it should always have been.
- **Reference-site corrections**, each on what a page displayed rather than on what it documents:
  - **[Libraries](/libraries) index** — no longer credits the `ts-defold/library` project for its type definitions. Every library has been maintained in this repo since v0.24.0, generated from upstream sources that ship machine-readable types or hand-forked where upstream ships none.
  - **[persist](/api/persist) and [rendy](/api/rendy)** — credited to their author's current GitHub account, so the attribution links no longer depend on a rename redirect.
  - **[boom](/api/boom) and [deftest](/api/deftest)** — the reference pages now show the type parameter their generic helpers take, instead of a signature naming a `T` it never declares.

## v0.24.0

### Breaking

- Library surfaces corrected against their upstream pins, so code written to the old shapes stops type-checking until it is updated.
  - **[defmath](/api/defmath)** — `in_triangle` takes `(x0, y0, arr)` with a six-number array instead of eight loose coordinates.
  - **[defsave](/api/defsave)** — `save` and `set` return `boolean | undefined` instead of `void`, and `load` narrows from `unknown` to the same.
  - **[druid](/api/druid)** — the drag callback declares the six parameters the runtime really passes, `(self, dx, dy, x, y, touch)`, so a handler that read `touch` out of the second argument needs its parameter list updated; and `layout.on_size_changed.subscribe` takes the inherited [event](/api/event) signature `subscribe(callback, context?)`, so drop any leading placeholder argument.
  - **[gooey](/api/gooey)** — the three dynamic-list calls drop a `root_id` argument upstream never took, `dynamic_list` and `static_list` drop a trailing `is_horizontal`, and `vertical_scrollbar` gains upstream's `config` before its callback — so old calls were passing arguments into the wrong slots.
  - **[metrics](/api/metrics.fps)** — `create`'s `position` and `color` are a [`Vector3`](/api/Vector3) and a [`Vector4`](/api/Vector4) instead of `string`; pass `vmath` values, or the module's own `POSITION`/`COLOR` defaults.
  - **[monarch.transitions.easings](/api/monarch.transitions.easings)** — `create` is gone, since upstream keeps it private; call the per-easing `BACK()`, `BOUNCE()`, `CIRC()` wrappers instead.
  - **[nakama](/api/nakama)** — every request-taking call declares upstream's positional parameters instead of a body object, and all 84 retry-capable calls accept a trailing `retry_policy` and `cancellation_token`. The socket surface is gone from this module, which never exported it — `create_socket` is the one door it opens to a separately vendored `nakama.socket`.
  - **[nakama.engine.defold](/api/nakama.engine.defold)** — `http` takes `retry_policy` and `cancellation_token` before its callback, and `socket_send` drops its third argument.
  - **[orthographic](/api/orthographic.camera)** — `add_projector`, `get_projection_id`, `use_projector` and the constants `MSG_USE_PROJECTION` and `ORTHOGRAPHIC_RENDER_SCRIPT_USED` are gone; upstream defines none of them, so each already failed or read `nil` at runtime. `world_to_screen` drops its third `adjust_mode` argument, which upstream silently ignored.
  - **[rendy](/api/rendy)** — `animate` and `cancel_animations` are gone; use `go.animate` and `go.cancel_animations` directly.
  - **[yagames](/api/yagames)** — the five `banner_*` calls give way to the sticky-banner API upstream documents (`adv_show_banner_adv`, `adv_hide_banner_adv`, `adv_get_banner_adv_status`), the four sitelock functions are gone because the module never exported them, and `payments_get_catalog` takes upstream's `(options, callback)`.
- [`wall`](./wall.md) judges a directory by its whole subtree rather than only the sources it directly holds, so a directory whose subdirectories add another kind is no longer eligible. Wall the single-kind directories beneath it instead.

### Improved

- Every library's types are now maintained in this repo, forked from upstream where no usable structured source exists: declare the dependency and [`resolve`](./resolve.md) materializes them. Imports and type surfaces carry over unchanged except as noted here.
  - **Reference pages moved** — a single-module library now lives at its bare namespace: `/api/nakama`, `/api/persist`, `/api/yagames`, `/api/gooey`, `/api/bzAnim`, `/api/platypus`, `/api/dicebag` and `/api/rendy`. [bzAnim](/api/bzAnim)'s documented import becomes `import * as bzAnim`, over the same `"bzAnim.bzLibrary"` path.
  - **[defsave](/api/defsave)** — the previous binding declared about half the module, so the fork adds seven functions (`obfuscate`, `get_file_path`, `key_exists`, `isset`, `reset_to_default`, `is_loaded`, `final`), the config fields, and `save`'s `force` argument.
  - **[boom](/api/boom)** — the pin moves off the `1.0.0` tag, which predates the camera helpers `to_screen` and `to_world`; both are declared now.
  - **[orthographic](/api/orthographic.camera)** — `camera.follow` accepts an array of game objects as well as a single one, and `get_view` and `get_projection` return [`Matrix4`](/api/Matrix4) instead of `unknown`.
  - **[metrics](/api/metrics.fps)** — both modules gain the module-level `update()`, `draw()` and `fps()`/`mem()` calls upstream defines over its built-in singleton, so you can read the FPS or memory figure without creating an instance.
  - **[gooey](/api/gooey)** — `gooey.group` takes the `action_id` and `action` arguments the runtime requires, so the four-argument call every upstream example writes finally type-checks.
  - **[yagames](/api/yagames)** — `player_get_id` keeps a correctly spelled pointer to `player_get_unique_id`, and `leaderboards_init` is marked deprecated as upstream marks it.
  - **[monarch](/api/monarch.monarch)** — upstream's README documents the focus listener as `on_focus_change`; the function the runtime defines, and the one these types bind, is `on_focus_changed`.
- **[panthera](/api/panthera)** (`Insality/panthera`) joins the corpus: declare the dependency and [`resolve`](./resolve.md) materializes a typed `panthera.panthera` covering `create_go`/`create_gui`/`create`, `play`/`play_tweener` and the animation-state shape. `defold-tweener` is a runtime companion only — panthera's types resolve without it.
- Every forked library is measured against its own upstream Lua on two separately ratcheted axes, functions and constants, so one nobody has checked can no longer read as clean: 35 of the 35 modules now cover their upstream's whole surface on both. Generated libraries carry a committed coverage floor too, so regenerating one can no longer quietly type less of it than before.
- More of each generated library's surface carries a real type where it previously fell back to `unknown`.
  - **Callback parameters** — arguments documented only as `function` in [event](/api/event), [lang](/api/lang) and [druid](/api/druid) are callable types, so you can pass a typed function literal and call the value back without a cast.
  - **Nullable unions** — values documented as a union with nil, such as [bridge](/api/bridge)'s `platform.id` and `player.name`, type as `string | undefined`, so a null check is enough.
  - **[druid](/api/druid)** — `druid.button`'s six style hooks and `druid.drag`'s `init` callback name their real parameter types, `druid.layout`'s `rows` is a `druid_layout_row_data[]`, and a multi-return call such as `druid.layout.get_content_size` returns a `LuaMultiReturn` tuple. Component callback fields like `on_click` and `on_hover` are [event](/api/event) objects you can `subscribe` to — declare `defold-event` alongside druid so the type resolves.
  - **[log](/api/log)** — `get_default_logger_name` takes the real `debug.getinfo()` table, so reading `short_src` off it type-checks.
  - **[decore](/api/decore)** — `ecs.world` returns a rest tuple you can spread instead of a fixed pair whose second slot was a single anonymous `unknown`.
- A library's API reference page shows more of what its types actually say.
  - **Constants and briefs** — a forked library's page documents constants as well as functions: 61 constants gained the description their fork already carried, eleven members were written up in the fork's own words, and 254 members across 14 libraries fall back to upstream's prose under a `U` dot marking it as borrowed.
  - **Options shapes** — an options object documents its fields instead of rendering as a bare type name — 29 shapes across five libraries, including [monarch](/api/monarch.monarch)'s `ShowOptions` and [gooey](/api/gooey)'s `ButtonState`. Optional fields are marked `?`, so an all-optional table no longer reads as all-required.
  - **Deprecations** — an upstream `@deprecated` marker shows as a `Deprecated` line carrying its explanation, in the same block the engine pages use. A tag on a *type* rather than a member reaches the shipped `.d.ts`, where your editor strikes the name through, but not the page.
  - **Ambient globals** — a library declaring most of its surface outside its module block finally documents it: [boom](/api/boom) goes from 1 symbol to 112 and [deftest](/api/deftest) from 2 to 32. Each is marked `G`, and the page's import step notes they are callable without the import.
- The Libraries tree is organized by GitHub origin: a library nests under its owner and the repo you actually install (`britzl/defold-input`, not `britzl/in`), a repo publishing a single module collapses to one row, and every row spells its `owner/repo/namespace` path out on hover. The maintained-here pin is gone — every library is maintained here now, so it distinguished nothing.
- [`wall`](./wall.md) understands nested walls, so you declare one at the boundary you actually mean instead of at every leaf.
  - **Inheritance** — a wall on a parent directory that holds no sources of its own narrows every directory beneath it, including subdirectories added later.
  - **Override** — a nested wall fully replaces the one it sits inside, instead of leaving its files in the outer program where `gui.*` could type-check inside a `script` wall.
  - **Provenance** — `wall --list --json` reports every narrowed directory with `origin` (`declared` or `inherited`) and the `declaredIn` ancestor that caused it; the plain `--list` line names the inherited pairs.
- A new `--fail-on-drift` flag turns the [installed-editor-vs-pin drift notice](./pinning-defold-target.md) into a non-zero exit on `build`, `watch`, [`run`](./run.md), `upgrade` and `bob build`/`bundle`/`run`, so CI stops passing on a warning nobody reads. The notice text and `--json` payload are unchanged, and a command that already failed keeps its own exit code.
- The [agent runbooks](./agent-runbooks.md) warn that the script lifecycle factory needs a *value* import — the `import type` plus `declare const` form builds `ok: true` while leaving the hooks unerased — and route Defold's resulting `FORMAT_ERROR` resource cascade back to that fix.

### Fixed

- Forked libraries declare members their upstream really defines that the previous bindings left out.
  - **[yagames](/api/yagames)** — 22 members covering whole feature areas: the events API, the multiplayer-sessions trio, the five `features_*` calls, five `player_*` getters, the shortcut-prompt pair, `flags_get`, `is_available_method`, `server_time` and `device_info_is_tv`.
  - **[nakama](/api/nakama)** — 16 members: the subscriptions area, the cancellation pair `cancellation_token` and `cancel`, plus `delete_account` and `delete_tournament_record`. Its 12 enum constants are declared too, typed as their literal values so `op === nakama.APIOPERATOR_BEST` narrows.
  - **[gooey](/api/gooey)** — `is_enabled`, `acquire_input`, `release_input`, `create_theme`, `mask_text`, `radiogroup`, `horizontal_scrollbar` and `set_focus`.
  - **[monarch](/api/monarch.monarch)** — the seven live message hashes (`TRANSITION_*`, `FOCUS_GAINED`, `FOCUS_LOST`) and `register`, upstream's alias of `register_proxy`. The grouped `TRANSITION` and `FOCUS` objects offered instead are now marked deprecated, as upstream marks them.
  - **[monarch.transitions.gui](/api/monarch.transitions.gui)** — the twelve transitions are declared as functions rather than constants of an opaque callable type, so the page documents each one's arguments.
  - **[orthographic](/api/orthographic.camera)** — `get_automatic_zoom` and `set_automatic_zoom`, plus the `MSG_SET_AUTOMATIC_ZOOM` message that does the same by post.
  - **[rendy](/api/rendy)** — `cameras` plus `display_width`, `display_height`, `window_width` and `window_height`. Upstream advises against manipulating these directly, which each one's doc-comment now says.
  - **[metrics](/api/metrics.fps)** — both modules expose the drawing defaults `POSITION`, `COLOR` and `FORMAT`, used for any `create` argument you omit.
  - **[dicebag](/api/dicebag)** — `bags` and `tables`, the keyed state every `bag_create`/`table_create` writes into and every draw reads back.
  - **[defcon](/api/defcon)** — `register_module` takes upstream's optional second `name` argument, and the module exposes `print`, `pprint` and `server`.
  - **[platypus](/api/platypus)** — `SEPARATION_RAYS` and `SEPARATION_SHAPES`, the two values for `collisions.separation`.
  - **[bzAnim](/api/bzAnim)** — `setMaxPoints`, `registerController` and `unregisterController`.
  - **[richtext.color](/api/richtext.color)** — `parse`, `parse_hex` and `parse_decimal`; **[nakama.util.log](/api/nakama.util.log)** — `custom` and `format`; **[persist](/api/persist)** — `exists`.
- A dependency that ships modules across two of this repo's registry lanes now resolves and materializes every module; [`resolve`](./resolve.md) previously kept only the first lane's module and silently dropped the rest.
- The explicit type-argument factory form the [script lifecycle](./script-lifecycle.md) guide documents — `export default defineGuiScript<MenuSelf>({ … })` — builds to its component file (`src/menu.ts.gui_script`) instead of falling through to a plain `.lua` module of the wrong kind, and a type-only name imported alongside the factory (`import { defineGuiScript, type Hash }`) no longer fails the build with an unresolvable `require`. The scaffolded agent contract matches: both self-typing forms work.
- [go](/api/go) and [msg](/api/msg) document the overloads the toolchain actually ships, each row carrying the description and parameter table its own call shape takes: `go.get` and `go.set` lead with their curried property-key generic, `go.property` lists its eight typed forms, `msg.post` its two and `msg.url` its three. The committed `llms-full.txt` carries the same forms.
- [TypeScript vs Lua](./typescript-vs-lua.md) no longer suggests a sufficiently pure npm package can work, and [TypeScript gotchas](./typescript-gotchas.md) gains an entry with the exact build failure, why `node_modules` is never read, and how to vendor the source under `src/` instead.
- A library whose types are generated from its README reads an argument bracketed across a comma (`data [, overwrite]`) or through an escaped bracket (`duration \[, scaler]`) as optional rather than required, and marks every argument inside a multi-argument group optional.
- A library reference page with a dotted namespace, such as [monarch.transitions.easings](/api/monarch.transitions.easings), titles itself `britzl/monarch/monarch.transitions.easings` again — matching its Libraries card — instead of repeating the namespace twice with the author dropped, and its heading wraps at the dots rather than scrolling the page sideways.
- [narrator](/api/narrator)'s `Story.observe` callback parameter is named `value`, after the argument the library actually passes it.
- A documentation source can no longer replace a library's existing types with a weaker surface: a source documenting no parameter or return types, one whose comparison surface was truncated, and one hidden behind a single exported handle were all scoring as clean matches. [persist](/api/persist) and [yagames](/api/yagames) keep the types they had.

## v0.23.0

### Breaking

- More libraries' types are now maintained in this repo — each regenerated from its upstream source through the shared LuaLS / ref-doc pipeline (as with [druid](/api/druid) and [decore](/api/decore)) and marked with the maintained-here pin in the docs; each surface now follows upstream, so it differs from the previous hand-written binding.
  - **[tweener](/api/tweener)** (`Insality/defold-tweener`, tag `6`) — per-easing helpers are no longer module-level constants.
  - **[bridge.bridge](/api/bridge)** (`Playgama/bridge-defold`, `v2.0.0`) — regenerated from its committed `.script_api` as an importable `declare module`.
  - **[event](/api/event)** (`Insality/defold-event`, tag `19`) — the former untyped `any` passthrough now carries real types (`event.create`, subscribe/trigger, promise and queue instances).
  - **[lang](/api/lang)** (`Insality/defold-lang`, tag `5`) — the twelve typed functions are tightened, and `load_langs`, the state getters, and typed `lang.data`/`lang.state` are added.
  - **[log](/api/log)** (`Insality/defold-log`, tag `6`) — `get_logger`'s name argument is now optional and its forced-level argument a plain `string`, and the logger's level methods now require their `data` argument.
  - **[proto](/api/proto)** (`Insality/defold-proto`, tag `1`) — `get`/`decode`/`verify` return the native `LuaTable`, `set_logger` takes a typed `proto_logger`, and the full encoding API is surfaced.
  - **[saver.saver](/api/saver.saver)** and **[saver.storage](/api/saver.storage)** (`Insality/defold-saver`, tag `8`) — `init`, `save_game_state`, `get_save_path`, and `set_logger` take their typed optional arguments and the full save and key-value storage APIs are surfaced.
  - **[immutable](/api/immutable)** (`paweljarosz/lua-immutable`, tag `v1.1`) — `make` returns the typed `Immutable` interface rather than a generic `Readonly<T>`.
  - **[squid](/api/squid)** (`paweljarosz/squid`, tag `1.2`) — the previous binding typed only `save_logs`/`get_config().is_enabled`; the surface now exports the module log-level constants and logging API, a typed `get_config`/`SquidConfig`, and a typed `SquidInstance` from `new()`.
  - **[narrator](/api/narrator)** (`astrochili/narrator`, tag `1.8`) — replaces the hand-written passthrough with the upstream parser plus the `Narrator.Story` runtime API, made runtime-faithful: `parse_content` takes its `inclusions` argument optionally, `continue()` returns a single paragraph or an array of them, and the internal `Object`/`constructor` tables no longer leak into the surface.

### Improved

- The editor-scripting authoring path is now documented: a [Core-concepts guide page](./editor-scripts.md) walks through `defineEditorScript`, the `<name>.ts.editor_script` artifact, and the editor's auto-load discovery, with a worked custom-command example.
- LuaLS library types ([druid](/api/druid), [decore](/api/decore), [tweener](/api/tweener), [event](/api/event), [lang](/api/lang)) now emit every nil-bearing trailing argument — both `T | nil` unions and type-suffix `T?` params — as optional, and nilable interface fields (`function | nil`, `string?`) as omittable object properties. Faithful upstream calls like `event.create()`, `instance.subscribe(cb)`, `lang.set_lang("en")`, `lang.set_next_lang()`, and `lang.init([{ id, path }])` now type-check instead of demanding an explicit `undefined`, and object literals may drop fields like `loader` they faithfully omit. Event and promise instances are also callable now (`instance(payload)`), matching their runtime `__call`.

### Fixed

- Installed packages can now resolve the [bridge.bridge](/api/bridge) library again — its script_api resolve manifest was missing from the published tarball, so the [`resolve`](./resolve.md) command silently dropped `bridge` on a real install.
- A script_api library whose types reference engine handles ([Hash](/api/Hash), [Vector3](/api/Vector3), [Url](/api/Url), ...) now emits an importable `declare module` instead of a broken module augmentation, so `import { ... } from "<library>"` resolves instead of failing with `TS2307`.
- LuaLS library types ([druid](/api/druid), [event](/api/event), [log](/api/log), [tweener](/api/tweener)) no longer leak non-public members: fields and methods marked `@private`/`@protected`/`@package` (and methods marked `@local`) are hidden from the generated declarations, the `/api` docs, and the fidelity report alike, so the three surfaces describe one identical public set. For example the `log` logger drops `_last_gc_memory`/`_last_message_time`/`format`/`log`, and druid components drop the base's protected lifecycle hooks and `get_uid`.
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
