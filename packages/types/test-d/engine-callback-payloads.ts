/// <reference path="../index.d.ts" />

import type { Hash } from "../src/core-types";
import { defineRenderScript, defineScript } from "../src/lifecycle";

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

// render_script.cpp looks up only init, update, on_message and on_reload.
defineRenderScript({
  init() {
    return {};
  },
  update() {},
  on_message() {},
  on_reload() {},
});

// @ts-expect-error the engine never calls a render script's final
defineRenderScript({ final() {} });

// @ts-expect-error the engine never calls a render script's fixed_update
defineRenderScript({ fixed_update() {} });

// @ts-expect-error the engine never calls a render script's late_update
defineRenderScript({ late_update() {} });

// comp_script.cpp and gui.cpp set all twelve fields on every touch entry.
defineScript({
  on_input(_self, _action_id, action) {
    for (const touch of action.touch ?? []) {
      const id: number = touch.id;
      const tapCount: number = touch.tap_count;
      const pressed: boolean = touch.pressed;
      const released: boolean = touch.released;
      const x: number = touch.x;
      const y: number = touch.y;
      const screenX: number = touch.screen_x;
      const screenY: number = touch.screen_y;
      const dx: number = touch.dx;
      const dy: number = touch.dy;
      const screenDx: number = touch.screen_dx;
      const screenDy: number = touch.screen_dy;
      void [id, tapCount, pressed, released, x, y, screenX, screenY, dx, dy, screenDx, screenDy];
    }
  },
});

// script_model.cpp calls the completion callback with self, message id and message.
model.play_anim(
  "#model",
  "run",
  go.PLAYBACK_ONCE_FORWARD,
  undefined,
  (_self, message_id, message) => {
    const id: Hash = message_id;
    const animation: Hash = message.animation_id;
    void [id, animation];
  },
);

model.play_anim(
  "#model",
  "run",
  go.PLAYBACK_ONCE_FORWARD,
  undefined,
  // @ts-expect-error the engine passes no sender to the completion callback
  (_self: unknown, _message_id: Hash, _message: unknown, _sender: unknown) => {},
);

// Every final response carries the request url; a report_progress event adds bytes_sent.
http.request("http://example.com", "GET", (_self, _id, response) => {
  const url: string = response.url;
  const sent: number | undefined = response.bytes_sent;
  void [url, sent];
});

// comp_script.cpp delivers the response like a message, so the sender url follows it.
http.request("http://example.com", "GET", (_self, _id, _response, sender) => {
  const from: Url = sender;
  void from;
});

// script_window.cpp passes an empty table for every event but resize.
const event = null as unknown;
const data = null as unknown;
if (isWindowEvent(event, data, window.WINDOW_EVENT_FOCUS_LOST)) {
  const _empty: Equal<typeof data, Record<string, never>> = true;
  void _empty;
}
