/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import type { entity, tiny_ecs, world } from "decore.decore";

// Compile-only proof (mirroring log-usage.test-d.ts) that decore's `ecs.world`
// returns a real `world` followed by a variable number of further values, so it
// destructures as a typed head plus an `unknown[]` tail rather than a fixed pair.
// No assertions execute; tsc --noEmit under tsconfig.dts-check.json
// (skipLibCheck: false) is the gate.

declare const ecs: tiny_ecs;
declare const someEntity: entity;

const [w, ...rest] = ecs.world();

// The head keeps its real type: assignable to a `world` and accepted where
// `addEntity` demands one.
const head: world = w;
const added: entity = ecs.addEntity(w, someEntity);

// The tail is `unknown[]`, not a single anonymous slot.
const tail: unknown[] = rest;

// Can-fail negative: this reds with TS2578 (unused @ts-expect-error) the moment
// the tail stops being `unknown`, so the proof above cannot silently rot.
// @ts-expect-error the vararg tail is unknown, not number
const _first: number = rest[0];

void head;
void added;
void tail;
void _first;
