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

## v0.23.0

### Breaking

- The `tweener` library types are now maintained in this repo, regenerated from upstream `Insality/defold-tweener` (pinned tag `6`) through the same LuaLS pipeline as druid and decore, and marked with the maintained-here pin in the docs. The surface follows upstream's annotations, so it differs from the previous hand-written binding (notably the per-easing helpers are no longer exposed as module-level constants).
- The `bridge.bridge` types (`Playgama/bridge-defold`, pinned `v2.0.0`) are now maintained in this repo, regenerated from the library's own committed `.script_api` through the shared ref-doc pipeline as an importable `declare module`, and carry the maintained-here pin in the docs. The surface follows upstream's `.script_api`, so it differs from the previous hand-written ts-defold binding.
- The `event` library types (`Insality/defold-event`, pinned tag `19`) are now maintained in this repo, regenerated from upstream's LuaLS annotations through the same pipeline as druid and tweener, and carry the maintained-here pin in the docs. The previous binding was an untyped `any` passthrough, so members like `event.create`, subscribe/trigger, and the promise and queue instances now carry real types.
- The `lang` library types (`Insality/defold-lang`, pinned tag `5`) are now maintained in this repo, regenerated from upstream's LuaLS annotations through the same pipeline as druid and event, and carry the maintained-here pin in the docs. The previous hand-written binding declared twelve typed functions (`init`, `set_lang`, `get_lang`, `get_langs`, `set_next_lang`, `get_next_lang`, `is_exist`, `txt`, `txp`, `txr`, `set_logger`, `reset_state`); the regenerated surface both tightens those and adds `load_langs`, the state getters, and typed `lang.data`/`lang.state`. The regenerated types briefly regressed faithful trailing-optional calls (`set_lang("en")`, `set_next_lang()`, `init([...])`), now repaired.
- The `log` library types (`Insality/defold-log`, pinned tag `6`) are now maintained in this repo, regenerated from upstream's LuaLS annotations through the same pipeline as druid and lang, and carry the maintained-here pin in the docs. The surface follows upstream's annotations, so it differs from the previous hand-written binding: `get_logger`'s logger-name argument is now optional and its forced-level argument is a plain `string` rather than a level union, and the logger's `trace`/`debug`/`info`/`warn`/`error` methods now require their `data` argument instead of taking it optionally.

### Improved

- The editor-scripting authoring path is now documented: a Core-concepts guide page walks through `defineEditorScript`, the `<name>.ts.editor_script` artifact, and the editor's auto-load discovery, with a worked custom-command example.
- LuaLS library types (druid, decore, tweener, event, lang) now emit every nil-bearing trailing argument — both `T | nil` unions and type-suffix `T?` params — as optional, and nilable interface fields (`function | nil`, `string?`) as omittable object properties. Faithful upstream calls like `event.create()`, `instance.subscribe(cb)`, `lang.set_lang("en")`, `lang.set_next_lang()`, and `lang.init([{ id, path }])` now type-check instead of demanding an explicit `undefined`, and object literals may drop fields like `loader` they faithfully omit. Event and promise instances are also callable now (`instance(payload)`), matching their runtime `__call`.

### Fixed

- Installed packages can now resolve the `bridge` library again — its script_api resolve manifest was missing from the published tarball, so `defold-typescript resolve` silently dropped `bridge` on a real install.
- A script_api library whose types reference engine handles (`Hash`, `Vector3`, `Url`, ...) now emits an importable `declare module` instead of a broken module augmentation, so `import { ... } from "<library>"` resolves instead of failing with `TS2307`.
- LuaLS library types (druid, event, log, tweener) no longer leak non-public members: fields and methods marked `@private`/`@protected`/`@package` (and methods marked `@local`) are hidden from the generated declarations, the `/api` docs, and the fidelity report alike, so the three surfaces describe one identical public set. For example the `log` logger drops `_last_gc_memory`/`_last_message_time`/`format`/`log`, and druid components drop the base's protected lifecycle hooks and `get_uid`.

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
