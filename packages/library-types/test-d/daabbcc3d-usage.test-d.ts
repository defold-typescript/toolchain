/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

// Compile-only proof for the curated daabbcc3d native-extension namespace. No
// assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate.

const group: number = daabbcc3d.new_group(daabbcc3d.UPDATE_INCREMENTAL);
daabbcc3d.new_group();

const aabb: number = daabbcc3d.insert_aabb(group, vmath.vector3(10, 20, 30), 32, 32, 32);
// @ts-expect-error a 3D AABB needs its depth after width and height
daabbcc3d.insert_aabb(group, vmath.vector3(10, 20, 30), 32, 32);
// @ts-expect-error the position is one vector3, not separate coordinates
daabbcc3d.insert_aabb(group, 10, 20, 30, 32, 32, 32);

const followed: number = daabbcc3d.insert_gameobject(group, go.get_id(), 32, 32, 32);
daabbcc3d.insert_gameobject(group, msg.url("#"), 32, 32, 32, 1, true);
daabbcc3d.update_aabb(group, aabb, vmath.vector3(), 16, 16, 16);
daabbcc3d.update_gameobject_size(group, followed, 64, 64, 64);

const [hits, count] = daabbcc3d.query_aabb(group, vmath.vector3(), 100, 100, 100);
const _count: number = count;
// @ts-expect-error nothing overlapping returns nil, so the result must be narrowed first.
hits[0];
if (hits !== undefined) {
  const first = hits[0];
  if (typeof first === "number") {
    daabbcc3d.remove(group, first);
  } else if (first !== undefined) {
    const _id: number = first.id;
    const _bits: number = first.category_bits;
  }
}

const [sorted, sortedCount] = daabbcc3d.raycast_sort(
  group,
  vmath.vector3(0, 0, 0),
  vmath.vector3(100, 100, 100),
  undefined,
  true,
);
const _sortedCount: number = sortedCount;
if (sorted !== undefined) {
  for (const hit of sorted) {
    const _id: number = hit.id;
    const _bits: number = hit.category_bits;
    if ("distance" in hit) {
      const _distance: number = hit.distance;
    }
    if ("depth" in hit) {
      const _depth: number = hit.depth;
      const _contact: Vector3 = hit.contact_point;
      const _normal: Vector3 = hit.normal;
    }
  }
}

daabbcc3d.query_id(group, aabb, 0xffff, false, true);
daabbcc3d.query_aabb_sort(group, vmath.vector3(), 10, 10, 10);
daabbcc3d.query_id_sort(group, aabb);
daabbcc3d.raycast(group, vmath.vector3(), vmath.vector3(10, 10, 10));

daabbcc3d.run(false);
daabbcc3d.update_frequency(30);
daabbcc3d.rebuild(group, true);
daabbcc3d.rebuild_all(undefined, true);
// @ts-expect-error the one-argument form puts the flag where the runtime ignores it
daabbcc3d.rebuild_all(true);
daabbcc3d.remove_group(group);
daabbcc3d.reset();

const _modes: number[] = [
  daabbcc3d.UPDATE_INCREMENTAL,
  daabbcc3d.UPDATE_FULLREBUILD,
  daabbcc3d.UPDATE_PARTIALREBUILD,
];

export {};
