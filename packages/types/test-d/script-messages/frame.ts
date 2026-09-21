/// <reference path="../../index.d.ts" />

import { defineRenderScript } from "../../src/lifecycle";

export default defineRenderScript({
  on_message: onMessage({
    set_clear(_self, _message: { color: number }) {},
  }),
});
