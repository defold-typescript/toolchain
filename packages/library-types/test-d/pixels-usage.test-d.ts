/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

// Compile-only proof for the curated defold-pixels native-extension namespace. No
// assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is the gate.

const info: pixels.BufferInfo = {
  buffer: buffer.create(4, [{ name: hash("rgba"), type: buffer.VALUE_TYPE_UINT8, count: 4 }]),
  width: 2,
  height: 2,
  channels: 4,
};

pixels.line(info, 0, 0, 10, 10, 255, 0, 0, 255);
pixels.line(info, 0, 0, 10, 10, 255, 0, 0, 255, true, 2);
pixels.pixel(info, 1, 1, 255, 0, 0);

const [r, g, b] = pixels.color(info, 1, 1);
if (r !== undefined && g !== undefined && b !== undefined) {
  const _sum: number = r + g + b;
}

pixels.polyline(info, [0, 0, 10, 10], {
  widths: [2, 8],
  alphas: [0, 1],
  color: [255, 0, 0],
  join: "miter",
  miter_limit: 4,
});
pixels.polyline(info, [0, 0, 10, 10], {
  width: 2,
  color: [255, 0, 0, 128],
  edge_color: [0, 0, 0],
  clip: [0, 0, 8, 8],
});

pixels.copy_pixels(info, info, 0, 0, 1, 1, 1, 1, true);

// @ts-expect-error the extension accepts only "bevel" and "miter" joins.
pixels.polyline(info, [0, 0, 10, 10], { width: 2, color: [255, 0, 0], join: "round" });
// @ts-expect-error a color is three or four channels.
pixels.polyline(info, [0, 0, 10, 10], { width: 2, color: [255, 0] });
// @ts-expect-error `color` is required.
pixels.polyline(info, [0, 0, 10, 10], { width: 2 });
// @ts-expect-error a stroke needs `width` or `widths`.
pixels.polyline(info, [0, 0, 10, 10], { color: [255, 0, 0] });

const _twoChannels: pixels.BufferInfo = {
  buffer: info.buffer,
  width: 2,
  height: 2,
  // @ts-expect-error a buffer has 3 or 4 channels.
  channels: 2,
};

// @ts-expect-error `antialiasing` is a boolean.
pixels.line(info, 0, 0, 10, 10, 255, 0, 0, 255, {});

const [red] = pixels.color(info, 9, 9);
// @ts-expect-error a read outside the buffer returns nothing, so check before use.
const _unchecked: number = red;

export {};
