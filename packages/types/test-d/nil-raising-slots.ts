/// <reference path="../index.d.ts" />
import type { Hash, Opaque, Vector } from "../src/core-types";

// Each slot below may be omitted, but its binding checks it whenever the
// argument is present, so an explicit nil raises. The declarations take the
// call without the slot or with a value, never a possibly-undefined one.

declare const node: Opaque<"node">;
declare const curve: Vector;
declare const maybeNumber: number | undefined;
declare const maybeFlag: boolean | undefined;

// gui.animate `delay` (gui_script.cpp:1548-1563)
gui.animate(node, "position.y", 100, gui.EASING_LINEAR, 1);
gui.animate(node, "position.y", 100, gui.EASING_LINEAR, 1, 0.5);
// @ts-expect-error a possibly-undefined delay raises when it is nil
gui.animate(node, "position.y", 100, gui.EASING_LINEAR, 1, maybeNumber);
// A nil complete_function is read as absent, so a later playback still compiles.
gui.animate(node, "position.y", 100, curve, 4.0, 0, undefined, gui.PLAYBACK_LOOP_PINGPONG);

// gui.new_texture and gui.set_texture_data `flip` (:2276-2279, :2406-2408)
gui.new_texture("tex", 1, 1, image.TYPE_RGBA, "buf");
gui.new_texture("tex", 1, 1, image.TYPE_RGBA, "buf", true);
// @ts-expect-error a possibly-undefined flip raises when it is nil
gui.new_texture("tex", 1, 1, image.TYPE_RGBA, "buf", maybeFlag);
gui.set_texture_data("tex", 1, 1, image.TYPE_RGBA, "buf");
gui.set_texture_data("tex", 1, 1, image.TYPE_RGBA, "buf", true);
// @ts-expect-error a possibly-undefined flip raises when it is nil
gui.set_texture_data("tex", 1, 1, image.TYPE_RGBA, "buf", maybeFlag);

// gui.play_flipbook `play_properties` (:2120-2122)
declare const playProperties: gui.PlayProperties;
declare const maybePlayProperties: gui.PlayProperties | undefined;
gui.play_flipbook(node, "anim");
gui.play_flipbook(node, "anim", undefined, playProperties);
// @ts-expect-error possibly-undefined play properties raise when they are nil
gui.play_flipbook(node, "anim", undefined, maybePlayProperties);
gui.play_flipbook(node, "anim", undefined, { offset: 0.5 });

// gui.stop_particlefx `options` (:4813-4814)
declare const stopOptions: particlefx.StopOptions;
declare const maybeStopOptions: particlefx.StopOptions | undefined;
gui.stop_particlefx(node);
gui.stop_particlefx(node, stopOptions);
// @ts-expect-error possibly-undefined options raise when they are nil
gui.stop_particlefx(node, maybeStopOptions);

// render.draw argument 2 (render_script.cpp:1931-1934)
declare const predicate: Opaque<"render_predicate">;
declare const drawOptions: render.DrawOptions;
declare const maybeDrawOptions: render.DrawOptions | undefined;
render.draw(predicate);
render.draw(predicate, drawOptions);
// @ts-expect-error possibly-undefined options raise when they are nil
render.draw(predicate, maybeDrawOptions);

// render.set_render_target argument 2 (:1440-1442); a nil target is the default.
declare const target: Opaque<"render_target">;
declare const targetOptions: render.SetRenderTargetOptions;
declare const maybeTargetOptions: render.SetRenderTargetOptions | undefined;
render.set_render_target(target);
render.set_render_target(target, targetOptions);
// @ts-expect-error possibly-undefined options raise when they are nil
render.set_render_target(target, maybeTargetOptions);
render.set_render_target(undefined, targetOptions);

// resource.get_text_metrics argument 3 (script_resource.cpp:3395-3398)
declare const font: Hash;
declare const metricsOptions: resource.TextMetricsOptions;
declare const maybeMetricsOptions: resource.TextMetricsOptions | undefined;
resource.get_text_metrics(font, "text");
resource.get_text_metrics(font, "text", metricsOptions);
// @ts-expect-error possibly-undefined options raise when they are nil
resource.get_text_metrics(font, "text", maybeMetricsOptions);
