/// <reference path="../index.d.ts" />

const _inset_top: number = window.get_safe_area().inset_top;
const _width: number = window.get_safe_area().width;
void _inset_top;
void _width;

// @ts-expect-error the ref-doc's safe_area header restates the slot, so it is not a nesting level
const _nested = window.get_safe_area().safe_area;
void _nested;

// @ts-expect-error not_a_key is not a recovered field of the safe area table
const _bad = window.get_safe_area().not_a_key;
void _bad;
