/// <reference path="../../index.d.ts" />

import { defineGuiScript } from "../../src/lifecycle";

export default defineGuiScript({
  on_message: onMessage({
    show_score(_self, _message: { score: number }) {},
  }),
});
