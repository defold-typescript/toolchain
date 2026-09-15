export {};

vmath.vector3(1, 2, 3);
const _w: number = render.get_width();
void _w;

// @ts-expect-error gui.* is absent on the render-script surface
gui.get_width();
