// `resolve` keeps each namespace's ambient form beside its module for one
// release: a bare call still compiles, and the global carries exactly the
// module's members.

iap.buy("my_iap", {});
const _bareRestored: boolean = iap.restore();
void _bareRestored;

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

const _iacSame: Same<typeof import("iac"), typeof iac> = true;
const _iapSame: Same<typeof import("iap"), typeof iap> = true;
const _pushSame: Same<typeof import("push"), typeof push> = true;
const _webviewSame: Same<typeof import("webview"), typeof webview> = true;
void [_iacSame, _iapSame, _pushSame, _webviewSame];
