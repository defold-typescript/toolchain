/// <reference path="../index.d.ts" />

// `window.set_listener` delivers `event` and `data` as two separate params, so
// TS can't auto-correlate an `event === WINDOW_EVENT_RESIZED` check with `data`.
// `isWindowEvent` re-introduces the discriminant at the use site, narrowing the
// untyped payload — the window mirror of `isMessage`.
const event = null as unknown;
const data = null as unknown;

if (isWindowEvent(event, data, window.WINDOW_EVENT_RESIZED)) {
  // Narrowed to the resize payload — no cast.
  const _width: number = data.width;
  const _height: number = data.height;
  void _width;
  void _height;

  // @ts-expect-error resize data carries width/height only
  void data.depth;
}

if (isWindowEvent(event, data, window.WINDOW_EVENT_FOCUS_LOST)) {
  // @ts-expect-error focus events carry no data (narrowed to undefined)
  void data.width;
}

// @ts-expect-error DIMMING_ON is not a window event constant
void isWindowEvent(event, data, window.DIMMING_ON);

// The engine registers the deprecated `WINDOW_EVENT_ICONFIED` with the value of
// `WINDOW_EVENT_ICONIFIED`, so a listener compares and guards with either spelling.
window.set_listener((_self, received, payload) => {
  if (received === window.WINDOW_EVENT_ICONIFIED || received === window.WINDOW_EVENT_ICONFIED) {
    return;
  }
  if (isWindowEvent(received, payload, window.WINDOW_EVENT_ICONIFIED)) {
    const _none: undefined = payload;
    void _none;
  }
});
