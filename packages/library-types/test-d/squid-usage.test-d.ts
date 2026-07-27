/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as squid from "squid.squid";

// Compile-only proof (mirroring lang-usage.test-d.ts) that the squid LuaLS golden
// ships the bug-80 surface: `new` returns a typed `SquidInstance` handle carrying the
// instance methods, the module constants export as module-level values, and
// `get_config` is fully typed. No assertions execute; tsc --noEmit under
// tsconfig.dts-check.json (skipLibCheck: false) is the gate. A regression (the
// constants stranding on an unattached interface, `new` reverting to `void`, or the
// instance handle vanishing) is a compile error here.

const inst = squid.new("tag", true);
inst.log("m", squid.INFO);
inst.trace("m");
inst.save_logs();

const level: number = squid.TRACE;
const saved: boolean = squid.save_logs();
const enabled: boolean = squid.get_config().is_enabled;

void inst;
void level;
void saved;
void enabled;
