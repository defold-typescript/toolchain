/// <reference path="../index.d.ts" />

// Where the reference types a callback's payload, the slot takes that struct:
// the documented fields read without a cast, and a field the engine never sends
// is a compile error.
collectionproxy.load("#proxy", undefined, (_self, _message_id, message, _sender) => {
  const _progress: number | undefined = message.progress;
  const _code: number | undefined = message.code;
  void _progress;
  void _code;

  // @ts-expect-error the load message carries progress and code only
  void message.nope;
});

window.set_listener((_self, event, data) => {
  // Only a resize fills the table, so the fields are optional outside the guard.
  const _width: number | undefined = data.width;
  void _width;

  if (isWindowEvent(event, data, window.WINDOW_EVENT_RESIZED)) {
    const _resizedWidth: number = data.width;
    const _resizedHeight: number = data.height;
    void _resizedWidth;
    void _resizedHeight;
  }

  // @ts-expect-error window data carries width and height only
  void data.depth;
});

const recordListener = (
  _self: unknown,
  _event: unknown,
  _data: Record<string | number, unknown>,
): void => {};
// @ts-expect-error the data payload is the reference's struct, not a bare record
window.set_listener(recordListener);
