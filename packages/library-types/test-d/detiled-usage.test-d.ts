/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as detiled from "detiled.detiled";

// Compile-only proof that the detiled LuaLS golden is callable with the types
// upstream documents. No assertions execute; tsc --noEmit under
// tsconfig.dts-check.json (skipLibCheck: false) is the gate.

// `parse` returns the layers and the map params as two values.
const [layers, params] = detiled.parse("/maps/level.json");

if (params !== undefined) {
  // Reds if `parse`'s second return degrades to `unknown`.
  const tileWidth: number = params.tile.width;
  const [x, y] = detiled.cell_to_pos(1, 1, params);
  const posX: number = x;
  const posY: number = y;
  void tileWidth;
  void posX;
  void posY;
}

void layers;
