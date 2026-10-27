/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as fake_real_glass from "fake_real_glass.fake_real_glass";

// Compile-only proof that the defold-glass LuaLS golden is callable the way the
// upstream README drives it from a render script. tsc --noEmit under
// tsconfig.dts-check.json (skipLibCheck: false) is the gate.

// Reds if the module constants stop exporting or the probe mode degrades to `unknown`.
const glass: fake_real_glass.FakeRealGlassState = fake_real_glass.create({
  probe_mode: fake_real_glass.PROBE_MODE.EVERY_FRAME,
});

// @ts-expect-error -- the probe mode is the 0 | 1 | 2 enum, so 3 is rejected.
fake_real_glass.create({ probe_mode: 3 });

fake_real_glass.resize(glass, 960, 640);
const handled: boolean = fake_real_glass.on_message(glass, fake_real_glass.MSG_SET_PROBE_SETTINGS, {
  mode: fake_real_glass.PROBE_MODE_CAPTURE_ONCE,
  rebuild: true,
});
fake_real_glass.final(glass);

void handled;
