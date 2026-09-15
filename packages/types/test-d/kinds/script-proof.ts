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

// Extensions are typed only through `resolve`: none is declared on this surface.
// @ts-expect-error iap is not ambient until extension-iap is resolved
iap.finish({});
// @ts-expect-error iac is not ambient until extension-iac is resolved
iac.set_listener({}, 1);
// @ts-expect-error push is not ambient until extension-push is resolved
push.register([], () => {});
// @ts-expect-error webview is not ambient until extension-webview is resolved
webview.create(() => {});
