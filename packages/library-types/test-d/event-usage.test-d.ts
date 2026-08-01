/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as event from "event.event";

// Compile-only proof (mirroring bridge-usage.test-d.ts) that the event LuaLS
// golden accepts faithful upstream calls: `create` with its trailing nil-bearing
// params omitted, `subscribe` with only the required callback, and a callable
// event instance driven by the class `@overload`. No assertions execute;
// `tsc --noEmit` under tsconfig.dts-check.json (skipLibCheck: false) is the gate.
// A regression (the trailing params reverting to required, or the interface
// losing its call signature) is a compile error here. The instance type is taken
// by inference: the emitter emits bare `interface`s, reachable structurally
// through `create`'s return rather than as a named export.

const cb = (...args: unknown[]): unknown => args;

const created = event.create();
const withCallback = event.create(cb);

created.subscribe(cb);
const triggered: unknown = withCallback(cb);
void triggered;

// The callback param lowers from LuaLS's bare `function`, so it must stay wide
// enough to accept a concretely-typed literal: `any[]` params, not `unknown[]`,
// which `strictFunctionTypes` would reject here.
created.subscribe((value: string) => {
  print(value);
});
