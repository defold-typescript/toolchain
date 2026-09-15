export {};

// Extensions are typed only through `resolve`: none is declared on this surface.
// Each directive guards the bare identifier, not a member call — a member call
// is satisfied by the property error a partially declared namespace raises, so
// it would keep the directive used and let the namespace through.
// @ts-expect-error iap is not ambient until extension-iap is resolved
void iap;
// @ts-expect-error iac is not ambient until extension-iac is resolved
void iac;
// @ts-expect-error push is not ambient until extension-push is resolved
void push;
// @ts-expect-error webview is not ambient until extension-webview is resolved
void webview;
