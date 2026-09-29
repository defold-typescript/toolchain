/// <reference path="../index.d.ts" />

import type { Opaque } from "../src/core-types";

// Declarations the engine's own Lua bindings contradict: each accepted form
// below is one the binding reads without raising, and each rejected form is one
// the binding raises on.

declare const body: Opaque<"b2Body">;
declare const shapeHandle: Opaque<"b2Shape">;
declare const massHandle: Opaque<"b2MassData">;
declare const maybeNumbers: number[] | undefined;

const box = { type: b2d.shape.SHAPE_TYPE_BOX, hx: 1, hy: 1 } as const;

// v3 CheckFilterData starts from b2DefaultFilter() and reads each field only
// when it is not nil.
b2d.body.create_chain(body, { vertices: [vmath.vector3()], filter: { mask_bits: 1 } });

// The v2 fixture filter reads every field unguarded.
// @ts-expect-error
b2d.body.create_fixture(body, { shape: box, filter: { mask_bits: 1 } });

// GetResourceHashCallback pushes each entry with lua_pushlstring.
const resourceIds: string[] = collectionproxy.get_resources("#proxy");
void resourceIds;
// @ts-expect-error
const resourceHashes: Hash[] = collectionproxy.get_resources("#proxy");
void resourceHashes;

// Vector_new makes an empty vector only when lua_gettop(L) == 0, else checks
// argument 1 is a table.
vmath.vector();
vmath.vector([1, 2]);
// @ts-expect-error
vmath.vector(undefined);
// @ts-expect-error
vmath.vector(maybeNumbers);

// The v2 fixture definition reads is_sensor when sensor is absent.
b2d.body.create_fixture(body, { shape: box, is_sensor: true });

// CheckBufferOrString takes a buffer or a string.
const soundBuffer = buffer.create(4, [
  { name: hash("data"), type: buffer.VALUE_TYPE_UINT8, count: 1 },
]);
resource.create_sound_data("/sound.oggc", { data: soundBuffer });
resource.create_sound_data("/sound.oggc", { data: "raw bytes" });
// @ts-expect-error
resource.create_sound_data("/sound.oggc", { data: 1 });

// CheckFixtureDef and CheckMassData raise on a non-table argument.
// @ts-expect-error
b2d.body.set_mass_data(body, massHandle);
// @ts-expect-error
b2d.body.create_fixture(body, shapeHandle, 1);
b2d.body.set_mass_data(body, { mass: 1, center: vmath.vector3(), inertia: 1 });
b2d.body.create_fixture(body, { shape: box, density: 1 });
