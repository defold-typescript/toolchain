/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import { defineGuiScript } from "@defold-typescript/types";
import * as gooey from "gooey.gooey";

// Compile-only proof for the severed gooey surface, replacing the gooey block
// retired from library-types.test-d.ts when the `./gooey.gooey` subpath went
// away. No assertions execute; the `dts-declaration-validity` compile is
// the gate.

declare const _hash: Hash;
declare const _action: go.on_input.Action;

// The two assertions the retired block carried: a button state exposes an
// `Opaque<"node">` handle and a `Hash` node id, so the fork is the mapped copy
// rather than the raw ts-defold snapshot.
const _button = gooey.button("id", _hash, _action, () => {});
const _node: Opaque<"node"> = _button.node;
const _nodeId: Hash = _button.node_id;

// The correction's proof rather than a restatement of it. Upstream
// `gooey/gooey.lua:191` declares `M.group(id, action_id, action, fn)`, so the
// documented four-argument call is the one that has to compile...
const _group = gooey.group("group1", _hash, _action, () => {});

// ...and the two-argument form ts-defold bound from the LDoc block must not.
// @ts-expect-error `group` takes four arguments, not two.
gooey.group("group1", () => {});

// A corrected list form: `gooey.lua:125` names nine parameters and neither a
// `root_id` after `list_id` nor a trailing `is_horizontal`, so the nine-argument
// call compiles...
const _list = gooey.dynamic_list(
  "list",
  "stencil",
  "item",
  [],
  _hash,
  _action,
  undefined,
  () => {},
);

// ...and the invented `root_id` no longer type-checks in its old second slot.
// @ts-expect-error `dynamic_list` takes no `root_id`, so `"root"` lands on `stencil_id`.
gooey.dynamic_list("list", "root", "stencil", "item", [], _hash, _action, undefined, () => {});

// A newly declared member, narrowed rather than widened: `mask_text` takes two
// strings and returns one (`gooey.lua:66`).
const _masked: string = gooey.mask_text("secret", "*");

// The README's setup, forwarded from `on_input`: the engine hands `action_id` as
// `Hash | undefined` and gooey's input handling compares it rather than indexing it,
// so the arguments pass straight through. A component's callback may be left out,
// as `gooey.lua` substitutes a no-op for it, and `group` returns the table it builds.
export const menu = defineGuiScript({
  on_input(_self, action_id, action) {
    gooey.button("play", action_id, action, (button) => {
      const _clicked: boolean = button.clicked;
      void _clicked;
    });
    gooey.radiogroup("difficulty", action_id, action, (group_id, group_action_id, group_action) => {
      gooey.radio("easy", group_id, group_action_id, group_action);
      gooey.radio("hard", group_id, group_action_id, group_action);
    });
    gooey.vertical_scrollbar("handle", "bounds", action_id, action, (scrollbar) => {
      const _y: number = scrollbar.scroll.y;
      void _y;
    });
    const group = gooey.group("menu", action_id, action, () => {
      gooey.checkbox("sound", action_id, action);
    });
    const _focused: number | undefined = group.focus.index;
    void _focused;
    return group.consumed;
  },
});

void _node;
void _nodeId;
void _group;
void _list;
void _masked;
