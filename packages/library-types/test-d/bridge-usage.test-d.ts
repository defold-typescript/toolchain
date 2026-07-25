/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import { bridge } from "bridge.bridge";

// Compile-only proof that the script_api golden is an importable module keyed by
// its `moduleId`: `import { bridge } from 'bridge.bridge'` resolves and the nested
// sub-namespace surface type-checks against the emitted signature. No assertions
// execute; `tsc --noEmit` under `tsconfig.dts-check.json` is the gate. A
// regression (the golden reverting to `declare global`, or the module dropping
// the `bridge` export) is a compile error here. While the byte-frozen ts-defold
// `generated/bridge.bridge.d.ts` still owns this specifier under the main
// typecheck, this proof compiles only under dts-check, which sees the script_api
// golden alone.

const cb = (...args: unknown[]): unknown => args;

bridge.achievements.get_achievements(cb, cb);
