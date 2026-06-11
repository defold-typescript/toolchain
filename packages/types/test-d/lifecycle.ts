/// <reference path="../index.d.ts" />

import type { Hash, Url, Vector3 } from "../src/core-types";
import {
  defineGuiScript,
  defineRenderScript,
  defineScript,
  type GuiScriptHooks,
  type InputAction,
  type RenderScriptHooks,
  type ScriptHooks,
  type ScriptProperties,
  type ScriptPropertiesOf,
  type ScriptProperty,
} from "../src/lifecycle";

const _hash = null as unknown as Hash;
const _url = null as unknown as Url;

type Self = { counter: number };

const hooks = defineScript<Self>({
  init: () => ({ counter: 0 }),
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

const scriptProperties = {
  speed: go.property("speed", 450),
  enabled: go.property("enabled", true),
  name: go.property("name", hash("initial value")),
};

type ScriptProps = ScriptProperties<typeof scriptProperties>;
type ScriptState = { velocity: Vector3 };

const propertyHooks = defineScript<ScriptProps, ScriptState>({
  init: () => ({ velocity: vmath.vector3(0, 0, 0) }),
  update(self) {
    const _speed: number = self.speed;
    const _enabled: boolean = self.enabled;
    const _name: Hash = self.name;
    const _velocity: Vector3 = self.velocity;
    void _speed;
    void _enabled;
    void _name;
    void _velocity;
  },
});
void propertyHooks;

defineScript<ScriptProps, ScriptState>({
  init: () => ({ velocity: vmath.vector3(0, 0, 0) }),
});

// @ts-expect-error explicit init state still requires init-created fields
defineScript<ScriptProps, ScriptState>({ init: () => ({}) });

declare function expectScriptProperties<T extends Record<string, ScriptProperty<unknown>>>(
  props: T,
): ScriptProperties<T>;

// @ts-expect-error descriptor objects must contain only go.property results
expectScriptProperties({ speed: go.property("speed", 450), bad: 1 });

// Explicit `<Self>` keeps checking `init`'s return against the named type.
defineScript<Self>({
  init: () => ({ counter: 1 }),
});

// @ts-expect-error init's return must satisfy the explicit Self
defineScript<Self>({ init: () => ({ counter: "not-a-number" }) });

// Value-keyed `properties` field: the key is the property name (written once)
// and the value is the default, so its type is the property type. It threads
// onto `self` alongside `init`'s returned state — no descriptor, no second
// generic, no `ScriptProperties` extraction.
const keyedProps = defineScript({
  properties: {
    adj: vmath.vector3(0, 0, 0),
    name: hash("initial value"),
  },
  init: () => ({ velocity: vmath.vector3(0, 0, 0) }),
  update(self) {
    const _adj: Vector3 = self.adj;
    const _name: Hash = self.name;
    const _velocity: Vector3 = self.velocity;
    void _adj;
    void _name;
    void _velocity;
    // @ts-expect-error a field that is neither a declared property nor init state
    void self.missing;
  },
});
void keyedProps;

// `init` is checked against init state only: a property-backed field need not
// appear in init's return, yet reading it on `self` is still allowed.
defineScript({
  properties: { adj: vmath.vector3(0, 0, 0) },
  init: () => ({ velocity: vmath.vector3(0, 0, 0) }),
  update(self) {
    const _adj: Vector3 = self.adj;
    const _velocity: Vector3 = self.velocity;
    void _adj;
    void _velocity;
  },
});

// Omitting an init-state field is still rejected under the value-keyed form.
defineScript<{ adj: Vector3 }, { velocity: Vector3 }>({
  properties: { adj: vmath.vector3(0, 0, 0) },
  // @ts-expect-error init must return every explicit init-state field
  init: () => ({}),
});

// The value type is the property type: `0` -> number, `true` -> boolean,
// `hash(...)` -> Hash.
defineScript({
  properties: { count: 0, enabled: true, name: hash("x") },
  update(self) {
    const _count: number = self.count;
    const _enabled: boolean = self.enabled;
    const _name: Hash = self.name;
    void _count;
    void _enabled;
    void _name;
  },
});

// The `properties` field is available on the gui/render factories too.
defineGuiScript({
  properties: { root: _hash },
  init: () => ({ frames: 0 }),
  update(self) {
    const _root: Hash = self.root;
    const _frames: number = self.frames;
    void _root;
    void _frames;
  },
});

defineRenderScript({
  properties: { layers: 0 },
  init: () => ({ frames: 0 }),
  update(self) {
    const _layers: number = self.layers;
    const _frames: number = self.frames;
    void _layers;
    void _frames;
  },
});

// `init(self)` reads the declared `properties` at init time: `self` is the
// property channel (`TProps`, the values Defold applies before `init` runs),
// while the return stays the sole init-state channel. `update` sees the merged
// `TProps & TInitState`.
defineScript({
  properties: { start_anim: hash("idle"), max_hp: 100 },
  init(self) {
    const _startAnim: Hash = self.start_anim;
    const _maxHp: number = self.max_hp;
    void _startAnim;
    void _maxHp;
    // @ts-expect-error a field that is not a declared property is not on init's self
    void self.missing;
    return { hp: self.max_hp };
  },
  update(self) {
    const _n: number = self.hp + self.max_hp;
    void _n;
  },
});

// The no-`properties` form still checks: `self` is the empty `TProps`, and the
// existing returning-`init` inference is unchanged.
defineScript({
  init(self) {
    void self;
    return { c: 0 };
  },
});

// `defineGuiScript` / `defineRenderScript` expose the same `init(self: TProps)`.
defineGuiScript({
  properties: { root: _hash },
  init(self) {
    const _root: Hash = self.root;
    void _root;
    return { frames: 0 };
  },
});

defineRenderScript({
  properties: { layers: 0 },
  init(self) {
    const _layers: number = self.layers;
    void _layers;
    return { frames: 0 };
  },
});

// `ScriptPropertiesOf<typeof script>` extracts a `defineScript` module's
// declared property channel (`TProps`) as a nameable type, so a cross-script
// `go.get`/`go.set` caller names exactly what the owning script's `self`
// exposes — one source of truth, no second hand-maintained interface. The
// extracted shape is the same property channel `self` carries inside the script.
const propsScript = defineScript({
  properties: { speed: 100, target: vmath.vector3(0, 0, 0) },
  update(self) {
    const _speed: number = self.speed;
    const _target: Vector3 = self.target;
    void _speed;
    void _target;
  },
});
void propsScript;
type PropsScriptProps = ScriptPropertiesOf<typeof propsScript>;
const _extractedProps: PropsScriptProps = { speed: 1, target: vmath.vector3(0, 0, 0) };
void _extractedProps;
// @ts-expect-error the extracted shape carries only the declared properties
const _excessProps: PropsScriptProps = { speed: 1, target: vmath.vector3(0, 0, 0), extra: 1 };
void _excessProps;
// @ts-expect-error speed is number, not a string, in the extracted shape
const _wrongType: PropsScriptProps = { speed: "x", target: vmath.vector3(0, 0, 0) };
void _wrongType;

void hooks;

// No explicit type argument: `TSelf` is solved from `init`'s return alone and
// flows into every other hook's `self` (the `NoInfer` wrappers keep `update`
// from competing as a second inference site).
const inferred = defineScript({
  init: () => ({ counter: 0 }),
  update(self, dt) {
    const _n: number = self.counter;
    const _dt: number = dt;
    void _n;
    void _dt;
    // @ts-expect-error a property `init` never returned is not on the inferred self
    void self.missing;
  },
});
void inferred;

type GuiSelf = { root: Hash };

const guiHooks = defineGuiScript<GuiSelf>({
  init: () => ({ root: _hash }),
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

// `defineGuiScript` infers `TSelf` from `init`'s return identically.
const inferredGui = defineGuiScript({
  init: () => ({ root: _hash }),
  on_input(self) {
    const _root: Hash = self.root;
    void _root;
    // @ts-expect-error a property `init` never returned is not on the inferred self
    void self.missing;
  },
});
void inferredGui;

void guiHooks;

type RenderSelf = { tile_pred: unknown };

const renderHooks = defineRenderScript<RenderSelf>({
  init: () => ({ tile_pred: null }),
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

// `defineRenderScript` infers `TSelf` from `init`'s return identically, and
// still omits `on_input` from its hook surface.
const inferredRender = defineRenderScript({
  init: () => ({ frames: 0 }),
  update(self, dt) {
    const _n: number = self.frames;
    const _dt: number = dt;
    void _n;
    void _dt;
    // @ts-expect-error a property `init` never returned is not on the inferred self
    void self.missing;
  },
});
void inferredRender;

defineRenderScript<Record<string, never>>({
  // @ts-expect-error on_input is not a member of RenderScriptHooks
  on_input(_self, _action_id, _action) {},
});

void renderHooks;

// The callback-only base interfaces stay no-`self`-init (the `SCRIPT_HOOK_NAMES`
// drift pin keys on them): a hook table whose `init` takes no argument still
// conforms. The `…WithProperties` factory output deliberately does *not* — its
// `init(self)` reads the property channel — which is the breaking change this
// slice introduces, so the factory results above are no longer annotated as the
// base type.
const baseHooks: ScriptHooks<Self> = {
  init: () => ({ counter: 0 }),
};
void baseHooks;

const baseGuiHooks: GuiScriptHooks<GuiSelf> = {
  init: () => ({ root: _hash }),
};
void baseGuiHooks;

const baseRenderHooks: RenderScriptHooks<RenderSelf> = {
  init: () => ({ tile_pred: null }),
};
void baseRenderHooks;
