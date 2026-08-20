---
toc-title: Upgrading Defold versions
---
# Upgrading Defold versions

This is the standing runbook for moving a project from one pinned Defold API
surface to another, followed by one section per release recording exactly what
changed in it. The runbook is version-agnostic — read `<old>` as the version you
ship today and `<new>` as the one you are moving to — so it stays true for every
upgrade; the per-release sections below carry the concrete facts.

Pair it with [Pinning the Defold target](./pinning-defold-target.md): pin the old
surface first to reproduce today's build, then flip the pin to `<new>` and let
the compiler point at everything that moved. The curated availability facts
behind the lifecycle notes live in `packages/types/api-availability.json`; each
symbol keeps a stable heading on this page so the API lifecycle badges can link a
reader straight to it.

## Reproduce, then flip the target

Reproduce the current build against the exact old surface, then re-run the same
command against the new one to surface every removed call as a compile error:

```sh
# what you ship today
bunx @defold-typescript/cli build --defold-target <old>

# the same project against the new surface
bunx @defold-typescript/cli build --defold-target <new>
```

Once the project compiles clean, record the target in `package.json` so every
later `build`, `watch`, and `resolve` agrees:

```jsonc
// package.json
{
  "defold-typescript": { "defold-target": "<new>" }
}
```

## Verification

After flipping the pin, prove the upgrade end to end:

1. Type-check against `<new>` — every removed call in that release's section is
   now a compile error, so a clean type-check means no removed API survives in
   your source:

   ```sh
   bunx @defold-typescript/cli build --defold-target <new>
   ```

2. Confirm the resolved target and surface in the `--json` envelope report
   `<new>`, as described in [Pinning the Defold
   target](./pinning-defold-target.md#what---json-reports).
3. Build and run the game in the matching Defold editor and walk the
   rendering/platform changes listed for that release by hand, since those
   cannot be caught by the compiler.

## Release notes

Each release below opens with a `<!-- release: <version> -->` marker. The
release-readiness gate reads only the marked section for the release being
shipped, so a note filed under an older release never counts as migration
coverage for a newer one. Add a section per release rather than a new page.

<!-- release: 1.13.1 -->

Defold 1.13.1 is the current stable release and the toolchain's default API
target. Moving a project from 1.12.4 removes a handful of Lua APIs, re-signatures
a few others, adds one, changes some source/asset expectations, and shifts a few
rendering and platform defaults. Each change below carries actionable migration
guidance and a way to verify it.

1.13.1 is a patch over 1.13.0, which it **replaced in place** — 1.13.0 is no
longer a shipped API surface, and its `/api/defold-1.13.0/…` pages are gone. A
project already on 1.13.0 needs no source migration beyond the two 1.13.1-only
entries called out below; everything else here is the 1.12.4 upgrade.

The runbook above, with this release's concrete targets:

```sh
# what you ship today
bunx @defold-typescript/cli build --defold-target 1.12.4

# the same project against the new surface
bunx @defold-typescript/cli build --defold-target 1.13.1
```

## Defold 1.13.1: changed Lua API signatures

These Lua APIs still exist on the 1.13.1 surface — one or more parameter types
changed rather than the symbol being removed, so a call written against 1.12.4
keeps compiling. The Combined API surface — now canonical at the unprefixed `/api`
(the old `/api/combined` links redirect there) — renders both signatures
adjacently; the exact-version pages (`/api/defold-1.13.1/…`, `/api/defold-1.12.4/…`)
show each in isolation.

### liveupdate.add_mount

Despite the old Live Update **auto-mount** framing, `liveupdate.add_mount` was
**not** removed — it remains an imperative runtime API on the 1.13.1
[`liveupdate`](/api/defold-1.13.1/liveupdate) surface. Its `name` parameter widened from
`string` to `string | Hash`, so a hashed mount name is now accepted alongside a
plain string, and the mount callback is typed more precisely. Compare the current
signature with the historical one on the [1.12.4 `liveupdate`
page](/api/defold-1.12.4/liveupdate).

### liveupdate.remove_mount

`liveupdate.remove_mount` likewise remains; its `name` parameter widened from
`string` to `string | Hash` so a hashed mount name resolves the mount to tear
down. The [1.12.4 `liveupdate` page](/api/defold-1.12.4/liveupdate) keeps the old
single-string signature for comparison.

### gui.set

**New in 1.13.1.** `gui.set`'s `value` parameter accepts `nil` alongside the
number and vector types it already took, so a property can be cleared rather than
only reassigned. Existing calls are unaffected — the change is a widening. The
[1.12.4 `gui` page](/api/defold-1.12.4/gui) shows the narrower signature for
comparison; the current one is on the 1.13.1
[`gui`](/api/defold-1.13.1/gui) surface.

## Defold 1.13.1: added Lua APIs

### collectionproxy.load

**New in 1.13.1.** `collectionproxy.load` is new on the 1.13.1
[`collectionproxy`](/api/defold-1.13.1/collectionproxy) surface. It is purely
additive, so no existing call needs changing; a project that wants it must pin
`--defold-target 1.13.1` or newer.

## Defold 1.13.1: removed Lua APIs and constants

Each removed symbol is a compile error against the 1.13.1 surface. Its frozen
signature stays discoverable on the historical [1.12.4 API
pages](/api/defold-1.12.4/model); the current-surface namespace pages linked
below show what replaced it.

### model.material

The single-slot `model.material` property is removed. A model can carry several
material slots, so address a slot by name with the component material APIs on the
current [`model`](/api/defold-1.13.1/model) surface instead of the one blanket property; the
removed property's frozen shape stays on the [1.12.4 `model`
page](/api/defold-1.12.4/model).

## Defold 1.13.1: deprecated Lua APIs

These APIs still compile and run against the 1.13.1 surface but are marked
**deprecated** in the engine reference. No replacement is announced upstream, so
nothing is forced right now — treat them as candidates for removal in a future
release and avoid them in new code.

- **`model.reset_constant`, `sprite.reset_constant`, `tilemap.reset_constant`.**
  The per-component "reset a shader constant" helpers are deprecated in 1.13.0.
  They keep working and there is no documented successor to migrate to yet, so no
  action is required today.
- **`acquire_camera_focus`, `release_camera_focus` (camera messages).** The two
  camera-focus messages are deprecated in 1.13.0. They still post and route with
  their existing payloads, and `builtin-messages.d.ts` now marks them
  `@deprecated`, so `msg.post` calls that name them keep compiling. No successor
  is announced, so no action is required today — avoid them in new code.

<!-- no-action: model.reset_constant -->
<!-- no-action: sprite.reset_constant -->
<!-- no-action: tilemap.reset_constant -->
<!-- no-action: acquire_camera_focus -->
<!-- no-action: release_camera_focus -->

## Defold 1.13.1: source and project migrations

These changes touch assets and project configuration rather than the typed Lua
surface, so the compiler cannot flag them — audit them by hand.

- **Collada removal.** Collada (`.dae`) mesh import is removed. Re-export any
  remaining Collada meshes to glTF (`.gltf`/`.glb`) before upgrading; the engine
  no longer loads the old format.
- **glTF transform and re-centering.** glTF import no longer silently re-centers
  or bakes node transforms the way older versions did. A model that relied on the
  old re-centering may shift position; re-check pivots and any code that assumed
  the previous origin, and re-bake transforms in your DCC tool if needed.
- **Hashed mount names.** Live Update mount names are now hashes rather than raw
  strings. Anywhere you compared or logged a mount name as a string, switch to
  the hashed identity the resource system reports.
- **Spine extension 4.6.0 minimum.** Spine support moved fully into the external
  Spine extension, and 1.13.0 requires **Spine extension 4.6.0** or newer. Bump
  the Spine dependency in `game.project` to at least `4.6.0`; older extension
  versions will not build.

## Defold 1.13.1: rendering and platform behavior

Defaults changed here. Nothing is a Lua API removal, but the rendered result or
the target platform behaves differently.

- **Counter-clockwise component winding.** Component triangle winding is now
  counter-clockwise. Custom render setups or shaders that assumed clockwise
  front-face winding may cull the wrong side; flip the winding or face-culling
  state in affected materials.
- **Particle-effect culling.** Particle effects now participate in view culling,
  so an effect fully outside the camera frustum can stop drawing. If an effect
  must always render, keep its emitter within view bounds or account for the new
  culling in your render predicate.
- **Android Vulkan default.** Android now defaults to the Vulkan graphics
  adapter. If a device or shader misbehaves under Vulkan, verify against the
  Vulkan path first and fall back to OpenGL explicitly in `game.project` only
  when a device needs it.
- **HTML5 splash containment.** The HTML5 splash screen is now contained within
  the canvas rather than spanning the page. Custom HTML shells that positioned
  the splash against the full window should re-check their layout.
- **asm.js removal.** The HTML5 build no longer emits an asm.js fallback; builds
  are WebAssembly-only. Drop any asm.js-specific loader branches from a custom
  HTML5 shell, since only the WebAssembly artifact is produced.
