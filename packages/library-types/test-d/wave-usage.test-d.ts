/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as wave from "wave";

// Compile-only proof for the curated wave native-extension namespace. No
// assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate.

wave.init(0.25, 0.5, 10, 1, 1.5, 0.25, 6, 0.8, 1, 256);
// @ts-expect-error both waves, the time multiplier and the capacity are required
wave.init(1, 2);

const id: number = wave.add_gameobject(go.get_id(), 0, 0, 0.5);
wave.add_gameobject("/boat", 0.2, 0, 0.5, 0.1, true, vmath.vector3(0, 0, -1));
wave.add_gameobject(msg.url("#"), 0, 0, 0.5, undefined, false);

wave.update_wave1(0.25, 0.5, 10, 1);
wave.update_wave2(1.5, 0.25, 6, 0.8);

const h: number = wave.get_wave1_height(0, 0, 1);
const _h2: number = wave.get_wave2_height(0, 0, 1);
// @ts-expect-error the runtime reads a third `time` argument and raises without it
wave.get_wave1_height(0, 0);
// @ts-expect-error the annotation stubs a time sampler the C++ never registers
wave.get_wave1_time_height(0, 0, 1);

wave.set_yaw(id, math.pi);
wave.move(id, h, 2);
wave.stop(id);
wave.pause(true);
const _paused: boolean = wave.is_pause();
wave.shutdown();
