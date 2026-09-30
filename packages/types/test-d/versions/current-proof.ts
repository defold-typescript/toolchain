export {};

label.set_text("score", "x");
const _t: string = label.get_text("score");
void _t;

sprite.set_vflip("sprite#s", true);
sprite.set_hflip("sprite#s", true);

type WindowListener = NonNullable<Parameters<typeof window.set_listener>[0]>;
window.set_listener((_self, event, data) => {
  if (isWindowEvent(event, data, window.WINDOW_EVENT_ICONIFIED)) {
    const _none: undefined = data;
    void _none;
  }
  isWindowEvent(event, data, window.WINDOW_EVENT_ICONFIED);
  // @ts-expect-error a non-window constant is not a window event
  isWindowEvent(event, data, physics.SHAPE_TYPE_SPHERE);
});
const _iconified: Parameters<WindowListener>[1] = window.WINDOW_EVENT_ICONIFIED;
void _iconified;
// @ts-expect-error a non-window constant is not a window event
const _sphere: Parameters<WindowListener>[1] = physics.SHAPE_TYPE_SPHERE;
void _sphere;
