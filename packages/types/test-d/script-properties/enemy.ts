/// <reference path="../../index.d.ts" />

import { defineScript } from "../../src/lifecycle";

export default defineScript({
  properties: { speed: 1, target: vmath.vector3(), tag: hash("a"), alive: true },
});
