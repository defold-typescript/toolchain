/// <reference path="../index.d.ts" />
import type { Hash, Opaque } from "../src/core-types";

// json: round-trip string -> table -> string is the headline proof. Both params
// emit as required (the optional-emits-as-required gotcha), so pass the options table.
const _encoded: string = json.encode({}, {});
const _decoded: Record<string | number, unknown> = json.decode("[]", {});
const _roundtrip: string = json.encode(json.decode(json.encode({}, {}), {}), {});
void _encoded;
void _decoded;
void _roundtrip;

// zlib: deflate/inflate are string -> string.
const _deflated: string = zlib.deflate("payload");
const _inflated: string = zlib.inflate(_deflated);
void _inflated;

// window.get_size recovers as a LuaMultiReturn tuple (width, height); both
// values destructure at their mapped types.
const [_winW, _winH] = window.get_size();
void _winW;
void _winH;

// sys: a get_* query returns its mapped scalar. sys is wired from the core
// src-script_sys doc only; the gamesys subset is not folded in.
const _cfg: string = sys.get_config_string("display.width", "960");
void _cfg;

// http.request takes the callback argument (callbacks map to the wide `unknown`
// fallback). url/method/callback are required; headers (a recovered
// string->string map), post_data, and options are optional.
const _headers: LuaMap<string, string> = {} as LuaMap<string, string>;
http.request("https://example.com", "GET", () => {}, _headers, "", {});

// One representative call per remaining namespace, no deep coverage.
const _buf = buffer.create(1, {});
// Recovered multi-return: get_metadata now returns a LuaMultiReturn tuple, so
// both values destructure. Before recovery it collapsed to the first value and
// could not be destructured at all.
const [_metaValues, _metaValueType] = buffer.get_metadata(_buf, "meta");
void _metaValues;
void _metaValueType;
const _world: unknown = b2d.get_world();
const _signum: number = crash.get_signum(0);
// image.load returns the concrete record or `undefined` — a documented `nil`
// return typed `T | undefined`, not a collapsed `unknown`. The fields are
// readable only after an explicit `!== undefined` guard.
const _img:
  | { width: number; height: number; type: Opaque<"constant">; buffer: string }
  | undefined = image.load("data", {});
const _mounts: { name: string; uri: string; priority: number }[] = liveupdate.get_mounts();
const _mem: number = profiler.get_memory_usage();
const _socketTime: number = socket.gettime();
// @ts-expect-error the record may be undefined, so the field is not readable before the guard
const _imgWidthEarly: number = _img.width;
void _imgWidthEarly;
if (_img !== undefined) {
  // Inside the guard the concrete fields narrow to their real types.
  const _imgWidth: number = _img.width;
  void _imgWidth;
}
void _buf;
void _world;
void _signum;
void _img;
void _mounts;
void _mem;
void _socketTime;

// Cross-module engine-type proof: resource.atlas returns the vmath-adjacent
// core-types `Hash`. None of the 14 system namespaces expose a vmath
// Vector3/Matrix4 type (camera surfaces only dropped constants), so the
// engine-type wiring is proven through `Hash` rather than a vmath value.
const _atlas: Hash = resource.atlas("/atlas.atlasc");
void _atlas;

// @ts-expect-error json.encode returns string, not number
const _badJson: number = json.encode({}, {});
void _badJson;

// @ts-expect-error zlib.deflate takes a string, not a number
zlib.deflate(123);
