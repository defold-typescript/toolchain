/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as gooey from "gooey.gooey";

// Compile-only proof for the severed gooey surface, replacing the gooey block
// retired from library-types.test-d.ts when the `./gooey.gooey` subpath went
// away. No assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is
// the gate.

declare const _hash: Hash;

// The two assertions the retired block carried: a button state exposes an
// `Opaque<"node">` handle and a `Hash` node id, so the fork is the mapped copy
// rather than the raw ts-defold snapshot.
const _button = gooey.button("id", _hash, {}, () => {});
const _node: Opaque<"node"> = _button.node;
const _nodeId: Hash = _button.node_id;

// The correction's proof rather than a restatement of it. Upstream
// `gooey/gooey.lua:191` declares `M.group(id, action_id, action, fn)`, so the
// documented four-argument call is the one that has to compile...
const _group = gooey.group("group1", _hash, {}, () => {});

// ...and the two-argument form ts-defold bound from the LDoc block must not.
// @ts-expect-error `group` takes four arguments, not two.
gooey.group("group1", () => {});

// A corrected list form: `gooey.lua:125` names nine parameters and neither a
// `root_id` after `list_id` nor a trailing `is_horizontal`, so the nine-argument
// call compiles...
const _list = gooey.dynamic_list("list", "stencil", "item", {}, _hash, {}, undefined, () => {});

// ...and the invented `root_id` no longer type-checks in its old second slot.
// @ts-expect-error `dynamic_list` takes no `root_id`, so `"root"` lands on `stencil_id`.
gooey.dynamic_list("list", "root", "stencil", "item", {}, _hash, {}, undefined, () => {});

// A newly declared member, narrowed rather than widened: `mask_text` takes two
// strings and returns one (`gooey.lua:66`).
const _masked: string = gooey.mask_text("secret", "*");

void _node;
void _nodeId;
void _group;
void _list;
void _masked;
