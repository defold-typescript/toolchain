export {};

// The engine looks a lifecycle hook up as a script global and binds no `go` or
// `gui` function under its name, so every call below must fail to compile on
// every target. The positive controls show both namespaces resolve, so each
// expected error comes from the hook alone. `arg` fits any slot a declared hook
// would take, so a target that still declares one compiles its line cleanly.

declare const self: unknown;
declare const arg: never;

go.get_position();
gui.get_node("n");

// @ts-expect-error
go.init(self);
// @ts-expect-error
go.final(self);
// @ts-expect-error
go.update(self, 0);
// @ts-expect-error
go.fixed_update(self, 0);
// @ts-expect-error
go.late_update(self, 0);
// @ts-expect-error
go.on_message(self, arg, arg, arg);
// @ts-expect-error
go.on_input(self, arg, arg);
// @ts-expect-error
go.on_reload(self);

// @ts-expect-error
gui.init(self);
// @ts-expect-error
gui.final(self);
// @ts-expect-error
gui.update(self, 0);
// @ts-expect-error
gui.on_message(self, arg, arg, arg);
// @ts-expect-error
gui.on_input(self, arg, arg);
// @ts-expect-error
gui.on_reload(self);
