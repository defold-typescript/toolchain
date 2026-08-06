/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as bzAnim from "bzAnim.bzLibrary";

// Compile-only proof for the severed bzAnim surface, replacing the bzAnim block
// retired from library-types.test-d.ts when the `./bzAnim.bzLibrary` subpath went
// away. No assertions execute; `tsc --noEmit` under tsconfig.dts-check.json is
// the gate.

declare const _hash: Hash;

// The five calls the retired block carried.
const _bzInfoLevel: 1 = bzAnim.INFO_LEVEL;
const _bzAnimId: string = bzAnim.animate({ obj: _hash, easing: "TYPE_LINEAR" });
const _bzSeqId: string = bzAnim.animateSequence({ obj: undefined, easing: "TYPE_INQUAD" });
bzAnim.cancel(_bzAnimId);
const _bzReady: boolean = bzAnim.isReady();

// `EASING_TYPES` is declared at file scope, outside the module block, so it is an
// ambient global in any program that includes the golden — and this is the only
// place that resolution is defended, because the api-doc publishes no element for
// a string-literal union.
const _easing: EASING_TYPES = "TYPE_LINEAR";

// @ts-expect-error `TYPE_NOPE` is not one of the declared easings.
bzAnim.animate({ obj: _hash, easing: "TYPE_NOPE" });

// @ts-expect-error `obj` is required — its type admits `undefined`, but the key
// itself must still be written.
bzAnim.animate({ easing: "TYPE_LINEAR" });

void _bzInfoLevel;
void _bzSeqId;
void _bzReady;
void _easing;
