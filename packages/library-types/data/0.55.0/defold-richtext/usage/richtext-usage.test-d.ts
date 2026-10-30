/// <reference types="@typescript-to-lua/language-extensions" />
/// <reference types="@defold-typescript/types" />

import * as richtextColor from "richtext.color";
import * as richtext from "richtext.richtext";
import * as richtextTags from "richtext.tags";

// richtext.color — every named colour is a `Vector4` (upstream `vmath.vector4`),
// so resolution proves the 22 core-type renames landed on the exported constant
// table rather than on a shape the consumer never sees.
const _richRed: Vector4 = richtextColor.COLORS.red;
richtextColor.add("brand", "#ff0000");

// richtext.richtext — `create` returns the passthrough `LuaMultiReturn` unchanged;
// a created word's `node` is an `Opaque<"node">` handle and its `color` a
// `Vector4`; `tagged` round-trips the same `Word[]`.
const [_richWords, _richMetrics] = richtext.create("hi", "default");
declare const _richWord: (typeof _richWords)[number];
const _richNode: Opaque<"node"> = _richWord.node;
const _richWordColor: Vector4 = _richWord.color;
const _richWidth: number = _richMetrics.width;
const _taggedWords: typeof _richWords = richtext.tagged(_richWords, "em");
declare const _taggedWord: (typeof _taggedWords)[number];
const _taggedNode: Opaque<"node"> = _taggedWord.node;

// The two brands are distinct where a prose-sourced emit would have collapsed
// both to `Hash`: each alignment constant is accepted only by its own `Settings`
// field, pinned at the consumer boundary so a lost `__brand` fails to compile.
richtext.create("hi", "default", {
  align: richtext.ALIGN_CENTER,
  valign: richtext.VALIGN_TOP,
});
richtext.create("hi", "default", {
  // @ts-expect-error an Alignment is not a VAlignment
  valign: richtext.ALIGN_CENTER,
});

// richtext.tags — `register` takes a tag name and a callback over the optional
// params/settings pair.
richtextTags.register("em", () => {});
richtextTags.apply("em");

void _richRed;
void _richNode;
void _richWordColor;
void _richWidth;
void _taggedNode;
