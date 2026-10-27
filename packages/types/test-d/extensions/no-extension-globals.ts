// `resolve` writes each `.script_api` namespace as a module only, so a bare
// global use does not compile; the import is the one way in.

// @ts-expect-error the iap global is gone; import it.
iap.buy("my_iap", {});
// @ts-expect-error the iac global is gone; import it.
void iac;
// @ts-expect-error the push global is gone; import it.
void push;
// @ts-expect-error the webview global is gone; import it.
void webview;
