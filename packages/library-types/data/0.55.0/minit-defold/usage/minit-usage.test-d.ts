/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as minit from "minit.minit";

// Compile-only proof for the minit fork, written as upstream's README drives it. No
// assertions execute; the `dts-declaration-validity` compile is the gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

minit.loading_done();

const level = minit.get_config_value("level");
const _level: Equal<typeof level, string> = true;
void _level;
minit.get_config_value("difficulty", "normal");

// An empty stored slot reads as "", an absent one as undefined.
const saved = minit.get_user_data();
const _saved: Equal<typeof saved, string | undefined> = true;
void _saved;

const tutorial = minit.should_show_tutorial();
const _tutorial: Equal<typeof tutorial, boolean> = true;
void _tutorial;
const visible = minit.is_viewable();
const _visible: Equal<typeof visible, boolean> = true;
void _visible;

const off = minit.on_viewable_change((viewable) => {
  const _viewable: Equal<typeof viewable, boolean> = true;
  void _viewable;
});
const _off: Equal<typeof off, () => void> = true;
void _off;
off();

// Time-sorted games report seconds, and upstream takes the score as a number or a string.
minit.report_result(42);
minit.report_result("42.5", { flavor_text: "gg", delay: 500, user_data: "" });

// @ts-expect-error a score is a number or a string
minit.report_result(true);
// @ts-expect-error delay is a number of milliseconds
minit.report_result(1, { delay: "500" });
// @ts-expect-error the callback gets whether the game is viewable
minit.on_viewable_change((viewable: string) => print(viewable));
