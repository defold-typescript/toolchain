/// <reference path="../index.d.ts" />

import type { Hash, Url } from "../src/core-types";
import {
  defineGuiScript,
  defineRenderScript,
  defineScript,
  type GuiScriptHooks,
  type InputAction,
  type RenderScriptHooks,
  type ScriptHooks,
} from "../src/lifecycle";

const _hash = null as unknown as Hash;
const _url = null as unknown as Url;

type Self = { counter: number };

const hooks: ScriptHooks<Self> = defineScript<Self>({
  init(self) {
    self.counter = 0;
    const _n: number = self.counter;
    void _n;
  },
  update(self, dt) {
    const _n: number = self.counter;
    const _dt: number = dt;
    void _n;
    void _dt;
  },
  fixed_update(self, dt) {
    const _self: Self = self;
    const _dt: number = dt;
    void _self;
    void _dt;
  },
  late_update(self, dt) {
    const _self: Self = self;
    const _dt: number = dt;
    void _self;
    void _dt;
  },
  on_message(self, message_id, message, sender) {
    const _self: Self = self;
    const _mid: Hash = message_id;
    const _message: Record<string | number, unknown> = message;
    const _sender: Url = sender;
    void _self;
    void _mid;
    void _message;
    void _sender;
  },
  on_input(self, action_id, action) {
    const _self: Self = self;
    const _id: Hash | undefined = action_id;
    const _action: InputAction = action;
    const _value: number | undefined = action.value;
    const _pressed: boolean | undefined = action.pressed;
    const _released: boolean | undefined = action.released;
    const _x: number | undefined = action.x;
    const _screenX: number | undefined = action.screen_x;
    const _text: string | undefined = action.text;
    const _markedText: string | undefined = action.marked_text;
    const touch = action.touch?.[0];
    if (touch) {
      const _touchId: number | undefined = touch.id;
      const _touchPressed: boolean | undefined = touch.pressed;
      const _tapCount: number | undefined = touch.tap_count;
      const _touchX: number | undefined = touch.x;
      const _touchAccX: number | undefined = touch.acc_x;
      void _touchId;
      void _touchPressed;
      void _tapCount;
      void _touchX;
      void _touchAccX;
      // @ts-expect-error unknown touch fields are rejected
      touch.no_such_field;
    }
    void _self;
    void _id;
    void _action;
    void _value;
    void _pressed;
    void _released;
    void _x;
    void _screenX;
    void _text;
    void _markedText;
    return true;
  },
  final(self) {
    const _self: Self = self;
    void _self;
  },
  on_reload(self) {
    const _self: Self = self;
    void _self;
  },
});

const self: Self = { counter: 0 };

// message_id is a Hash (Defold delivers it pre-hashed); message is an untyped record.
hooks.on_message?.(self, _hash, { anything: 1 }, _url);
hooks.on_message?.(self, _hash, {}, _url);

// @ts-expect-error message_id must be a Hash, not a string literal
hooks.on_message?.(self, "set_parent", { anything: 1 }, _url);

hooks.on_input?.(self, undefined, {});

defineScript<Self>({});

defineScript<Self>({
  init(self) {
    self.counter = 1;
  },
});

void hooks;

type GuiSelf = { root: Hash };

const guiHooks: GuiScriptHooks<GuiSelf> = defineGuiScript<GuiSelf>({
  init(self) {
    self.root = null as unknown as Hash;
    const _root: Hash = self.root;
    void _root;
  },
  on_message(self, message_id, message, sender) {
    const _self: GuiSelf = self;
    const _mid: Hash = message_id;
    const _message: Record<string | number, unknown> = message;
    const _sender: Url = sender;
    void _self;
    void _mid;
    void _message;
    void _sender;
  },
  on_input(self, action_id, action) {
    const _self: GuiSelf = self;
    const _id: Hash | undefined = action_id;
    const _action: InputAction = action;
    void _self;
    void _id;
    void _action;
  },
});

const guiSelf: GuiSelf = { root: _hash };

guiHooks.on_message?.(guiSelf, _hash, { anything: 1 }, _url);
guiHooks.on_input?.(guiSelf, undefined, {});

// @ts-expect-error message_id must be a Hash, not a string literal
guiHooks.on_message?.(guiSelf, "set_parent", { anything: 1 }, _url);

defineGuiScript<GuiSelf>({});

void guiHooks;

type RenderSelf = { tile_pred: unknown };

const renderHooks: RenderScriptHooks<RenderSelf> = defineRenderScript<RenderSelf>({
  init(self) {
    const _self: RenderSelf = self;
    void _self;
  },
  update(self, dt) {
    const _self: RenderSelf = self;
    const _dt: number = dt;
    void _self;
    void _dt;
  },
  on_message(self, message_id, message, sender) {
    const _self: RenderSelf = self;
    const _mid: Hash = message_id;
    const _message: Record<string | number, unknown> = message;
    const _sender: Url = sender;
    void _self;
    void _mid;
    void _message;
    void _sender;
  },
  final(self) {
    const _self: RenderSelf = self;
    void _self;
  },
  on_reload(self) {
    const _self: RenderSelf = self;
    void _self;
  },
});

const renderSelf: RenderSelf = { tile_pred: null };

renderHooks.on_message?.(renderSelf, _hash, { anything: 1 }, _url);

// @ts-expect-error message_id must be a Hash, not a string literal
renderHooks.on_message?.(renderSelf, "set_parent", { anything: 1 }, _url);

defineRenderScript<RenderSelf>({});

defineRenderScript<Record<string, never>>({
  // @ts-expect-error on_input is not a member of RenderScriptHooks
  on_input(_self, _action_id, _action) {},
});

void renderHooks;
