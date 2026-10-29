/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import type { InputAction } from "@defold-typescript/types";
import * as flex from "flow.flex";
import * as layout from "flow.layout";
import * as runtime from "flow.navigation.runtime";
import type { Flow_BoxProps, Flow_FlexNode } from "flow.types";
import * as ui from "flow.ui";

// Compile-only proof that the flow module LuaLS goldens, and the flow.types
// vocabulary they import, are callable the way upstream's README drives them from a
// gui_script and a plain .script. the `dts-declaration-validity` compile
// (skipLibCheck: false) is the gate.

type GuiSelf = { tree?: Flow_BoxProps };

const tree: Flow_BoxProps = { key: "root", style: { flex_direction: "column" }, children: [] };

// Reds if `self` lowers to `LuaTable`, which a project's own self type cannot satisfy.
export function guiInit(self: GuiSelf): void {
  ui.mount(self, { debug: true });
  ui.render(self, tree, 960, 640);
  layout.compute(tree, 0, 0, 960, 640);
}

export function guiInput(self: GuiSelf, action_id: Hash | undefined, action: InputAction): boolean {
  return ui.on_input(self, action_id, action);
}

type ScriptSelf = { navigation?: unknown };

// README "Navigation Outside GUI".
export function scriptInit(self: ScriptSelf): void {
  runtime.init(self, {
    screens: {
      gameplay: {
        url: msg.url("main:/gameplay_controller#script"),
        proxy_url: msg.url("main:/gameplay_proxy#collectionproxy"),
        preload: true,
      },
    },
    initial_screen: "gameplay",
  });
  // @ts-expect-error -- `screens` maps each screen id to its definition.
  runtime.init(self, { screens: 1 });
}

export function scriptOnMessage(
  self: ScriptSelf,
  message_id: Hash,
  message: Record<string | number, unknown>,
  sender: Url,
): void {
  if (runtime.on_message(self, message_id, message, sender)) return;
  runtime.final(self);
}

// The flow/flex.lua header: a Node tree built with the constructor table and chained setters.
export function flexTree(): Flow_FlexNode {
  const root = flex.Node.new({ key: "root" })
    .set_width(960)
    .set_flex_direction("row")
    .calculate_layout(960, 640);
  const style = root.style;
  const children: Flow_FlexNode[] = root.children;
  const plain: Flow_FlexNode = flex.Node.new({ key: "n" });
  flex.calculate_layout(tree, 960, 640);
  // @ts-expect-error -- flow.flex exports the constructor as Node.new.
  flex.new({ key: "root" });
  return style && children.length > 0 ? plain : root;
}
