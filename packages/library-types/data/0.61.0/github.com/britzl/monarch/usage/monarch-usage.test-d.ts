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
transitionsGui.slide_in_right(_tNode, { pos: _tV3, scale: _tV3 }, gui.EASING_LINEAR, 1);

// The README's transition setup: a preset returns the transition it builds
// (`transitions/gui.lua:297`), whose `handle` takes the forwarded message...
const _preset = transitionsGui.in_right_out_left(_tNode, 0.3);
monarch.on_transition("menu", (message_id, message, sender) => {
  if (message_id === monarch.TRANSITION_SHOW_IN) {
    const _previous: Hash | undefined = message.previous_screen;
    void _previous;
  }
  _preset.handle(message_id, message, sender);
});
// ...`nil` removes the handler (`monarch.lua:1286`)...
monarch.on_transition("menu", undefined);
// ...and each of `show_in`, `show_out`, `back_in` and `back_out` returns the
// transition, so a custom one chains. A transition function receives the node's
// captured position and scale (`transitions/gui.lua:145`).
transitionsGui
  .create(_tNode)
  .show_in(transitionsGui.slide_in_right, gui.EASING_OUTQUAD, 0.6, 0)
  .show_out(transitionsGui.slide_out_left, gui.EASING_INQUAD, 0.6, 0)
  .back_in(transitionsGui.slide_in_left, gui.EASING_OUTQUAD, 0.6, 0)
  .back_out(
    (node, from, easing, duration) => {
      const _scale: Vector3 = from.scale;
      gui.animate(node, gui.PROP_POSITION, from.pos, easing, duration);
      void _scale;
    },
    gui.EASING_INQUAD,
    0.6,
    0,
  );

// The data a screen was shown with comes back as given, or `undefined`; `show`
// returns `true` (`monarch.lua:858`) and `top` is a hashed id or nothing.
const _shown: boolean = monarch.show("game", undefined, { level: 2 });
const _level: number | undefined = monarch.data<{ level: number }>(hash("game"))?.level;
const _top: Hash | undefined = monarch.top();
monarch.register_proxy("popup", _url);

// `preload` reads `keep_loaded` (`monarch.lua:1077`); `auto_preload` is a
// registration setting.
monarch.preload("game", { keep_loaded: true });
// @ts-expect-error `preload` takes no `auto_preload` option.
monarch.preload("game", { auto_preload: true });

// monarch.transitions.easings — no core-type renames; its only external reference
// is the `gui` engine global via `(typeof gui)[...]`, so resolution proves the
// indexed gui-constant lookup type-checks. Each `M.<EASING>()` wrapper yields an
// `Easing` whose `IN`/`OUT` are `gui` easing constants.
const _easing = easings.BACK();

void _mHash;
void _ok;
void _err;
void _transition;
void _shown;
void _level;
void _top;
void _easing.IN;
void _easing.OUT;
