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

void _payload;
void _required;
