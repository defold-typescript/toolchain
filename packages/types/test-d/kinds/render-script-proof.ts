export {};

vmath.vector3(1, 2, 3);
const _w: number = render.get_width();
void _w;

// Both hand-authored arities reach the one kind the namespace is restricted to.
// Feeding each result to `set_render_target` pins the branded handle type
// without importing `Opaque` past the kind surface under test.
render.set_render_target(render.render_target({}));
render.set_render_target(render.render_target("rt", {}));

// @ts-expect-error gui.* is absent on the render-script surface
gui.get_width();
