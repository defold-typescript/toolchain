/** @noSelfInFile **/

/**
 * @see {@link https://github.com/indiesoftby/defold-sentinel|Github Source}
 * @noResolution
 * @example `import * as sentinel from 'sentinel.sentry'`
 */
declare module 'sentinel.sentry' {
  /**
   * Tag or extra values. They pass through `tostring` when an event is built, and an
   * empty result is dropped.
   */
  export type Fields = { [key: string]: string | number | boolean };

  /**
   * What a crash callback receives: the same table Sentinel passes to
   * `capture_exception`.
   */
  export interface CrashInfo {
    /** `"lua"` or `"js"` for a soft crash, `"crash"` for a hard one. */
    source: string;
    /** The error message. On a hard crash, the JSON-encoded crash dump extra data. */
    message: string;
    /** The traceback. On a hard crash, the JSON-encoded crash dump backtrace. */
    traceback: string;
    /** `true` on a hard crash, absent on a soft one. */
    fatal?: boolean;
  }

  export interface Config {
    /**
     * Where events are sent. `init` asserts it is a string that parses as
     * `{PROTOCOL}://{PUBLIC_KEY}@{HOST}/{PATH}{PROJECT_ID}`.
     */
    dsn: string;
    /** Print what Sentinel sends. Defaults to `false`. */
    debug?: boolean;
    /** Build events without sending them; each callback receives the id `"(dry run)"`. Defaults to `false`. */
    dry_run?: boolean;
    /**
     * Also report each captured exception to GameAnalytics when that extension is
     * present. Every exception then needs a `traceback`, or `capture_exception` raises.
     * Defaults to `false`.
     */
    gameanalytics?: boolean;
    /** HTTP request timeout in seconds. Defaults to `30`. */
    send_timeout?: number;
    /**
     * Install a Lua error handler that captures every uncaught error. It takes the
     * single `sys.set_error_handler` slot, replacing any handler set before `init`.
     * Defaults to `true`.
     */
    set_error_handler?: boolean;
    /** Submit the crash dump a previous session left, from inside `init`. Defaults to `true`. */
    load_previous_crash?: boolean;
    /** The release id sent with every event. */
    release?: string;
    /** The distribution, to tell builds or deployment variants of one release apart. */
    dist?: string;
    /** A freeform environment name, e.g. `"staging"` or `"prod"`. */
    environment?: string;
    /** Tags sent with every event. */
    tags?: Fields;
    /** Extra data sent with every event. */
    extra?: Fields;
    /**
     * User information sent with every event. The table is JSON-encoded and sent as
     * given, nested tables included.
     */
    user?: Record<string | number, unknown>;
    /**
     * Called after an uncaught error is captured; only installed with
     * `set_error_handler`. The first return value is concatenated into a log line, so
     * returning nothing raises inside the error handler.
     */
    on_soft_crash?: (info: CrashInfo) => string | number;
    /**
     * Called from `init` after a previous session's crash dump is captured. The first
     * return value is concatenated into a log line, so returning nothing raises out of
     * `init`.
     */
    on_hard_crash?: (info: CrashInfo) => string | number;
  }

  export interface Breadcrumb {
    category: string;
    message: string;
  }

  export interface ExceptionInfo {
    /** Sent as the exception type. */
    message: string;
    /** Sent as the exception value. Required when `config.gameanalytics` is on and the extension is present. */
    traceback?: string;
    /** Sent as the `source` tag. */
    source?: string;
    /** Sends the event at level `"fatal"` instead of `"error"`. */
    fatal?: boolean;
    /** Tags for this event, merged over the global ones. */
    tags?: Fields;
    /** Extra data for this event, merged over the global ones. */
    extra?: Fields;
    /**
     * Receives the event id on success, or the error when the request fails or the
     * event is throttled.
     */
    callback?: (id: string | undefined, err: string | undefined) => void;
  }

  export interface MessageInfo {
    message: string;
    /** Defaults to `"info"`. */
    level?: "fatal" | "error" | "warning" | "info" | "debug";
    /** Tags for this event, merged over the global ones. */
    tags?: Fields;
    /** Extra data for this event, merged over the global ones. */
    extra?: Fields;
    /**
     * Receives the event id on success, or the error when the request fails or the
     * event is throttled.
     */
    callback?: (id: string | undefined, err: string | undefined) => void;
  }

  /**
   * Starts the client. Call it as early as possible. Sentinel keeps the table it is
   * given, filling in defaults and its `tags` and `extra`; `set_tag` and `set_extra`
   * write into it.
   */
  export function init(config: Config): void;

  /**
   * Records something that happened, sent with every later event. Sentinel adds a
   * `timestamp` to the table and keeps the last 10. Does nothing before `init`.
   */
  export function add_breadcrumb(breadcrumb: Breadcrumb): void;

  /** Sets a tag sent with every later event. Does nothing before `init`. */
  export function set_tag(key: string, value: string | number | boolean): void;

  /** Sets extra data sent with every later event. Does nothing before `init`. */
  export function set_extra(key: string, value: string | number | boolean): void;

  /**
   * Sends an error to Sentry. With `config.set_error_handler` on, every uncaught error
   * is already sent through this. Raises before `init`. At most 10 events are sent per
   * 300 seconds; a throttled event goes to `callback` as an error.
   */
  export function capture_exception(err: ExceptionInfo): void;

  /**
   * Sends a message to Sentry. Raises before `init`. At most 10 events are sent per
   * 300 seconds; a throttled event goes to `callback` as an error.
   */
  export function capture_message(msg: MessageInfo): void;
}
