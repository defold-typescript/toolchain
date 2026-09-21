/// <reference path="../../index.d.ts" />

import type { SpawnWave } from "./wave";

// Invariant, non-distributive mutual assignability — a plain `A extends B`
// distributes over the union and would report `true` for a proper subset.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// The map is read off the handlers the receiver wrote; built-in ids are absent.
type M = ScriptMessages<typeof import("./wave").default>;
const _m: Exact<M, { spawn_wave: SpawnWave; wave_cleared: { wave: number } }> = true;
void _m;

const _gui: Exact<
  ScriptMessages<typeof import("./hud").default>,
  { show_score: { score: number } }
> = true;
void _gui;

const _render: Exact<
  ScriptMessages<typeof import("./frame").default>,
  { set_clear: { color: number } }
> = true;
void _render;

// A receiver-typed address checks the ids its receiver declared.
const wave = msg.url<M>("/logic#wave");
msg.post(wave, "spawn_wave", { count: 3 });
// @ts-expect-error spawn_wave's declared `count` is a number
msg.post(wave, "spawn_wave", { count: "3" });

// An id the receiver never declared still compiles against the open payload.
msg.post(wave, "not_declared_here", { anything: 1 });

// Built-in ids stay reachable, and their payloads stay checked.
msg.post(wave, "enable");
// @ts-expect-error apply_force requires `force` and `position`
msg.post(wave, "apply_force", {});

// The typed address is still a plain `Url` everywhere else.
void go.get_position(wave);
