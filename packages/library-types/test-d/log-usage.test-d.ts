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
const debug: (message: string, data: unknown) => void = logger.debug;
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

void name;
void level;
void trace;
void debug;
void info;
void warn;
void error;
