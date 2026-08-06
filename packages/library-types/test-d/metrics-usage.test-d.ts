/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as fps from "metrics.fps";
import * as mem from "metrics.mem";

// metrics.* instances — each submodule declares its own `Metrics` interface, so
// the reading accessor stays scoped to the module that created the instance.
const _fpsMetrics = fps.create();
const _configuredFpsMetrics = fps.create(60, "%.1f", "top-left", "white");
const _fpsValue: number = _fpsMetrics.fps();
_fpsMetrics.update();
_fpsMetrics.draw();
const _memMetrics = mem.create();
const _configuredMemMetrics = mem.create("%dkb", "top-left", "white");
const _memValue: number = _memMetrics.mem();
_memMetrics.update();
_memMetrics.draw();

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
