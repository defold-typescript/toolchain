/// <reference path="../../index.d.ts" />

import { defineScript } from "../../src/lifecycle";

// A script that posts to its own scene address from inside its handler: the
// address's value is this module's default export, so the handler body reads the
// type it is part of. It has to compile without a circularity error.
export default defineScript({
  on_message: onMessage({
    tick(_self, message: { n: number }) {
      msg.post("/logic#looper", "tick", { n: message.n + 1 });
    },
  }),
});
