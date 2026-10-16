/// <reference path="../index.d.ts" />

// Runtime-supported forms of `msg.url`:
//
//   1. `msg.url()` — no-arg (the runtime's own default).
//   2. `msg.url(urlstring)` — one argument, resolved by `ResolveURL`: a string
//      URL, a `Hash` path in the current world, or a `Url` it copies.
//   3. `msg.url(socket, path, fragment)` — three positions, each of which may
//      be `undefined` (Lua `nil`).
//
// The two-arg form `msg.url("main", "camera")` is a runtime error:
// "Only `msg.url()`, `msg.url(\"[socket:][path][#fragment]\")` or
//  `msg.url(socket, path, fragment)` is supported."

// Form 1: no-arg.
const url0: Url = msg.url();

// Form 2: one-arg string.
const url1: Url = msg.url("main:/manager#controller");

// Form 2 with an absent argument — the ref-doc calls `msg.url(nil)` equivalent
// to the no-arg form, so `undefined` addresses the current script.
const url1Undefined: Url = msg.url(undefined);

// Form 2 with a `Hash` (a path in the current world) or a `Url` (copied).
const url1Hash: Url = msg.url(hash("/door"));
const url1Url: Url = msg.url(msg.url());

// Form 3: three-arg.
const url3: Url = msg.url(hash("main"), hash("/manager"), hash("controller"));

// Form 3 with an `undefined` socket — the runtime's documented current-world
// form, mixing an absent socket with a `Hash` path and a `string` fragment.
const urlNilSocket: Url = msg.url(undefined, hash("/door"), "door.ts");

// Form 3 with `nil` path or fragment: all three `nil` is the current URL, a
// `nil` fragment with a socket and path is no fragment, and a `nil` path with
// a `nil` socket is the current path.
const urlAllNil: Url = msg.url(undefined, undefined, undefined);
const urlNilFragment: Url = msg.url(hash("level1"), hash("/door"), undefined);
const urlNilPath: Url = msg.url(undefined, undefined, "script");

void url0;
void url1;
void url1Undefined;
void url1Hash;
void url1Url;
void url3;
void urlNilSocket;
void urlAllNil;
void urlNilFragment;
void urlNilPath;

// @ts-expect-error the two-arg form is runtime-invalid — must remain a type error.
const _urlBad2: Url = msg.url("main", "camera");

// @ts-expect-error an `undefined` socket does not collapse the arity — the
// two-arg form stays runtime-invalid.
const _urlBadNil2: Url = msg.url(undefined, hash("/door"));

// @ts-expect-error the one-arg form takes a string, `Hash` or `Url`, never a number.
const _urlBadNumber: Url = msg.url(42);

// Same-world relative addressing reads a sibling by bare id — the
// canonical cross-script access pattern (no `socket:` prefix).
const siblingWorld: Vector3 = go.get_world_position("sibling");
go.set_position(vmath.vector3(0), "sibling");
void siblingWorld;
