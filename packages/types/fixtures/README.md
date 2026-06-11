# Defold API doc fixtures

Vendored Defold API doc snapshots used by the parser tests in `../src/api-doc.test.ts`.

## Bulk refresh

`bun run sync-api-docs` (from `packages/types/`) replaces the per-module
`unzip -p` recipes documented below: it reads the `SYNC_MANIFEST`
namespace→`ref-doc.zip`-entry map in `../scripts/sync-api-docs.ts` and writes
each mapped `fixtures/<namespace>_doc.json` from the pinned Defold release
(`1.12.4`), formatted to the repo's Biome JSON style so a fresh sync is
`bun run lint`-clean without a follow-up `lint:fix`. Pass a local zip path to
skip the download (`bun run sync-api-docs /tmp/ref-doc.zip`); pass `--check`
to report drift without writing (exit 1 only when a committed fixture's
content genuinely diverges from the pin).

`--check` compares parsed JSON values, not raw bytes, so a fixture that is
semantically identical to the zip entry reports `clean` even though Biome
formatting differs byte-for-byte from Defold's encoding. A manifest entry
with no committed fixture yet reports `created` and does not fail the check —
importing those remaining modules stays a separate, incremental edit. The
script also prints a coverage report (wired vs. fixture-only vs.
missing-mapping modules, Defold type tokens that would emit `unknown`, and
dropped reserved-name functions).

Surfaces Defold ships no per-namespace doc for live in the `UNMAPPED` set in
the same script (the extension-only `iac` / `iap` / `push` / `webview`); the
built-in message catalog `messages_doc.json` stays hand-vendored (see below)
and is not part of `SYNC_MANIFEST`.

Adding a synced fixture to the published types is still a separate, incremental
edit: wire its `MODULE_MANIFEST` row in `../scripts/regen.ts` and commit the
generated `.d.ts`.

## vmath_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/src-script_vmath.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/src-script_vmath.cpp_doc.json > packages/types/fixtures/vmath_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## msg_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/src-script_msg.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/src-script_msg.cpp_doc.json > packages/types/fixtures/msg_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## gui_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/gui_script.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The
  file's `info.namespace` is `"gui"` even though the source path does not match the
  namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/gui_script.cpp_doc.json > packages/types/fixtures/gui_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## messages_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: hand-vendored from the Defold API reference. Defold's `ref-doc.zip`
  ships per-namespace function/variable docs but no machine-readable export
  for built-in message ids and their payload shapes, so this fixture is the
  source of truth until upstream offers one.
- **How to refresh**: edit by hand. Each entry needs a `name`, an `origin`
  (the namespace that ships the message, e.g. `go`, `sprite`, `physics`),
  and a `payload` array of `{ name, types, optional, doc }` fields. The
  `types` array holds Defold-doc type tokens (`hash`, `vector3`, `boolean`,
  …) — anything not in `DEFOLD_TYPE_MAP` passes through verbatim, so
  literal-type unions like `["0", "1"]` work for two-state numeric flags.

## go_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/gameobject_script.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"go"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/gameobject_script.cpp_doc.json > packages/types/fixtures/go_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## render_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/render-render_script.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"render"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/render-render_script.cpp_doc.json > packages/types/fixtures/render_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## physics_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/scripts-script_physics.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"physics"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/scripts-script_physics.cpp_doc.json > packages/types/fixtures/physics_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## factory_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/scripts-script_factory.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"factory"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/scripts-script_factory.cpp_doc.json > packages/types/fixtures/factory_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## collectionfactory_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/scripts-script_collection_factory.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"collectionfactory"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/scripts-script_collection_factory.cpp_doc.json > packages/types/fixtures/collectionfactory_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## collectionproxy_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/scripts-script_collectionproxy.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"collectionproxy"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/scripts-script_collectionproxy.cpp_doc.json > packages/types/fixtures/collectionproxy_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## sprite_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/scripts-script_sprite.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"sprite"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/scripts-script_sprite.cpp_doc.json > packages/types/fixtures/sprite_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## sound_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/scripts-script_sound.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"sound"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/scripts-script_sound.cpp_doc.json > packages/types/fixtures/sound_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## model_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/scripts-script_model.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"model"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/scripts-script_model.cpp_doc.json > packages/types/fixtures/model_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## tilemap_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/scripts-script_tilemap.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"tilemap"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/scripts-script_tilemap.cpp_doc.json > packages/types/fixtures/tilemap_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## label_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/scripts-script_label.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"label"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/scripts-script_label.cpp_doc.json > packages/types/fixtures/label_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## particlefx_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/scripts-script_particlefx.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"particlefx"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/scripts-script_particlefx.cpp_doc.json > packages/types/fixtures/particlefx_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## timer_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/src-script_timer.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"timer"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/src-script_timer.cpp_doc.json > packages/types/fixtures/timer_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## html5_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/src-script_html5_js.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"html5"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/src-script_html5_js.cpp_doc.json > packages/types/fixtures/html5_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## types_doc.json

- **Defold version**: 1.12.4 (stable)
- **Source**: `doc/src-script_types.cpp_doc.json` inside the `ref-doc.zip` release artifact
  at <https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip>. The file's
  `info.namespace` is `"types"` even though the source path does not match the namespace.
- **How to refresh**:
  ```sh
  curl -L https://github.com/defold/defold/releases/download/1.12.4/ref-doc.zip -o /tmp/ref-doc.zip
  unzip -p /tmp/ref-doc.zip doc/src-script_types.cpp_doc.json > packages/types/fixtures/types_doc.json
  ```
  Bump the version pin above when refreshing against a newer Defold release.

## previous/label_doc.json

- **Defold version**: fabricated — **not** a real Defold release.
- **Source**: the current 1.12.4 `label_doc.json` with the `label.set_text`
  function entry removed (`label.get_text` kept; `info.namespace` stays
  `"label"`). This is the minimal proof delta for the `versioned-api-surface`
  goal: it gives one member shared by both surfaces (`get_text`) and one
  member present only on the current surface (`set_text`), so a real
  consumer `tsconfig` can demonstrate that the `previous` surface rejects a
  call the current surface accepts.
- **How to refresh**: there is nothing upstream to refresh against — this is
  a hand-trimmed copy. Regenerate the trimmed fixture from the current one by
  re-removing the `label.set_text` element if `label_doc.json` is ever
  re-vendored. Real versioned surfaces will instead vendor genuine
  per-release docs under `fixtures/<versionId>/`.

## previous/sprite_doc.json

- **Defold version**: fabricated — **not** a real Defold release.
- **Source**: the current 1.12.4 `sprite_doc.json` with the `sprite.set_vflip`
  function entry removed (`sprite.play_flipbook` + `sprite.set_hflip` kept;
  `info.namespace` stays `"sprite"`). This is the second module on the
  `previous` proof surface: like `previous/label_doc.json`, it gives one
  member shared by both surfaces (`set_hflip`) and one member present only on
  the current surface (`set_vflip`), proving the versioned index aggregates
  more than one module at once.
- **How to refresh**: there is nothing upstream to refresh against — this is
  a hand-trimmed copy. Regenerate the trimmed fixture from the current one by
  re-removing the `sprite.set_vflip` element if `sprite_doc.json` is ever
  re-vendored. Real versioned surfaces will instead vendor genuine
  per-release docs under `fixtures/<versionId>/`.
