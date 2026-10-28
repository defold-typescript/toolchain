/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as water from "water.water";

// Compile-only proof for the water fork, written as upstream's example script and bundled
// render script drive it. No assertions execute; tsc --noEmit under tsconfig.dts-check.json
// is the gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

export function init(): void {
  water.set_wave1(1.5, 0.5, 20, 3.5);
  water.init(
    msg.url("/camera"),
    msg.url("/camera#camera"),
    msg.url("/sun"),
    msg.url("/water"),
    0.1,
  );
  // @ts-expect-error `update` multiplies `dt` by `time_speed`, so it is required
  water.init(msg.url("/camera"), msg.url("/camera#camera"), msg.url("/sun"), msg.url("/water"));
}

export function update(dt: number): void {
  water.update_camera();
  water.update(dt);
  water.update_sun();
  water.pause(false);
}

export function getters(): void {
  const [direction, amplitude, wavelength, speed] = water.get_wave1();
  const _wave: Equal<
    [typeof direction, typeof amplitude, typeof wavelength, typeof speed],
    [number, number, number, number]
  > = true;
  void _wave;

  const [r, g, b] = water.get_shallow_color();
  const _color: Equal<[typeof r, typeof g, typeof b], [number, number, number]> = true;
  void _color;

  const exponent = water.get_sun_params();
  const _exponent: Equal<typeof exponent, number> = true;
  void _exponent;

  const enabled = water.is_sparkle_enabled();
  const _enabled: Equal<typeof enabled, boolean> = true;
  void _enabled;

  const cubemap = water.get_skybox_cubemap();
  const _cubemap: Equal<typeof cubemap, undefined> = true;
  void _cubemap;
}

export function setters(): void {
  water.set_sparkle_params(40, 0.3, 10000);
  water.set_sparkle_params(40, 0.3, 10000, 0);
  water.set_refraction_params(0.5);
  water.set_reflection_params(0.5);
  water.set_edge_foam_type(0);
  water.set_edge_foam_type(1);
  water.enable_sparkle();
  water.disable_sparkle();
  // @ts-expect-error the edge foam type is `0` (solid color) or `1` (textured)
  water.set_edge_foam_type(2);
  // @ts-expect-error `set_wave1` writes `speed` into the shader constant with no fallback
  water.set_wave1(1.5, 0.5, 20);
}

export function render_hooks(
  self: water.RenderScriptSelf,
  state: water.RenderState,
  predicates: water.Predicates,
  options: render.DrawOptions,
): void {
  water.render_init(self);
  water.render_update(self, state, predicates, options);

  const clear_buffers = new LuaMap<render.ClearBufferKey, number | Vector4>();
  clear_buffers.set(graphics.BUFFER_TYPE_COLOR0_BIT, vmath.vector4(0, 0, 0, 0));
  clear_buffers.set(graphics.BUFFER_TYPE_DEPTH_BIT, 1);
  water.render_update(
    self,
    { window_width: 960, window_height: 640, clear_buffers },
    { model: render.predicate(["model"]), water: render.predicate(["water"]) },
    {},
  );
  // @ts-expect-error `render_update` draws the `water` predicate `render_init` adds
  water.render_update(self, state, { model: render.predicate(["model"]) }, options);
}
