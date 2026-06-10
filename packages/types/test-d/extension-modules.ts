/// <reference path="../index.d.ts" />

// One shallow, high-signal call per extension namespace. Optional params emit
// as required (the established gotcha), so pass the required positional args;
// callbacks map to `unknown`, so pass a no-op arrow. Constants (iap.TRANS_STATE_*,
// push.PRIORITY_*, ...) are dropped by the generator, so they are not asserted.

iap.buy("my_iap", {});
const _restored: boolean = iap.restore();
void _restored;

iac.set_listener({}, 1);

push.register([], () => {});
const [_scheduleId, _scheduleErr] = push.schedule(10, "title", "alert", "payload", {});
void _scheduleId;
void _scheduleErr;

webview.create(() => {});

// @ts-expect-error iap.buy product id is a string, not a number
iap.buy(123, {});

// @ts-expect-error iap.restore returns boolean, not string
const _bad: string = iap.restore();
void _bad;
