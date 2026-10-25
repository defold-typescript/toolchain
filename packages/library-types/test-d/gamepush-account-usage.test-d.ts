/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as achievements from "gamepush.core.achievements";
import * as ads from "gamepush.core.ads";
import * as payments from "gamepush.core.payments";
import * as player from "gamepush.core.player";
import * as uniques from "gamepush.core.uniques";

// Compile-only proof for the hand-authored GamePush account and commerce modules. No
// assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate. Upstream
// ships plain Lua whose annotations say only `table` and `function`, so this is where the
// declared shapes are held to being callable as the README documents them.

// `check_table` and `check_callback` both let nil through.
player.sync();
player.sync({ override: true }, () => {});

player.enable_auto_sync({ interval: 10, storage: "cloud" });

// @ts-expect-error `check_table_required` raises on a missing table.
player.enable_auto_sync();

// @ts-expect-error `storage` is one of the four kinds the README lists.
player.enable_auto_sync({ interval: 10, storage: "disk" });

// @ts-expect-error `check_value` accepts a string, number or boolean only.
player.set("gold", {});

// Event slots are assigned on the module's `callbacks` table and called with no `self`.
player.callbacks.sync = (success) => {
  const _synced: boolean = success;
  void _synced;
};

// The submodule is reachable through `player.stats` as well as its own module id.
const days: number = player.stats.active_days();
void days;

payments.has(42);
ads.show_rewarded_video();

const epic: "EPIC" = achievements.rare.EPIC;
void epic;

// `delete` is a reserved word, so the fork declares it under a local name and exports
// it under the Lua one; only the Lua name is reachable.
uniques.delete({ tag: "login" });
// @ts-expect-error the local declaration name is not exported.
uniques.delete_({ tag: "login" });

// The native bridge is internal to the wrappers, so no declaration types the global.
// @ts-expect-error no `gamepush` global is declared.
gamepush.call_api("x");
