/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as flow from "flow.flow";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

type MessageId = Hash | string;

// `safe_hash` returns the raw string outside Defold, so every id is `Hash | string`. Each path
// is read on its own: an array of both subtype-reduces to the messages transport.
const _navIdsPush: Equal<typeof flow.nav.ids.push, MessageId> = true;
const _navIdsPop: Equal<typeof flow.nav.ids.pop, MessageId> = true;
const _navIdsReplace: Equal<typeof flow.nav.ids.replace, MessageId> = true;
const _navIdsReset: Equal<typeof flow.nav.ids.reset, MessageId> = true;
const _navIdsBack: Equal<typeof flow.nav.ids.back, MessageId> = true;
const _navIdsInvalidate: Equal<typeof flow.nav.ids.invalidate, MessageId> = true;
const _navPush: Equal<typeof flow.nav.PUSH, MessageId> = true;
const _navPop: Equal<typeof flow.nav.POP, MessageId> = true;
const _navReplace: Equal<typeof flow.nav.REPLACE, MessageId> = true;
const _navReset: Equal<typeof flow.nav.RESET, MessageId> = true;
const _navBack: Equal<typeof flow.nav.BACK, MessageId> = true;
const _navInvalidate: Equal<typeof flow.nav.INVALIDATE, MessageId> = true;
const _messagesIdsPush: Equal<typeof flow.nav.messages.ids.push, MessageId> = true;
const _messagesIdsPop: Equal<typeof flow.nav.messages.ids.pop, MessageId> = true;
const _messagesIdsReplace: Equal<typeof flow.nav.messages.ids.replace, MessageId> = true;
const _messagesIdsReset: Equal<typeof flow.nav.messages.ids.reset, MessageId> = true;
const _messagesIdsBack: Equal<typeof flow.nav.messages.ids.back, MessageId> = true;
const _messagesIdsInvalidate: Equal<typeof flow.nav.messages.ids.invalidate, MessageId> = true;
const _messagesPush: Equal<typeof flow.nav.messages.PUSH, MessageId> = true;
const _messagesPop: Equal<typeof flow.nav.messages.POP, MessageId> = true;
const _messagesReplace: Equal<typeof flow.nav.messages.REPLACE, MessageId> = true;
const _messagesReset: Equal<typeof flow.nav.messages.RESET, MessageId> = true;
const _messagesBack: Equal<typeof flow.nav.messages.BACK, MessageId> = true;
const _messagesInvalidate: Equal<typeof flow.nav.messages.INVALIDATE, MessageId> = true;

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
  // @ts-expect-error bottom-sheet backdrop colors are color strings
  flow.bottom_sheet({ key: "sheet", children: [], backdrop_color: 1 });
}

export function navigationMessages(messageId: Hash, message: Record<string, unknown>): boolean {
  flow.nav.replace("screen", {}, "fade");

  return (
    flow.nav.on_message(messageId, message) ||
    flow.nav.handle_message(messageId, message) ||
    flow.nav.messages.on_message(messageId, message) ||
    flow.nav.messages.handle_message(messageId, message)
  );
}
