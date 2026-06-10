/// <reference path="../index.d.ts" />

// push.register's `notifications` is a prose-only `table (array) of
// push.NOTIFICATION_*` shape the field parser cannot read; the fixture carries no
// NOTIFICATION_* brand, so its element type is the honest `number` token curated
// in HOMOGENEOUS_ARRAY_SLOTS and emitted as `number[]`.

// push.register accepts a number[] of NOTIFICATION_* bitmask constants.
push.register([1, 2, 4], () => {});

// @ts-expect-error notifications is a number[], not a string[]
push.register(["alert"], () => {});
