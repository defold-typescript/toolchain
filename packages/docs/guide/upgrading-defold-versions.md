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

## Reading the API reference over a range

The API reference covers a *range* of Defold releases rather than one, so a single
page can answer "what changed between the version I ship and the one I am moving
to". Two dropdowns pick the range:

- **From** is the oldest release in view. Narrowing it hides the symbols that had
  already gone by then, sidebar counts included.
- **To** is the newest release in view. It also decides which declaration a
  symbol renders with: the newest declaration made inside the range, or
  the signature the symbol was built with when the range declares none, so a
  deprecated symbol keeps its full declaration rather than a weaker one.

Setting both to the same release is the exact-version view — everything that
release carries, and nothing else, as on [the 1.13.0 `go`
page](/api/defold-1.13.0/go). The unprefixed `/api/<namespace>` is the full range
across every tracked release, `/api/<version>/<namespace>` is the range ending at
that version, and appending `?since=<version>` states the lower bound explicitly.

A page that spans releases carries two vocabularies, and they answer different
questions:

- **The version note is absolute.** It names the release the symbol really
  arrived in or left, which may sit outside the range you selected — `Since
  Defold 1.13.0` means 1.13.0, whatever the `From` bound says. Each note line
  leads with the `N`/`C`/`D` chip for that fact across every tracked release, so
  it stays visible when the heading's range-relative chip hides.
- **No version note means "in every tracked release".** Such a symbol may be far
  older than the oldest release tracked here; the API index states which releases
  those are, and the `From` dropdown names the oldest of them.
- **The colored marker and its counts are relative to the range.** The `N`/`C`/`D`
  markers on a symbol, the counts beside a namespace title and the counts in the
  sidebar all describe movement *inside* the selected range: `New` reaches the
  `To` release but not the `From` one, and `Changed` moved some other way in
  between. So an unmarked symbol did not move inside your range — it may still
  carry an absolute version note — and setting `From` and `To` to the same
  release marks nothing `New` or `Changed`, because a release has not moved
  relative to itself.
- **`Deprecated` is bounded by `To` alone.** A symbol shows it when the
  deprecation had already happened by the `To` release, whatever `From` is set to;
  a deprecation landing after `To` does not mark a symbol before it happened. That
  bound is why a same-release range can still mark `Deprecated`: the symbol really
  is deprecated in the release you are reading.

## Release notes

Each release below opens with a `<!-- release: <version> -->` marker and one
`## Defold <version>` heading, with that release's notes nested under it. The
release-readiness gate reads every marked section covering the hop from the
previous stable release up to the one being shipped, so each release keeps its
own "what changed" notes under its own version — a change is never relabelled
forward onto a later release. A note filed under the release you are upgrading
*from* is not migration coverage. Add a section per release rather than a new
page.

<!-- release: 1.13.0 -->

## Defold 1.13.0

Moving a project from 1.12.4 removes a handful of Lua APIs, re-signatures a few
others, changes some source/asset expectations, and shifts a few rendering and
platform defaults. Each change below carries actionable migration guidance and a
way to verify it.

The runbook above, with this release's concrete targets:

```sh
# what you ship today
bunx @defold-typescript/cli build --defold-target 1.12.4

# the same project against the new surface
bunx @defold-typescript/cli build --defold-target 1.13.0
```

### Changed Lua API signatures

These Lua APIs still exist on the 1.13.0 surface — one or more parameter types
changed rather than the symbol being removed, so a call written against 1.12.4
keeps compiling. Because [an API page covers a
range](#reading-the-api-reference-over-a-range), both signatures render adjacently
wherever the range spans the change; narrow the `From` dropdown to 1.13.0 to see
only what that release still carries.

#### liveupdate.add_mount

Despite the old Live Update **auto-mount** framing, `liveupdate.add_mount` was
**not** removed — it remains an imperative runtime API on the 1.13.0
[`liveupdate`](/api/defold-1.13.0/liveupdate) surface. Its `name` parameter widened from
`string` to `string | Hash`, so a hashed mount name is now accepted alongside a
plain string, and the mount callback is typed more precisely. Compare the current
signature with the historical one on the [1.12.4 `liveupdate`
page](/api/defold-1.12.4/liveupdate).

#### liveupdate.remove_mount

`liveupdate.remove_mount` likewise remains; its `name` parameter widened from
`string` to `string | Hash` so a hashed mount name resolves the mount to tear
down. The [1.12.4 `liveupdate` page](/api/defold-1.12.4/liveupdate) keeps the old
single-string signature for comparison.

### Removed Lua APIs and constants

Each removed symbol is a compile error against the 1.13.0 surface. Its frozen
signature stays discoverable on the historical [1.12.4 API
pages](/api/defold-1.12.4/model); the current-surface namespace pages linked
below show what replaced it.

#### model.material

The single-slot `model.material` property is removed. A model can carry several
material slots, so address a slot by name with the component material APIs on the
current [`model`](/api/defold-1.13.0/model) surface instead of the one blanket property; the
removed property's frozen shape stays on the [1.12.4 `model`
page](/api/defold-1.12.4/model).

### Deprecated Lua APIs

These APIs still compile and run against the 1.13.0 surface but are marked
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

### Source and project migrations

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

### Rendering and platform behavior

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

<!-- release: 1.13.1 -->

## Defold 1.13.1

Defold 1.13.1 is a **patch** over [1.13.0](#defold-1130), which stays a
shipped surface beside it: nothing was removed, nothing was deprecated, and the
only Lua API deltas are the two additive changes below. **A project already on
1.13.0 needs no source migration** — move the pin and rebuild. A project on 1.12.4
migrates through the 1.13.0 notes above as well.

The runbook above, with this release's concrete targets:

```sh
# what you ship today
bunx @defold-typescript/cli build --defold-target 1.13.0

# the same project against the new surface
bunx @defold-typescript/cli build --defold-target 1.13.1
```

### Added Lua APIs

#### collectionproxy.load

`collectionproxy.load` is new on the 1.13.1
[`collectionproxy`](/api/defold-1.13.1/collectionproxy) surface — the [1.13.0
`collectionproxy` page](/api/defold-1.13.0/collectionproxy) has no such function.
It is purely additive, so no existing call needs changing; a project that wants it
must pin `--defold-target 1.13.1` or newer.

### Changed Lua API signatures

#### gui.set

`gui.set`'s `value` parameter accepts `nil` alongside the number and vector types
it already took, so a property can be cleared rather than only reassigned.
Existing calls are unaffected — the change is a widening. The current signature is
on the 1.13.1 [`gui`](/api/defold-1.13.1/gui) surface; the [1.13.0 `gui`
page](/api/defold-1.13.0/gui) shows the narrower one for comparison.

<!-- release: 1.13.2 -->

## Defold 1.13.2

Defold 1.13.2 is the current stable release and the toolchain's default API
target. Most of its API changes widen a type or name a table shape that was
anonymous before, so code written against 1.13.1 keeps compiling. A few changes
can break a build: `b2d.get_world`, `b2d.body.get_name` and `b2d.body.get_next`
may return nothing, `json.decode` returns `unknown`, and the LuaSocket
`getpeername`, `getsockname` and `getstats` methods return several values instead
of one string. The notes below link the 1.13.1 pages that keep the old
signatures. A project on 1.12.4 migrates through the 1.13.0 and 1.13.1 notes above
as well; the [1.12.4 reference](/api/defold-1.12.4/go) keeps that release's
surface.

The runbook above, with this release's concrete targets:

```sh
# what you ship today
bunx @defold-typescript/cli build --defold-target 1.13.1

# the same project against the new surface
bunx @defold-typescript/cli build --defold-target 1.13.2
```

### Added Lua APIs

These are additive, so no existing call changes. A project that uses them must
pin `--defold-target 1.13.2` or newer.

- **Bullet 3D physics.** The [`bullet3d`](/api/defold-1.13.2/bullet3d) namespaces
  (`bullet3d.world`, `bullet3d.collision_object`, `bullet3d.rigid_body`,
  `bullet3d.shape`, `bullet3d.constraint`) script the 3D physics world directly.
  They exist only in a project whose `game.project` sets 3D physics.
- **Rich-text layout objects.** `label.get_layout_objects` and
  `gui.get_layout_objects` list the inline sprites and links in a label or text
  node, and the new `text_object_hovered`, `text_object_unhovered` and
  `text_object_clicked` messages report pointer interaction with them.
- **Collection proxy progress messages.** `proxy_loading`, `proxy_ready` and
  `proxy_error` report the state of a collection proxy load.
- **Mesh collision shapes.** `physics.SHAPE_TYPE_MESH` and
  `bullet3d.shape.SHAPE_TYPE_MESH` name the triangle-mesh shape kind.
- **Multisampled render targets.** The `render.render_target` table takes a
  `sample_count` key, and `resource.get_render_target_info` reports it.
- **Opening a resource at a position.** `editor.ui.open_resource` takes an
  optional `view` and view-specific `args`, such as a one-based `{ line: 42 }`
  cursor for the Code and Text views.

### Changes that can break a build

#### b2d.get_world

`b2d.get_world` now returns `Opaque<"b2World"> | undefined`, because the world is
absent until physics starts. Check the result, or assert it with `!` where the
world is known to exist. The [1.13.1 `b2d` page](/api/defold-1.13.1/b2d) keeps the
old signature.

#### b2d.body.get_name

`b2d.body.get_name` returns `string | undefined`, because a body without a name
returns `nil`. Handle the missing case. Compare the [1.13.1 `b2d.body`
page](/api/defold-1.13.1/b2d.body).

#### b2d.body.get_next

`b2d.body.get_next` returns `Opaque<"b2Body"> | undefined`, because the last body
in the world list has no next body. End the walk when it returns nothing.

#### json.decode

`json.decode` returns `unknown` instead of a string-keyed table, because a JSON
document can decode to any Lua value. Narrow the result before reading fields
from it, for example with a type guard or a cast to the shape you expect. Compare
the [1.13.1 `json` page](/api/defold-1.13.1/json).

#### socket.client:getpeername

`getpeername` returns `LuaMultiReturn<[host, port, family]>` instead of one
string, matching what LuaSocket returns. Destructure it:
`const [host, port] = client.getpeername()`. The
[1.13.1 `socket` page](/api/defold-1.13.1/socket) keeps the old form.

#### socket.connected:getpeername

Same change as `socket.client:getpeername`: destructure the host, port and
family.

#### socket.client:getsockname

`getsockname` returns `LuaMultiReturn<[host, port, family]>` instead of one
string. Destructure it the same way as `getpeername`.

#### socket.connected:getsockname

Same change as `socket.client:getsockname`.

#### socket.master:getsockname

Same change as `socket.client:getsockname`.

#### socket.server:getsockname

Same change as `socket.client:getsockname`.

#### socket.unconnected:getsockname

Same change as `socket.client:getsockname`.

#### socket.client:getstats

`getstats` returns `LuaMultiReturn<[received, sent, age]>` as three numbers
instead of one string. Destructure the counts:
`const [received, sent, age] = client.getstats()`.

#### socket.master:getstats

Same change as `socket.client:getstats`.

#### socket.server:getstats

Same change as `socket.client:getstats`.

### Widened signatures

These signatures accept more than before or return a more precise type. A call
written against 1.13.1 keeps compiling.

#### b2d.world.cast_ray

The `filter` and `max_results` arguments are optional on every form, and the
filter and hit tables are the named `b2d.query_filter` and `b2d.fixture_cast_hit`
or `b2d.shape_cast_hit` types. Compare the [1.13.1 `b2d.world`
page](/api/defold-1.13.1/b2d.world).

#### b2d.world.cast_ray_closest

Same change as `b2d.world.cast_ray`: `filter` is optional on every form.

#### b2d.world.cast_shape

Same change as `b2d.world.cast_ray`.

#### b2d.world.overlap_aabb

Same change as `b2d.world.cast_ray`, with `b2d.aabb` as the box type.

#### b2d.world.overlap_shape

Same change as `b2d.world.cast_ray`.

#### gui.new_texture

The `type` parameter takes `string | image.TYPE`, so an `image.TYPE_*` constant
passes without a cast. The second return value narrows from `number` to
`gui.RESULT`. Compare the [1.13.1 `gui` page](/api/defold-1.13.1/gui).

#### gui.set_texture_data

The `type` parameter takes `string | image.TYPE`, as for `gui.new_texture`.

#### image.load

`options` also accepts a boolean, the older premultiply-alpha flag, and the
options and result tables are the named `image.load_options` and
`image.load_result` types. Compare the [1.13.1 `image`
page](/api/defold-1.13.1/image).

#### image.load_buffer

Same change as `image.load`, with `image.load_buffer_result` as the result type.

#### json.encode

`json.encode` accepts any value, not only a table, and its options table is the
named `json.encode_options` type.

#### socket.skip

`socket.skip` takes any number of values after the count and returns the values
it keeps, so a call with more than three values compiles.

#### socket.client:close

`close` returns the number LuaSocket reports instead of `void`. Existing calls
that ignore the result are unaffected.

#### socket.connected:close

Same change as `socket.client:close`.

#### socket.master:close

Same change as `socket.client:close`.

#### socket.server:close

Same change as `socket.client:close`.

#### socket.unconnected:close

Same change as `socket.client:close`.

#### socket.client:setstats

Every argument is optional and the return is a plain `number`.

#### socket.master:setstats

Same change as `socket.client:setstats`.

#### socket.server:setstats

Same change as `socket.client:setstats`.

#### socket.client:settimeout

The timeout value is optional and the method returns a `number` instead of
`void`.

#### socket.connected:settimeout

Same change as `socket.client:settimeout`.

#### socket.master:settimeout

Same change as `socket.client:settimeout`.

#### socket.server:settimeout

Same change as `socket.client:settimeout`.

#### socket.unconnected:settimeout

Same change as `socket.client:settimeout`.

### Changes to the reference only

The engine reference re-documents these symbols, so the API catalog records a new
signature, but the TypeScript declarations you compile against are unchanged. No
action is needed.

#### b2d.body.get_contact_list

The 1.13.2 reference no longer documents `b2d.body.get_contact_list`. The typed
surface never declared it, because neither Box2D binding registers it and the
call would raise, so no code changes.

#### b2d.body.get_world_center

The 1.13.0 and 1.13.1 references typed the return as a number. The declarations
already return `Vector3`, which the 1.13.2 reference now documents.

#### go.get

The reference lists `string` among the values `go.get` returns and drops the
resource handle. The typed `go.get` overloads are unchanged; see the [1.13.1 `go`
page](/api/defold-1.13.1/go) for comparison.

#### go.set

The reference lists `string` among the values `go.set` accepts. The typed overloads
are unchanged.

#### go.property

The reference lists `string` among the default values `go.property` accepts. The
typed overloads are unchanged.

#### go.on_input

The reference documents `action_id` as `nil` for pointer movement. The typed hook
already declares it `Hash | undefined`.

#### gui.on_input

Same change as `go.on_input`.

#### gui.on_message

The reference now documents the `sender` argument of the GUI hook. The typed hook
already passes it.

#### render.render_target

The reference drops the deprecated leading name argument. Both typed forms,
with and without the name, still compile; see the [1.13.1 `render`
page](/api/defold-1.13.1/render).

#### sys.get_config_string

The reference documents that the lookup can return `nil`. The typed overloads
already return `string | undefined` without a default and `string` with one; see
the [1.13.1 `sys` page](/api/defold-1.13.1/sys).

#### socket.client

The reference describes the LuaSocket object types in a new form. The
`socket.client` interface keeps its name, and its method changes are listed
above.

#### socket.master

Same change as `socket.client`.

#### socket.unconnected

Same change as `socket.client`.

### Deprecated Lua APIs

These still compile and run against the 1.13.2 surface.

#### window.WINDOW_EVENT_ICONFIED

The misspelled `window.WINDOW_EVENT_ICONFIED` is deprecated in favor of
`window.WINDOW_EVENT_ICONIFIED`, which the reference now documents. The engine
registers both with the same value, and the declarations give them the same
type, so either compares equal to a `window.set_listener` event. Switch to the
correct spelling. The [1.13.1 `window` page](/api/defold-1.13.1/window) shows only
the old name.

- **`label.get_text`, `label.set_text`.** Deprecated in favor of the label
  component's `text` property: read it with `go.get` and write it with `go.set`
  on the `"text"` key.

<!-- no-action: label.get_text -->
<!-- no-action: label.set_text -->
