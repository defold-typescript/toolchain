/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as illumination from "illumination.illumination";

// Compile-only proof for the illumination fork, written as upstream's README drives it. No
// assertions execute; the `dts-declaration-validity` compile is the gate.

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

// set_light compares `color.w`, `radius` and `cutoff` above 0 on every light it is given, and
// update_light encodes `position` on every light that is on.
type LightArg = NonNullable<Parameters<typeof illumination.set_light>[0]>;
type IsRequired<K extends keyof LightArg> =
  Pick<LightArg, K> extends Required<Pick<LightArg, K>> ? true : false;
const _position: IsRequired<"position"> = true;
void _position;
const _color: IsRequired<"color"> = true;
void _color;
const _radius: IsRequired<"radius"> = true;
void _radius;
const _cutoff: IsRequired<"cutoff"> = true;
void _cutoff;

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
