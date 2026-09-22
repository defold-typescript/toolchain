/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

// Compile-only proof for the curated DAABBCC native-extension namespace. No
// assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate.

const group: number = daabbcc.new_group(daabbcc.UPDATE_PARTIALREBUILD);
daabbcc.new_group();

const aabb: number = daabbcc.insert_aabb(group, 10, 20, 32, 32);
const followed: number = daabbcc.insert_gameobject(group, go.get_id(), 32, 32);
daabbcc.insert_gameobject(group, msg.url("#"), 32, 32, 1, true);
daabbcc.update_aabb(group, aabb, 0, 0, 16, 16);
daabbcc.update_gameobject_size(group, followed, 64, 64);

// @ts-expect-error the rebuild type is a number constant, not a string.
daabbcc.new_group("x");

const [hits, count] = daabbcc.query_aabb(group, 0, 0, 100, 100);
const _count: number = count;
// @ts-expect-error nothing overlapping returns nil, so the result must be narrowed first.
hits[0];
if (hits !== undefined) {
  const first = hits[0];
  if (typeof first === "number") {
    daabbcc.remove(group, first);
  } else if (first !== undefined) {
    const _id: number = first.id;
    const _bits: number = first.category_bits;
  }
}

const [sorted, sortedCount] = daabbcc.raycast_sort(group, 0, 0, 100, 100, undefined, true);
const _sortedCount: number = sortedCount;
if (sorted !== undefined) {
  for (const hit of sorted) {
    const _id: number = hit.id;
    const _bits: number = hit.category_bits;
    if ("distance" in hit) {
      const _distance: number = hit.distance;
    }
    if ("depth" in hit) {
      const _normal: number = hit.normal_x + hit.normal_y;
    }
  }
}

daabbcc.query_id(group, aabb, 0xffff, false, true);
daabbcc.query_aabb_sort(group, 0, 0, 10, 10);
daabbcc.query_id_sort(group, aabb);
daabbcc.raycast(group, 0, 0, 10, 10);

daabbcc.run(false);
daabbcc.update_frequency(30);
daabbcc.rebuild(group, true);
daabbcc.rebuild_all(false);
daabbcc.remove_group(group);
daabbcc.reset();

const _modes: number[] = [
  daabbcc.UPDATE_INCREMENTAL,
  daabbcc.UPDATE_FULLREBUILD,
  daabbcc.UPDATE_PARTIALREBUILD,
];
