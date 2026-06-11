import "@defold-typescript/types/script";

// The Lua stdlib rides the per-kind subpaths: a walled /script consumer sees
// math/os/string/table the same as the full entrypoint, while the wall holds.
math.randomseed(os.time());
const roll: number = math.random(1, 6);
const formatted: string = string.format("%d", 1);
void roll;
void formatted;

vmath.vector3(1, 2, 3);

// @ts-expect-error gui.* is absent on the script surface
gui.get_width();

// @ts-expect-error render.* is absent on the script surface
render.get_width();
