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
// the inherited `get_uid` resolves through the base interface.
const button = instance.new_button("button_node", undefined, undefined, undefined);
const buttonUid: number = button.get_uid();

// A generic component factory: `new_widget<T extends druid_component>` returns `T`.
// Passing the concrete `button` (a `druid_button`) directly proves the base's
// permissive optional hook methods let a concrete component satisfy the
// `druid_component` constraint, and that `T` resolves to `druid_button` rather
// than widening to the base. A concrete-only member (`set_enabled`, absent from
// `druid_component`) and the inherited `get_uid` both chain off the return.
const widget = instance.new_widget(button, undefined, undefined);
const enabled = widget.set_enabled(false);
const enabledState: boolean = enabled.is_enabled();
const widgetUid: number = widget.get_uid();

void buttonUid;
void enabledState;
void widgetUid;
