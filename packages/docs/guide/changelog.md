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

## v0.20.7

### Added

- Guide pages for the `run` and `bob` commands, covering the launch/build
  workflow, the two `run` resolver errors, the `bob.jar` cache, and the
  per-subcommand `--json` shapes.
- A pre-commit gate that fails any commit not staging a change to this
  changelog, so it can no longer drift behind the work that lands; bypass a
  genuine exception with `git commit --no-verify`.
- Groundwork for typing LuaLS-annotated Lua libraries: a pinned, per-library
  `luals-targets.json` config with an offline fixture-fetch step
  (`bun run luals:fetch`, seeded with `Insality/druid`) that snapshots matched
  Lua source, plus a pure-Lua corpus registry. No new library types ship yet —
  the annotation parser and emitter land in later releases.
- A line-oriented `---@` annotation scanner (`parseLualsSource`) that reads the
  fetched LuaLS source into a richer `LibraryModel` — interfaces with
  methods/fields/generics/extends, aliases, and module functions — preserving
  every LuaLS type expression as a raw token (mapping to TypeScript is a later
  release). Locked against the pinned druid fixture with a parse snapshot. Still
  no library `.d.ts` output.

### Fixed

- The LuaLS annotation scanner (`parseLualsSource`) now reads a `---@field`
  visibility modifier (`public`/`protected`/`private`/`package`) into a new
  optional `visibility` instead of mistaking it for the field name — realigning
  71 Druid fields whose name/type/doc were shifted a column — and captures
  `---@vararg` as a trailing `...` param, so methods like `druid.instance:new`
  no longer lose their variadic argument. Internal ingest tooling; no library `.d.ts`
  output yet.
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
