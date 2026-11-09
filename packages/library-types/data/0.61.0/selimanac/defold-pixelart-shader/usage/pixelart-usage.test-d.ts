/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as pixelart from "pixelart.scripts.pixelart";

// Compile-only proof that the pixel-art shader LuaLS golden is callable with
// the settings upstream documents. the `dts-declaration-validity` compile
// (skipLibCheck: false) is the gate.

pixelart.init({ pixel_size: 4, normal_edge_coefficient: 1, depth_edge_coefficient: 1 });

// @ts-expect-error -- `pixel_size` is a required setting.
pixelart.init({ normal_edge_coefficient: 1, depth_edge_coefficient: 1 });

pixelart.set_light("/light#light", "/light_target");
pixelart.set_ambient_light(vmath.vector3(0.2, 0.2, 0.2));
