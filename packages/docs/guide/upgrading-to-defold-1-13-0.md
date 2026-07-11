---
toc-title: Upgrading to Defold 1.13.0
---
# Upgrading to Defold 1.13.0

Defold 1.13.0 is the current stable release and the toolchain's default API
target. Moving a project from 1.12.4 removes a handful of Lua APIs, changes some
source/asset expectations, and shifts a few rendering and platform defaults.
This page lists each change with actionable migration guidance and a way to
verify it.

Pair this with [Pinning the Defold target](./pinning-defold-target.md): pin the
old surface first to reproduce today's build, then flip the pin to `1.13.0` and
let the compiler point at everything that moved. The curated availability facts
behind the removed-symbol sections below live in
`packages/types/api-availability.json`; each removed symbol keeps a stable
heading here so the API lifecycle badges can link a reader straight to it.

## Reproduce, then flip the target

Reproduce the current build against the exact old surface, then re-run the same
command against 1.13.0 to surface every removed call as a compile error:

```sh
# what you ship today
bunx @defold-typescript/cli build --defold-target 1.12.4

# the same project against the new surface
bunx @defold-typescript/cli build --defold-target 1.13.0
```

Once the project compiles clean, record the target in `package.json` so every
later `build`, `watch`, and `resolve` agrees:

```jsonc
// package.json
{
  "defold-typescript": { "defold-target": "1.13.0" }
}
```

## Removed Lua APIs and constants

Each removed symbol is a compile error against the 1.13.0 surface. Its frozen
signature stays discoverable on the historical [1.12.4 API
pages](/api/defold-1.12.4/liveupdate); the current-surface namespace pages linked
below show what replaced it.

### liveupdate.add_mount

The old Live Update auto-mount API is gone. `liveupdate.add_mount` — historical
reference on the [1.12.4 `liveupdate` page](/api/defold-1.12.4/liveupdate) — no
longer exists on the 1.13.0 [`liveupdate`](/api/liveupdate) surface. Mounts are
now declared through the resource-system mount configuration rather than added
imperatively at runtime, and mount names are hashed (see the source migrations
below). Remove the runtime `add_mount` call and move the mount into the project's
Live Update configuration.

### liveupdate.remove_mount

`liveupdate.remove_mount` is removed alongside `add_mount`. Manage mounts through
the configured mount set on the current [`liveupdate`](/api/liveupdate) surface
instead of tearing one down imperatively; the historical signature stays on the
[1.12.4 `liveupdate` page](/api/defold-1.12.4/liveupdate).

### model.material

The single-slot `model.material` property is removed. A model can carry several
material slots, so address a slot by name with the component material APIs on the
current [`model`](/api/model) surface instead of the one blanket property; the
removed property's frozen shape stays on the [1.12.4 `model`
page](/api/defold-1.12.4/model).

## Source and project migrations

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

## Rendering and platform behavior

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

## Verification

After flipping the pin, prove the upgrade end to end:

1. Type-check against 1.13.0 — every removed call above is now a compile error,
   so a clean type-check means no removed API survives in your source:

   ```sh
   bunx @defold-typescript/cli build --defold-target 1.13.0
   ```

2. Confirm the resolved target and surface in the `--json` envelope report
   `1.13.0`, as described in [Pinning the Defold
   target](./pinning-defold-target.md#what---json-reports).
3. Build and run the game in the Defold 1.13.0 editor and walk the
   rendering/platform changes above (winding, culling, splash, and — on Android
   or HTML5 — the platform defaults), since those cannot be caught by the
   compiler.
