export {};

vmath.vector3(1, 2, 3);
const _w: number = gui.get_width();
void _w;

// @ts-expect-error render.* is absent on the gui-script surface
render.get_width();

// The hand-authored `render` augmentation is restricted the same as the
// generated namespace: an augmentation must not re-open a wall the kind closes.
// @ts-expect-error render.* is absent on the gui-script surface
render.render_target({});
