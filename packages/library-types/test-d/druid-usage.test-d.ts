/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as druid from "druid.druid";

// Compile-only proof that the generated druid surface carries generics and
// `extends` inheritance, and that a concrete component structurally satisfies
// `druid_component`. No assertions execute; `tsc --noEmit` is the gate. A
// regression (dropped `extends`, a generic param lowered to `unknown`, or a
// concrete component that no longer satisfies the base constraint) is a compile
// error here.

declare const context: LuaTable;

const instance = druid.new_(context, undefined);

// A concrete component from a factory. `druid_button extends druid_component`, so
// the inherited public `get_name` resolves through the base interface. (`get_uid`
// is `@protected` on the base and now hidden, so a public inherited member proves
// the same inheritance.)
const button = instance.new_button("button_node", undefined, undefined, undefined);
const buttonName: string = button.get_name();

// A generic component factory: `new_widget<T extends druid_component>` returns `T`.
// Passing the concrete `button` (a `druid_button`) directly proves a concrete
// component satisfies the `druid_component` constraint — the base's protected
// lifecycle hooks are non-public and now dropped, so the constraint is only the
// public method surface a subcomponent already carries — and that `T` resolves to
// `druid_button` rather than widening to the base. A concrete-only member
// (`set_enabled`, absent from `druid_component`) and the inherited `get_name` both
// chain off the return.
const widget = instance.new_widget(button, undefined, undefined);
const enabled = widget.set_enabled(false);
const enabledState: boolean = enabled.is_enabled();
const widgetName: string = widget.get_name();

// The drag callback the runtime actually calls: `on_drag:trigger` passes the
// context plus five values, and druid's own `rich_input` consumer declares
// `(self, dx, dy, x, y, touch)`. A two-parameter generated type reds this line.
const drag = instance.new_drag("drag_node", undefined);
drag.init("drag_node", (self, dx, dy, x, y, touch) => {
  const travelled: number = dx + dy + x + y;
  const touchX: number = touch.x;
  void self;
  void travelled;
  void touchX;
});

void buttonName;
void enabledState;
void widgetName;
