/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as sentinel from "sentinel.sentry";

// Compile-only proof for the hand-authored sentinel surface. No assertions
// execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate. Upstream
// ships plain Lua with LDoc prose only, so this is where the declared shapes are
// held to being callable as written.

// `dsn` is the one field `init` asserts. A crash callback's first return value is
// concatenated into a log line, so returning the message keeps that line from raising.
sentinel.init({
  dsn: "https://key@o0.ingest.sentry.io/0",
  on_hard_crash: (info) => info.message,
  tags: { build: 12 },
});

// @ts-expect-error `config.dsn` is required; `init` asserts it is a string.
sentinel.init({});

sentinel.init({
  dsn: "https://key@o0.ingest.sentry.io/0",
  // @ts-expect-error a callback returning nothing makes the log line after it raise.
  on_hard_crash: () => {},
});

// Values are `tostring`ed when an event is built, so scalars of any kind are kept.
sentinel.set_tag("level", 3);
sentinel.set_extra("checkpoint", "boss_room");
sentinel.add_breadcrumb({ category: "log", message: "entered the boss room" });

sentinel.capture_message({
  message: "x",
  level: "warning",
  callback: (id, err) => {
    const _recorded: string = id ?? err ?? "";
    void _recorded;
  },
});

sentinel.capture_message({
  message: "x",
  // @ts-expect-error `level` is one of Sentry's five severities.
  level: "critical",
});

sentinel.capture_exception({ message: "boom", traceback: debug.traceback() });
