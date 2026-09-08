/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as log from "log.log";

// Compile-only proof (mirroring lang-usage.test-d.ts) that the log LuaLS golden
// ships the public logger surface and nothing more: get_logger yields a value
// whose name/level are string and whose trace/debug/info/warn/error are
// callable, while the @local (format/log) members stay absent. No assertions
// execute; tsc --noEmit under tsconfig.dts-check.json (skipLibCheck: false) is
// the gate. A non-public member reappearing on the public surface turns its
// expect-error directive unused (TS2578), which the dts-declaration-validity
// offender filter catches.

const logger = log.get_logger("game");

const name: string = logger.name;
const level: string = logger.level;
const trace: (message: string | undefined, data: unknown) => void = logger.trace;
// Not named `debug`: that would shadow the ambient `debug` namespace.
const debugMethod: (message: string | undefined, data: unknown) => void = logger.debug;
const info: (message: string | undefined, data: unknown) => void = logger.info;
const warn: (message: string | undefined, data: unknown) => void = logger.warn;
const error: (message: string | undefined, data: unknown) => void = logger.error;

// Upstream dropped the `@field private` marker on both at tag 7, so they are
// part of the declared surface now and read as optional numbers.
const lastGcMemory: number | undefined = logger._last_gc_memory;
const lastMessageTime: number | undefined = logger._last_message_time;

// @ts-expect-error format is @local, absent from the public surface
void logger.format;
// @ts-expect-error log is @local, absent from the public surface
void logger.log;

// The per-logger file sink, and the module-wide file API that arrived with it.
const nearby: string | undefined = logger.set_file_nearby();
const setFile: string | undefined = log.set_file("/logs/game.log");
const getFile: string | undefined = log.get_file();
log.clear_log_files();
log.final();

// Custom handlers: add_callback pins the five-argument shape upstream invokes.
log.add_callback((handled, handledLevel, message, context, logMessage) => {
  void handled.name;
  void handledLevel;
  void message;
  void context;
  void logMessage;
});
log.clear_callbacks();

void name;
void level;
void trace;
void debugMethod;
void info;
void warn;
void error;
void lastGcMemory;
void lastMessageTime;
void nearby;
void setFile;
void getFile;
