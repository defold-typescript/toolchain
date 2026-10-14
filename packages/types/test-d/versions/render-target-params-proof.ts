export {};

// The authored `render.render_target` overloads are one file every surface
// shares, so they name the parameter table through `render.RenderTargetParams`,
// which each target generates from its own reference. A surface that ships
// without the alias fails here rather than breaking the overload file for the
// project that pinned it.

const _params: render.RenderTargetParams = {};
void _params;
