/// <reference path="../index.d.ts" />
import type { Opaque } from "../src/core-types";

// Upstream declares the `b2Body` return but documents "Otherwise nil" in prose,
// so the caller owes a narrowing before using the handle.
const _body = b2d.get_body(msg.url());

// @ts-expect-error b2d.get_body returns nil when the url names no collision object
const _unnarrowed: Opaque<"b2Body"> = _body;

if (_body !== undefined) {
  const _narrowed: Opaque<"b2Body"> = _body;
  void _narrowed;
}

void _unnarrowed;
