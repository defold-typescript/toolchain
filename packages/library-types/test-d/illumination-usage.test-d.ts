/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as illumination from "illumination.illumination";

// Compile-only proof for the illumination fork, written as upstream's README drives it. No
// assertions execute; tsc --noEmit under tsconfig.dts-check.json is the gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

illumination.set_debug(true);
const debug = illumination.is_debug();
const _debug: Equal<typeof debug, boolean> = true;
void _debug;

const url = msg.url();
illumination.set_light(
  { position: vmath.vector3(), color: vmath.vector4(1), radius: 5, cutoff: 1 },
  url,
);
illumination.set_light(
  {
    position: go.get_world_position(),
    direction: vmath.rotate(go.get_world_rotation(), vmath.vector3(0, 0, 1)),
    color: vmath.vector4(1),
    radius: 5,
    specular: 0.5,
    smoothness: 1,
    cutoff: 0.3,
  },
  "#",
);
illumination.set_light(undefined, url);

illumination.set_environment({ fog_type: illumination.FOG_TYPE_RADIAL, fog_min: 20 });
illumination.set_environment({
  ambient_color: vmath.vector4(1, 1, 1, 0.2),
  sunlight_direction: vmath.vector3(0, -1, 0),
  fog_color: vmath.vector4(0.53, 0.8, 0.92, 1),
});
const _fog: Equal<illumination.FogType, 0 | 1 | 2> = true;
void _fog;

// @ts-expect-error set_light reads `radius` on every light it is given
illumination.set_light({ position: vmath.vector3(), color: vmath.vector4(1), cutoff: 1 }, url);
// @ts-expect-error the fog type is one of the three FOG_TYPE_* values
illumination.set_environment({ fog_type: 3 });
// @ts-expect-error init is run by the bundled illumination.script, not by a project
illumination.init(msg.url(), msg.url());
