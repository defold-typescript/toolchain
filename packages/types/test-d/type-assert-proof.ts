import type { Equal } from "./type-assert";

const _same: Equal<number, number> = true;
const _unionOrder: Equal<1 | 2, 2 | 1> = true;
// biome-ignore lint/suspicious/noExplicitAny: `Equal` must tell `any` apart from every other type.
const _anyLeft: Equal<any, number> = false;
// biome-ignore lint/suspicious/noExplicitAny: `Equal` must tell `any` apart from every other type.
const _anyRight: Equal<number, any> = false;
const _neverUndefined: Equal<never, undefined> = false;
const _literal: Equal<string, "a"> = false;
