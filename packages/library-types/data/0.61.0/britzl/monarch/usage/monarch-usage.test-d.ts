/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as monarch from "monarch.monarch";
import * as easings from "monarch.transitions.easings";
import * as transitionsGui from "monarch.transitions.gui";

declare const _url: Url;

// monarch.monarch — a transition constant is a `Hash`; `register_proxy` accepts a
// `Url`; `post` returns the passthrough `LuaMultiReturn` unchanged.
const _mHash: Hash = monarch.TRANSITION.DONE;
monarch.register_proxy("main", _url, {});
const [_ok, _err] = monarch.post("main", "message");

// The spelling upstream actually defines (`monarch/monarch.lua:1295` at tag
// 6.0.2). `README_API.md` documents it as `on_focus_change`, which is a typo:
// binding that name would bind a function that does not exist at runtime. Pinned
// at the consumer boundary so a rename fails to compile, not just to match text.
monarch.on_focus_changed("main", () => {});
// @ts-expect-error the README's spelling is not a member of the runtime surface
monarch.on_focus_change("main", () => {});

// monarch.transitions.gui — the codemod renamed every core type: `create(node)`
// takes an `Opaque<"node">` handle and returns a `Transition` whose `handle`
// callback is `(message_id: Hash | string, message, sender: Url)`; `slide_in_right`
// is a `TransitionInFn` accepting an `Opaque<"node">` and a `Vector3`.
declare const _tNode: Opaque<"node">;
declare const _tMsgId: Hash;
declare const _tV3: Vector3;
const _transition = transitionsGui.create(_tNode);
_transition.handle(_tMsgId, {}, _url);
transitionsGui.slide_in_right(_tNode, _tV3, gui.EASING_LINEAR, 1);

// monarch.transitions.easings — no core-type renames; its only external reference
// is the `gui` engine global via `(typeof gui)[...]`, so resolution proves the
// indexed gui-constant lookup type-checks. Each `M.<EASING>()` wrapper yields an
// `Easing` whose `IN`/`OUT` are `gui` easing constants.
const _easing = easings.BACK();

void _mHash;
void _ok;
void _err;
void _transition;
void _easing.IN;
void _easing.OUT;
