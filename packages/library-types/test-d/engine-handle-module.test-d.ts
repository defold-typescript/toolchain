/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import { enginehandle } from "test.enginehandle";

// Compile-only proof that a handle-referencing `declare module` — the shape
// `wrapAsModule` emits — stays importable and brand-checks. The fixture
// references `Hash`/`Vector3` as ambient globals with no top-level import, so it
// remains a script and `declare module 'test.enginehandle'` is an importable
// ambient module rather than an augmentation of an unresolvable specifier. A
// regression that re-adds a top-level import to `wrapAsModule` reproduces here
// as `TS2307` at the import below. `tsc --noEmit` under dts-check is the gate;
// no assertions execute.

const h: Hash = enginehandle.make();
const v: Vector3 = enginehandle.locate();

void h;
void v;
