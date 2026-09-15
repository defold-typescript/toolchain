export {};

vmath.vector3(1, 2, 3);
const _w: number = gui.get_width();
void _w;

// @ts-expect-error render.* is absent on the gui-script surface
render.get_width();

// Extensions are typed only through `resolve`: none is declared on this surface.
// @ts-expect-error iap is not ambient until extension-iap is resolved
iap.finish({});
// @ts-expect-error iac is not ambient until extension-iac is resolved
iac.set_listener({}, 1);
// @ts-expect-error push is not ambient until extension-push is resolved
push.register([], () => {});
// @ts-expect-error webview is not ambient until extension-webview is resolved
webview.create(() => {});
