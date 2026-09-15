export {};

vmath.vector3(1, 2, 3);
const _w: number = gui.get_width();
void _w;

// @ts-expect-error render.* is absent on the gui-script surface
render.get_width();
