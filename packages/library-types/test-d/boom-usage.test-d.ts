/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as boom from "boom.boom";

// Compile-only proof (mirroring event-usage.test-d.ts) that the forked boom
// golden keeps both halves of its split surface: the one-function
// `declare module 'boom.boom'` export and the ~82 ambient globals, component
// interfaces, and generics that live outside it. This replaces the boom block
// retired from library-types.test-d.ts when the `./boom.boom` subpath went away.
// No assertions execute; `tsc --noEmit` under tsconfig.dts-check.json
// (skipLibCheck: false) is the gate.

boom.boom(() => {});

const object = add(["player"]);
const vector = vec2(1, 2);
const roll: number = rand();
const red = RED;

// The core-type rename is load-bearing: `id` reads as this repo's global `Hash`,
// not ts-defold's lowercase `hash` (a function global here). Losing the
// component interface would collapse this to `any` and stop compiling.
const objectId: Hash = object.id;
const tagged = object.c("player");
const taggedUrl: Url | undefined = tagged.__url;

void object;
void vector;
void roll;
void red;
void objectId;
void taggedUrl;
