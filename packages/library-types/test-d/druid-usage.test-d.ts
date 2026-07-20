/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as druid from "druid.druid";

// Compile-only proof that the generated druid surface carries generics and
// `extends` inheritance. No assertions execute; `tsc --noEmit` is the gate. A
// regression (dropped `extends`, or a generic param lowered to `unknown`) is a
// compile error here.

declare const context: LuaTable;

const instance = druid.new_(context, undefined);

// A concrete component from a factory. `druid_button extends druid_component`, so
// the inherited `get_uid` resolves through the base interface.
const button = instance.new_button("button_node", undefined, undefined, undefined);
const buttonUid: number = button.get_uid();

// A generic component factory: `new_widget<T extends druid_component>` returns `T`.
// The argument is itself a `druid_component` (from an inherited base method), so
// `T` resolves to `druid_component` rather than lowering to `unknown`, and the
// inherited `get_uid` chains off the generic return.
const component = button.reset_input_priority();
const widget = instance.new_widget(component, undefined, undefined);
const widgetUid: number = widget.get_uid();

void buttonUid;
void widgetUid;
