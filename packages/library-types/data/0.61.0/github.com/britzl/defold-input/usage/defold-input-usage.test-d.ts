/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import { defineGuiScript } from "@defold-typescript/types";
import * as accelerometer from "in.accelerometer";
import * as button from "in.button";
import * as cursor from "in.cursor";
import * as gesture from "in.gesture";
import * as keyboard from "in.keyboard";
import * as mapper from "in.mapper";
import * as onscreen from "in.onscreen";
import * as state from "in.state";
import * as textbox from "in.textbox";
import * as triggers from "in.triggers";

// Compile-only proof (mirroring yagames-usage.test-d.ts) for the ten severed
// `in.<mod>` goldens. Until the severance none of them was compiled under
// `skipLibCheck: false` — the four blocks retired from library-types.test-d.ts
// covered only accelerometer, button, state and triggers, and the other six had
// no compile coverage at all. `in` is a reserved word, so every import aliases
// its leaf. No assertions execute; the `dts-declaration-validity` compile
// is the gate.

declare const _url: Url;
declare const _node: Opaque<"node">;

// The four assertions the retired library-types.test-d.ts blocks carried:
// `TOUCH` is a `Hash`, `register` yields an `Opaque<"node">` handle, `calibrated`
// a `Vector3`, `acquire` takes a `Url`, and every trigger constant is a `Hash` —
// upstream's `hash`, `node`, `url` and `vmath.vector3` all renamed off the core
// surface.
const _bTouch: Hash = button.TOUCH;
const _bNode: Opaque<"node"> = button.register("id", () => {});
declare const _bScale: Vector3;
button.effect(_bNode, _bScale);
const _accel: Vector3 = accelerometer.calibrated();
state.acquire(_url);
const _trigger: Hash = triggers.KEY_SPACE;

// The six modules that had no compile coverage before the severance. One member
// each is enough: an unresolvable ambient in the golden reds the whole file.
const _cursorOver: Hash = cursor.OVER;
const _gestureSettings = gesture.create();
const _keyboardInput: Hash = keyboard.KEYBOARD_INPUT;
mapper.unbind_all();
const _onscreenButton: Hash = onscreen.BUTTON;
const _textboxType: Hash = textbox.TYPE;
textbox.unregister(_node);

// Forwarded from `on_input`, as each module's README wires it: the engine hands
// `action_id` as `Hash | undefined` and the action with any field absent, and every
// module compares the id rather than indexing it.
export const controls = defineGuiScript({
  on_input(_self, action_id, action) {
    const _pressed: boolean = button.on_input(action_id, action);
    const _typed: boolean = textbox.on_input(action_id, action);
    state.on_input(action_id, action);
    const _held: boolean | undefined = state.is_pressed(triggers.KEY_SPACE);
    const _touched: boolean = onscreen.on_input(action_id, action);
    const _mouse: boolean = triggers.is_mouse(action_id);
    const _bound = mapper.on_input(action_id);
    accelerometer.on_input(action);
    // A frame that matches no touch returns nothing (`gesture.lua:283`).
    const detected = gesture.create().on_input(action_id, action);
    // @ts-expect-error `detected` is `undefined` when no gesture was detected.
    void detected.tap;
    void detected?.swipe_left;
    return _pressed || _typed || _touched || _mouse || _bound === "jump" || _held === true;
  },
});

// The onscreen callback reads the control data `onscreen.lua:32` builds.
onscreen.register_button(_node, undefined, (event, _control, data) => {
  const _x: number = data.x;
  const _y: number = data.y;
  const _down: boolean = data.pressed;
  void (event === onscreen.BUTTON_PRESSED);
});

// `mapper.md`'s bindings: a trigger constant to a string action.
mapper.bind(triggers.KEY_LEFT, "move_left", 1);

// `accelerometer.lua:47` returns early from a pointer action, so one without
// `acc_x` is accepted.
accelerometer.on_input({ x: 10, y: 20 });

void _bTouch;
void _bNode;
void _accel;
void _trigger;
void _cursorOver;
void _gestureSettings;
void _keyboardInput;
void _onscreenButton;
void _textboxType;
