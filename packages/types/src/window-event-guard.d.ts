/** @noSelfInFile */

// `window.set_listener` hands the callback `event` and `data` as two *separate*
// params, and the `WINDOW_EVENT_*` constants are branded numbers — so TS can
// neither correlate the two params nor use a branded number as a discriminant.
// This guard re-introduces the discriminant at the use site, narrowing the
// untyped `data` payload (only `WINDOW_EVENT_RESIZED` carries fields). It mirrors
// `isMessage` for `on_message`; the transpiler lowers the call to a bare
// `event == window.WINDOW_EVENT_*` (window-event-guard-lowering.ts), so this
// package emits no runtime Lua.
type WindowEventKind =
  | typeof window.WINDOW_EVENT_FOCUS_LOST
  | typeof window.WINDOW_EVENT_FOCUS_GAINED
  | typeof window.WINDOW_EVENT_RESIZED
  | typeof window.WINDOW_EVENT_ICONFIED
  | typeof window.WINDOW_EVENT_DEICONIFIED;

type WindowEventData<K extends WindowEventKind> = K extends typeof window.WINDOW_EVENT_RESIZED
  ? { width: number; height: number }
  : undefined;

declare global {
  /**
   * Type guard for a `window.set_listener` callback: narrows the untyped `data`
   * payload to its event-specific shape when `event` matches a known
   * `WINDOW_EVENT_*` constant. The engine hands `event` and `data` as separate
   * params and the constants are branded numbers, so TS cannot auto-narrow `data`
   * from an `event === window.WINDOW_EVENT_RESIZED` check — this guard
   * re-introduces the discriminant. Only `WINDOW_EVENT_RESIZED` carries fields
   * (`{ width, height }`); every other event narrows `data` to `undefined`.
   *
   * @param event - the event constant the callback received.
   * @param data - the untyped data payload the callback received.
   * @param expected - the window event constant to test against (e.g. `window.WINDOW_EVENT_RESIZED`).
   * @returns `true` when `event` matches `expected`, narrowing `data` to that event's payload.
   * @example
   * ```ts
   * window.set_listener((self, event, data) => {
   *   if (isWindowEvent(event, data, window.WINDOW_EVENT_RESIZED)) {
   *     print("resized:", data.width, data.height);
   *   }
   * });
   * ```
   */
  function isWindowEvent<K extends WindowEventKind>(
    event: unknown,
    data: unknown,
    expected: K,
  ): data is WindowEventData<K>;
}

export {};
