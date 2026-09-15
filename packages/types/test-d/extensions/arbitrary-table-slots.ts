// The platform/OS-sourced opaque blobs are arbitrary lua tables: their layout is
// set by the host OS or the invoking app, not by Defold, so the faithful type is
// an arbitrary record that must be narrowed/cast before a concrete field is read.
const arbTableScheduled = push.get_scheduled(0);
// @ts-expect-error a scheduled-notification value is `unknown`, not a string
const _arbTableScheduledBad: string = push.get_scheduled(0).payload;
const arbTableScheduledOk: string = push.get_scheduled(0).payload as string;
void arbTableScheduled;
void arbTableScheduledOk;

// set_listener accepts an arbitrary inter-app payload table.
iac.set_listener({ url: "app://open", extra: 1 }, 0);
