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
// shifting left, so both arities compile; a positional-only emit rejects the first.
bridge.social.create_post({}, cb, cb);
bridge.social.create_post({}, "seed", cb, cb);

// A `.script_api` list type (`[table, string]`) reaches the declaration as a union:
// a config entry id is accepted, and a number is not, so the slot is not `unknown`.
bridge.social.share("share-entry", cb, cb);
bridge.social.invite_friends("invite-entry", cb, cb);
// @ts-expect-error options is a table or a config entry id
bridge.social.share(42, cb, cb);

const _source: string | undefined = bridge.platform.launch_source();
const _rewardSupported: boolean = bridge.social.is_post_reward_supported();
bridge.social.get_post_reward(cb, cb);

void _payload;
void _required;
void _source;
void _rewardSupported;
