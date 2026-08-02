/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as log from "log.log";

// Compile-only proof (mirroring lang-usage.test-d.ts) that the log LuaLS golden
// ships only the public logger surface: get_logger yields a value whose name/level
// are string and whose trace/debug/info/warn/error are callable, while the @field
// private (_last_gc_memory/_last_message_time) and @local (format/log) members are
// absent. No assertions execute; tsc --noEmit under tsconfig.dts-check.json
// (skipLibCheck: false) is the gate. A non-public member reappearing on the public
// surface turns its @ts-expect-error unused (TS2578), which the
// dts-declaration-validity offender filter catches.

const logger = log.get_logger("game");

const name: string = logger.name;
const level: string = logger.level;
const trace: (message: string, data: unknown) => void = logger.trace;
// Not named `debug`: that would shadow the ambient `debug` namespace the
// get_default_logger_name proof below calls into.
const debugMethod: (message: string, data: unknown) => void = logger.debug;
const info: (message: string, data: unknown) => void = logger.info;
const warn: (message: string, data: unknown) => void = logger.warn;
const error: (message: string, data: unknown) => void = logger.error;

// @ts-expect-error _last_gc_memory is @field private, absent from the public surface
void logger._last_gc_memory;
// @ts-expect-error _last_message_time is @field private, absent from the public surface
void logger._last_message_time;
// @ts-expect-error format is @local, absent from the public surface
void logger.format;
// @ts-expect-error log is @local, absent from the public surface
void logger.log;

// get_default_logger_name takes the real `debug.getinfo()` table, so a caller can
// read `short_src` off it and hand the same table straight back.
const frame = debug.getinfo(1);
if (frame) {
  const src: string = frame.short_src;
  const loggerName: string = log.get_default_logger_name(frame);
  void src;
  void loggerName;
}

void name;
void level;
void trace;
void debugMethod;
void info;
void warn;
void error;
