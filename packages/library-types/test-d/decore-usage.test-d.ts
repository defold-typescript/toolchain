/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import type { entity, tiny_ecs, world } from "decore.decore";

// Compile-only proof (mirroring log-usage.test-d.ts) for decore's `ecs.world`.
// Two halves: an exact pin on the whole return type, which is what actually
// defends the emitted `LuaMultiReturn<[world, ...unknown[]]>` signature, and a
// destructuring block showing how a consumer spreads it. The destructure alone
// cannot defend the signature — `LuaMultiReturn<T>` is an intersection, not a
// tuple, so a rest binding never slices it and falls back to the union of every
// element; that makes the tail `unknown[]` under a fixed-arity shape too.
// No assertions execute; tsc --noEmit under tsconfig.dts-check.json
// (skipLibCheck: false) is the gate.

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

declare const ecs: tiny_ecs;
declare const someEntity: entity;

const multi = ecs.world();

// The signature pin: a real `world` head followed by a variable-length tail.
const _signature: Equal<typeof multi, LuaMultiReturn<[world, ...unknown[]]>> = true;

// Can-fail sentinel — arity: reds with TS2578 the moment the emitter regresses
// to the pre-fix fixed pair, the regression the destructure below cannot see.
// @ts-expect-error the tail is variadic, not a single anonymous slot
const _notFixedArity: Equal<typeof multi, LuaMultiReturn<[world, unknown]>> = true;

// Can-fail sentinel — element type: pins the tail element as `unknown` rather
// than any narrowed type.
// @ts-expect-error the tail element is unknown, not string
const _notNarrowedTail: Equal<typeof multi, LuaMultiReturn<[world, ...string[]]>> = true;

// Destructure ergonomics: the head keeps its real type, assignable to a `world`
// and accepted where `addEntity` demands one.
const [w, ...rest] = multi;

const _head: Equal<typeof w, world> = true;
const head: world = w;
const added: entity = ecs.addEntity(w, someEntity);

// The destructured tail is `unknown[]` — an ergonomics fact about the binding,
// not evidence about the declared arity.
const tail: unknown[] = rest;

// Can-fail negative: this reds with TS2578 (unused @ts-expect-error) if the tail
// ever leaks `any`, since `any` is assignable to `number`.
// @ts-expect-error the vararg tail is unknown, not number
const _first: number = rest[0];

void _signature;
void _notFixedArity;
void _notNarrowedTail;
void _head;
void head;
void added;
void tail;
void _first;
