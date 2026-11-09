/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as trail_maker from "hyper_trails.trail_maker";

// Compile-only proof that the hyper trails LuaLS golden accepts the plain
// options table the upstream README passes as `self`. the `dts-declaration-validity`
// compile (skipLibCheck: false) is the gate.

// Reds if `self` lowers to `LuaTable`, which an object literal cannot satisfy.
trail_maker.init_vars({ trail_width: 15, points_count: 20 });
trail_maker.queue_late_update();

const position: Vector3 = trail_maker.get_position({ trail_width: 15 });
void position;
