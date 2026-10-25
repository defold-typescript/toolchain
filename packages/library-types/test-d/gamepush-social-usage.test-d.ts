/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as channels from "gamepush.core.channels";
import * as events from "gamepush.core.events";
import * as feedbacks from "gamepush.core.feedbacks";
import * as multiplayer from "gamepush.core.multiplayer";
import * as reactions from "gamepush.core.reactions";
import * as schedulers from "gamepush.core.schedulers";
import * as socials from "gamepush.core.socials";
import * as triggers from "gamepush.core.triggers";

// Compile-only proof for the hand-authored GamePush social and live-ops modules. No
// assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate. As for the
// account and commerce modules, upstream's annotations say only `table` and `function`, so
// this is where the declared shapes are held to being callable as the README documents them.

// `check_table` lets nil through.
channels.open_chat();

channels.send_message({ channelId: 1, text: "hi" }, (result) => {
  void result;
});

// @ts-expect-error `check_table_required` raises on a missing table.
channels.send_message();

channels.set_value({ channelId: 1, key: "score", value: 10 });
channels.add_value({ channelId: 1, key: "score", value: 5 });

schedulers.claim_day("daily", 3);
schedulers.claim_day(7, 3, (result) => {
  void result;
});

// @ts-expect-error `check_number` is called without `can_be_nil`, so the day is required.
schedulers.claim_day("daily");

const mode: "fast" = multiplayer.MODE_FAST;
void mode;
multiplayer.set_mode(multiplayer.MODE_SMOOTH);

multiplayer.connect({ channelId: 1 });
multiplayer.disconnect();
multiplayer.send_message("hit", { damage: 3 }, { target: "all", echo: true });
multiplayer.set_player_initializer((player_id, player_info) => {
  void player_info;
  return { id: player_id, hp: 100 };
});

const shareUrl: string = socials.make_share_url({ level: 3 });
void shareUrl;

// One assigned slot per module, each called with no `self`.
channels.callbacks.event_message = (message) => {
  void message;
};
socials.callbacks.share = (success) => {
  const _shared: boolean = success;
  void _shared;
};
multiplayer.callbacks.became_host = () => {};
multiplayer.callbacks.tick = (delta) => {
  const _delta: number = delta;
  void _delta;
};
events.callbacks.join = (event) => {
  void event;
};
triggers.callbacks.activate = (trigger) => {
  void trigger;
};
schedulers.callbacks.claim_day = (scheduler) => {
  void scheduler;
};
feedbacks.callbacks.open_feedbacks_list = () => {};
reactions.callbacks.set_error = (error) => {
  void error;
};

// Slot names come from the callback ids the dispatcher derives them from, not from the
// README, which misspells this one.
// @ts-expect-error `event_messaget` is not a slot.
channels.callbacks.event_messaget = () => {};
