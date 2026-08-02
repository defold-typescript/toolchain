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

- [defsave](/api/defsave)'s results are typed accurately now that its surface is maintained here and corrected against upstream `v1.2.6`: `save` and `set` returned `void` and now return `boolean | undefined`, and `load` narrows from `unknown` to `boolean | undefined`. Code that assigned or asserted on those results may need updating.
- [druid](/api/druid)'s drag callback now declares the six parameters the runtime really passes — `(self, dx, dy, x, y, touch)` — instead of `(self, touch)`. A handler written against the old shape read `touch` out of the second argument, which is actually `dx`; it no longer type-checks until its parameter list is updated.
- [druid](/api/druid)'s `layout.on_size_changed.subscribe` now takes the inherited [event](/api/event) signature — `subscribe(callback, context?)` returning `boolean` — instead of the three-argument `(_, callback, context)` form the old annotation restated. Calls passing a leading placeholder argument need it removed.

### Improved

- Libraries whose upstream ships no usable structured source — or only one too lossy to generate from — are now first-party forked `.d.ts`s maintained in this repo: declaring the upstream dependency resolves and materializes the types through [`resolve`](./resolve.md), and each docs page imports the library under its module id. Type surfaces generally carry over unchanged — only their provenance and end-to-end resolution move; [defsave](/api/defsave) and [orthographic](/api/orthographic.camera) are the exceptions, where being maintained here is what let a surface be corrected against its pin.
  - **[defcon](/api/defcon)** (`britzl/defcon` `2.6.0`) — imported as `import * as defcon from "defcon.console"`.
  - **[deftest](/api/deftest)** (`britzl/deftest` `2.8.0`) — imported as `import * as deftest from "deftest.deftest"`; its ambient test-DSL globals (`describe`, `test`, `assert_*`) carry along in the fork.
  - **[defmath](/api/defmath)** (`subsoap/defmath` `c67c2273`) — imported as `import * as defmath from "defmath.defmath"`; pinned to a commit SHA as upstream ships no tags.
  - **[zzfx](/api/zzfx)** (`thejustinwalsh/defold-zzfx` `8c90e12c`) — imported as `import * as zzfx from "zzfx.api"`; pinned to a commit SHA as upstream ships no tags.
  - **[boom](/api/boom)** (`britzl/boom` `1.0.0`) — imported as `import * as boom from "boom.boom"`; the game framework's ambient globals (`add`, `vec2`, `rand`, the color constants) and component interfaces carry along in the fork.
  - **[nakama helpers](/api/nakama.engine.defold)** (`heroiclabs/nakama-defold` `v3.4.0`) — the two hand-written helper modules `nakama.engine.defold` and `nakama.util.log` are now forked here; the codegen'd `nakama.nakama` stays ts-defold-sourced.
  - **[defsave](/api/defsave)** (`subsoap/defsave` `v1.2.6`) — imported as `import * as defsave from "defsave.defsave"`; the previous binding declared about half the module, so the fork adds the seven missing functions (`obfuscate`, `get_file_path`, `key_exists`, `isset`, `reset_to_default`, `is_loaded`, `final`) and the config fields (`autosave`, `enable_obfuscation`, …), and gives `save` its `force` argument.
  - **[persist](/api/persist)** (`whiteboxdev/library-defold-persist` `b37f6104`) — imported as `import * as persist from "persist.persist"`; its types are unchanged, and its reference page moves from `/api/persist.persist` to `/api/persist`.
  - **[orthographic](/api/orthographic.camera)** (`britzl/defold-orthographic` `3.6.3`) — imported as `import * as camera from "orthographic.camera"`, with its page and import unchanged. `camera.follow` now accepts an array of game objects as well as a single one, and `camera.get_view` and `camera.get_projection` return [`Matrix4`](/api/Matrix4) instead of `unknown` — both matching what upstream documents.

- More of each generated library's surface now carries a real type where it previously fell back to `unknown`.
  - **Callback parameters** — arguments documented only as `function` in [event](/api/event), [lang](/api/lang), and [druid](/api/druid) are callable types now, so you can pass a typed function literal and call the value back without a cast.
  - **Nullable unions** — values documented as a union with nil, such as [bridge](/api/bridge.bridge)'s `platform.id`, `platform.tld`, `platform.payload`, `player.id`, and `player.name`, type as `string | undefined`, so you can use them after a null check without a cast.
  - **[druid](/api/druid) callbacks and multi-returns** — `druid.button`'s six style hooks and `druid.drag`'s `init` callback name their real parameter types now, and `druid.layout`'s `rows` field is a `druid_layout_row_data[]`. A function documented with several return values, such as `druid.layout.get_content_size`, returns a `LuaMultiReturn` tuple instead of `unknown`.
  - **[druid](/api/druid) callback fields** — `on_click`, `on_hover`, and every other component callback field are [event](/api/event) objects you can `subscribe` to, rather than `unknown`. Declare `defold-event` alongside druid so the type resolves.

- Every generated library's type coverage is now pinned by a committed floor, so regenerating it can no longer quietly reduce how much of its surface is typed — a drop fails the suite instead of rewriting the report. [Authoring LuaLS library types](./authoring-luals-library-types.md) covers locking in a genuine improvement.

- The [agent runbooks](./agent-runbooks.md) now warn that the script lifecycle factory needs a *value* import — the `import type` plus `declare const` form builds `ok: true` while leaving the hooks unerased — and route Defold's resulting `FORMAT_ERROR` resource cascade back to that fix.

### Fixed

- A dependency that ships modules across two of this repo's registry lanes — such as [`heroiclabs/nakama-defold`](/api/nakama.engine.defold), whose `nakama.nakama` is codegen'd while its `nakama.engine.defold` and `nakama.util.log` helpers are forked — now resolves and materializes every module; [`resolve`](./resolve.md) previously kept only the first lane's module and silently dropped the rest.
- The upstream-migration fidelity gate is stricter about when a documentation source may replace a library's existing types, so no migration can quietly downgrade a surface you already depend on.
  - **No parameter or return types** — a source that names a library's functions but documents none of their signatures previously scored as a clean match and would have swapped a fully-typed surface for argument-less stubs. [persist](/api/persist) was the first library to hit this and keeps its existing types.
  - **Truncated comparison surface** — a binding whose types use `//*` section comments had everything up to the next block-comment terminator silently hidden from the gate, so members that would have been reported lost were not visible to lose. [yagames](/api/yagames.yagames) was the only such binding, with 9 of its 52 members hidden; it too keeps its existing types.
- Guide pages that described behavior the tools do not actually have are corrected.
  - **[TypeScript vs Lua](./typescript-vs-lua.md)** — the "self-contained Lua" wording no longer suggests a sufficiently pure npm package can work, and [TypeScript gotchas](./typescript-gotchas.md) gains an entry with the exact build failure, why `node_modules` is never read, and how to vendor the source under `src/` instead. It shows the output paths a scaffolded project really produces — `src/vendor/pure-pkg.lua` beside `src/main.ts.script` — and notes that include-base stripping runs only when `outDir` names a directory other than `.`.
  - **[Forked-library authoring](./authoring-forked-library-types.md) — `defmath`** — the worked example now describes how a fork's core engine types resolve, through the `@defold-typescript/types` ambient reference the validity gate pulls in, instead of the previous wrong claim about `vmath.*` member types and "vmath aggregation."
  - **Forked-library authoring — [defsave](/api/defsave)** — the worked example had the retired binding's member counts wrong (7 functions plus `appname`, not 8 functions and no fields), and its "100% fidelity" claim now reads accurately: the identity diff proves the emit is lossless, not that the surface matches upstream.
  - **Forked-library authoring — fork source and namespace** — the step-by-step procedure now matches the lane it documents instead of contradicting its own worked examples: a fork copies the shipped `generated/` golden rather than the raw ts-defold fixture, and a publish namespace may be dotted, in which case the cutover overwrites the retired goldens in place instead of deleting them.

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
