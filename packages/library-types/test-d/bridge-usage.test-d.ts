/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import { bridge } from "bridge.bridge";

// Compile-only proof that the script_api golden is an importable module keyed by
// its `moduleId`: `import { bridge } from 'bridge.bridge'` resolves and the nested
// sub-namespace surface type-checks against the emitted signature. No assertions
// execute; `tsc --noEmit` is the gate (both the general typecheck and the strict
// `tsconfig.dts-check.json` declaration check compile it against the sole
// script_api `generated/bridge.d.ts`). A regression (the golden reverting
// to `declare global`, or the module dropping the `bridge` export) is a compile
// error here.

const cb = (...args: unknown[]): unknown => args;

bridge.achievements.get_achievements(cb, cb);

// A `.script_api` `type: string | nil` return is lowered to `string | undefined`
// rather than collapsing to `unknown`: it assigns to the nullable type and a bare
// `string` rejects it, so the nullability survives into the consumer.
const _payload: string | undefined = bridge.platform.payload();
// @ts-expect-error the return is nullable and must be narrowed before use
const _required: string = bridge.platform.payload();

// `create_post`'s interior `payload` is omittable upstream, with the callbacks
// then following the id, so both arities compile; a positional-only emit rejects
// the first.
bridge.social.create_post("post-entry", cb, cb);
bridge.social.create_post("post-entry", "seed", cb, cb);

// The social calls take the id of a config entry in their first slot: a string is
// accepted, and a table or a number is not, so the slot is not `unknown`.
bridge.social.share("share-entry", cb, cb);
bridge.social.invite_friends("invite-entry", cb, cb);
// @ts-expect-error id is a config entry id, not a table
bridge.social.share({}, cb, cb);
// @ts-expect-error id is a config entry id
bridge.social.share(42, cb, cb);

bridge.social.join_community(cb, cb);
// @ts-expect-error no options slot precedes the callbacks
bridge.social.join_community({}, cb, cb);

// A slot upstream marks omittable in prose only compiles with and without it,
// whether it trails (`analytics.send`'s `data`) or sits ahead of the callbacks
// (the `platform` `options`).
bridge.analytics.send("level_start");
bridge.analytics.send("level_start", { level: 3 });
bridge.platform.send_message("game_ready", cb, cb);
bridge.platform.send_message("game_ready", {}, cb, cb);
bridge.platform.send_custom_message("id", cb, cb);
bridge.platform.send_custom_message("id", {}, cb, cb);

const _source: string | undefined = bridge.platform.launch_source();
const _rewardSupported: boolean = bridge.social.is_post_reward_supported();
bridge.social.get_post_reward(cb, cb);

void _payload;
void _required;
void _source;
void _rewardSupported;
