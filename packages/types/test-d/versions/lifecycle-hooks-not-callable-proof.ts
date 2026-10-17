export {};

// The engine looks a lifecycle hook up as a script global and binds no `go` or
// `gui` function under its name, so every hook access below must fail to
// compile on every target. The positive controls show both namespaces resolve,
// so each expected error comes from the hook alone. Each directive guards a bare
// member access, not a call: a call stays rejected by a restored declaration's
// receiver type or arity, which keeps the directive used and lets the hook
// through. Since 1.13.2, `go.on_input` is a type-only namespace with no value,
// so its line errors until a function merges with it.

go.get_position();
gui.get_node("n");

// @ts-expect-error go.init is not a module function
void go.init;
// @ts-expect-error go.update is not a module function
void go.update;
// @ts-expect-error go.fixed_update is not a module function
void go.fixed_update;
// @ts-expect-error go.late_update is not a module function
void go.late_update;
// @ts-expect-error go.on_message is not a module function
void go.on_message;
// @ts-expect-error go.on_input is not a module function
void go.on_input;
// @ts-expect-error go.final is not a module function
void go.final;
// @ts-expect-error go.on_reload is not a module function
void go.on_reload;

// @ts-expect-error gui.init is not a module function
void gui.init;
// @ts-expect-error gui.update is not a module function
void gui.update;
// @ts-expect-error gui.fixed_update is not a module function
void gui.fixed_update;
// @ts-expect-error gui.late_update is not a module function
void gui.late_update;
// @ts-expect-error gui.on_message is not a module function
void gui.on_message;
// @ts-expect-error gui.on_input is not a module function
void gui.on_input;
// @ts-expect-error gui.final is not a module function
void gui.final;
// @ts-expect-error gui.on_reload is not a module function
void gui.on_reload;
