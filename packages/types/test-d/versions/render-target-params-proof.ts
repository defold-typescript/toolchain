export {};

// The authored `render.render_target` overloads are one file every surface
// shares, so they name the parameter table through `render.RenderTargetParams`:
// the reference's own struct where it declares one, and an alias of the slot's
// type, generated from that surface's reference, where it does not. A surface
// that ships without the name fails here rather than breaking the overload file
// for the project that pinned it.

const _params: render.RenderTargetParams = {};
void _params;

// Both shared overloads take the name, so a table typed with it passes either
// arity on every surface, whatever shape that surface gives it.
declare const params: render.RenderTargetParams;
render.render_target(params);
render.render_target("rt", params);

// The surfaces compile with `skipLibCheck`, so an overload naming a type this
// surface lacks degrades to `any` and every call above still passes. A number
// is no parameter table on any surface, so these red unless both arities
// resolve a real type here.
// @ts-expect-error a number is not a parameter table
render.render_target(42);
// @ts-expect-error a number is not a parameter table in the named arity either
render.render_target("rt", 42);

// The slot has one name on every surface.
// @ts-expect-error render.render_target_params is not a declared type
const _oldName: render.render_target_params = {};
void _oldName;
