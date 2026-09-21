/// <reference path="../../index.d.ts" />

import { defineScript } from "../../src/lifecycle";

export type SpawnWave = { count: number; boss?: boolean };

// Annotating a handler's `message` declares a script-local id; the built-in
// handler beside it keeps its contextually typed payload.
export default defineScript({
  on_message: onMessage({
    spawn_wave(_self, _message: SpawnWave) {},
    wave_cleared(_self, _message: { wave: number }) {},
    contact_point_response(_self, message) {
      void message.other_group;
    },
  }),
});
