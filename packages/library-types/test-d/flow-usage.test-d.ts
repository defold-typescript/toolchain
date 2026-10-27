/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as flow from "flow.flow";

interface ProjectSelf {
  active?: boolean;
}

const screens = {
  hub: {
    view: () =>
      flow.ui.cp.Box({
        key: "root",
        style: { flex_direction: "column" },
        children: [flow.ui.cp.Text({ key: "t", text: "hi" })],
      }),
  },
};

export function init(self: ProjectSelf): void {
  flow.init(self, { initial_screen: "hub", screens });
}

export function update(self: ProjectSelf, dt: number): boolean {
  return flow.update(self, dt);
}

export function onInput(
  self: ProjectSelf,
  actionId: Hash,
  action: { x?: number; y?: number; pressed?: boolean; released?: boolean },
): boolean {
  return flow.on_input(self, actionId, action);
}

export function onMessage(
  self: ProjectSelf,
  messageId: Hash,
  message: Record<string, unknown>,
  sender: Url,
): boolean {
  return flow.on_message(self, messageId, message, sender);
}

export function facadeModules(self: ProjectSelf): void {
  flow.ui.cp.Markdown({ text: "# Hello" });
  flow.ui.Flex.Node.new({ key: "node" });
  flow.nav.push("hub", { id: 1 }, "slide_left");
  flow.nav.runtime.init(self, { initial_screen: "hub", screens });
  flow.log.set_level("debug");
  const color: string = flow.color.rgba(1, 1, 1, 0.5);
  const sheet = flow.bottom_sheet({ key: "sheet", children: [] });
  void color;
  void sheet;

  // @ts-expect-error flex_direction is restricted to Flow's supported literals
  flow.ui.cp.Box({ key: "bad", style: { flex_direction: "diagonal" } });
  // @ts-expect-error log levels are restricted to Flow's supported literals or numbers
  flow.log.set_level("loud");
}
