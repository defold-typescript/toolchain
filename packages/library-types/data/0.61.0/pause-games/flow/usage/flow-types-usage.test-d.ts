/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import type { Flow_BoxProps, Flow_InitConfig, Flow_Navigation } from "flow.types";

// Compile-only proof that the flow.types LuaLS golden accepts the screen registry and
// element tree upstream's README passes as plain tables. the `dts-declaration-validity`
// compile (skipLibCheck: false) is the gate.

const box: Flow_BoxProps = {
  key: "root",
  style: { flex_direction: "row", width: "100%", gap: 8 },
  children: [{ key: "title", type: "text", text: "Hub" }],
};

// Reds if `screens` lowers to `LuaTable`, which an object literal cannot satisfy.
const cfg: Flow_InitConfig = {
  initial_screen: "hub",
  screens: { hub: { view: (_params, _nav) => box } },
};
void cfg;

const bad: Flow_BoxProps = {
  key: "bad",
  // @ts-expect-error -- flex_direction is the literal union "column" | "row".
  style: { flex_direction: "diagonal" },
};
void bad;

declare const nav: Flow_Navigation;
// Reds if `params` lowers to `LuaTable`.
nav.push("hub", { id: 1 });
nav.replace("hub", { id: 2 }, { transition: "fade" });
nav.reset("hub", { id: 3 });
