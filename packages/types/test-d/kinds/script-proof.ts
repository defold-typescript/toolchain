export {};

vmath.vector3(1, 2, 3);

// @ts-expect-error gui.* is absent on the script surface
gui.get_width();

// @ts-expect-error render.* is absent on the script surface
render.get_width();

// The editor VM libraries must not reach a runtime kind. `http`, `json`, `zlib`
// and `pprint` are runtime surfaces in their own right, so the wall is checked
// on the two the engine has no form of: `zip`, and the `tiles` sub-namespace of
// the runtime `tilemap`.
// @ts-expect-error zip.* is an editor VM library, absent on the script surface
zip.pack("a.zip", undefined, "b");
// @ts-expect-error tilemap.tiles.* is an editor VM library, absent on the script surface
tilemap.tiles.new();
