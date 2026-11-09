/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as fps from "metrics.fps";
import * as mem from "metrics.mem";

// metrics.* instances — each submodule declares its own `Metrics` interface, so
// the reading accessor stays scoped to the module that created the instance.
// `create` is passed each module's own defaults, which is what upstream falls back
// to for an omitted argument, so the drawing pair resolves as `Vector3`/`Vector4`
// rather than as the `string` the fork used to declare.
const _fpsMetrics = fps.create();
const _configuredFpsMetrics = fps.create(60, "%.1f", fps.POSITION, fps.COLOR);
const _fpsValue: number = _fpsMetrics.fps();
_fpsMetrics.update();
_fpsMetrics.draw();
const _memMetrics = mem.create();
const _configuredMemMetrics = mem.create("%dkb", mem.POSITION, mem.COLOR);
const _memValue: number = _memMetrics.mem();
_memMetrics.update();
_memMetrics.draw();

const _fpsPosition: Vector3 = fps.POSITION;
const _fpsColor: Vector4 = fps.COLOR;
const _fpsFormat: string = fps.FORMAT;
const _memPosition: Vector3 = mem.POSITION;
const _memColor: Vector4 = mem.COLOR;
const _memFormat: string = mem.FORMAT;

// The module-level singleton upstream creates at load — callable with no
// receiver and no instance, and scoped to its own module exactly as the
// instance surface is.
const _fpsSingletonValue: number = fps.fps();
fps.update();
fps.draw();
const _memSingletonValue: number = mem.mem();
mem.update();
mem.draw();

// @ts-expect-error the fps module exposes no memory reading
fps.mem();
// @ts-expect-error the mem module exposes no fps reading
mem.fps();

void _configuredFpsMetrics;
void _fpsValue;
void _configuredMemMetrics;
void _memValue;
void _fpsSingletonValue;
void _memSingletonValue;
void _fpsPosition;
void _fpsColor;
void _fpsFormat;
void _memPosition;
void _memColor;
void _memFormat;
