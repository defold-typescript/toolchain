/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as gamepush from "gamepush.gamepush";

// Compile-only proof for the GamePush entry module, the one a project requires. No
// assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate. Each module
// field is a `typeof import` of a module id, so a call through a field compiles only when
// the golden that declares that id is present and the field names it correctly.

gamepush.init((success) => {
  const ok: boolean = success;
  void ok;
});

// @ts-expect-error `core.init` raises on a nil callback.
gamepush.init();

gamepush.player.sync();
const days: number = gamepush.player.stats.active_days();
void days;

// `social_actions` is the same table as `socials`, so each accepts what the other does.
const share = { text: "Play with me" };
gamepush.social_actions.share(share);
gamepush.socials.share(share);
const socials: typeof gamepush.socials = gamepush.social_actions;
void socials;

gamepush.callbacks.change_orientation = (is_portrait) => {
  const portrait: boolean = is_portrait;
  void portrait;
};
gamepush.callbacks.pause = () => {};

const ru: "ru" = gamepush.languages.RUSSIAN;
void ru;
gamepush.change_language(gamepush.languages.ENGLISH);

// @ts-expect-error the body raises on a non-string language code.
gamepush.change_language();

gamepush.platform.call_native_sdk("feedback.canReview");
gamepush.platform.call_native_sdk("feedback.canReview", undefined, (result) => {
  void result;
});

const version: string = gamepush.get_plugin_version();
void version;
