/// <reference path="../index.d.ts" />

// Runtime-supported forms of `msg.url`:
//
//   1. `msg.url()` — no-arg (the runtime's own default).
//   2. `msg.url("[socket:][path][#fragment]")` — single string, the full URL.
//   3. `msg.url(socket, path, fragment)` — three-arg, all positions
//      required; `socket` may be `undefined` for the current world.
//
// The two-arg form `msg.url("main", "camera")` is a runtime error:
// "Only `msg.url()`, `msg.url(\"[socket:][path][#fragment]\")` or
//  `msg.url(socket, path, fragment)` is supported."
//
// And the one-arg form only accepts a string (not a `Hash`): the runtime
// parses a string URL, not a hashed component path.

// Form 1: no-arg.
const url0: Url = msg.url();

// Form 2: one-arg string.
const url1: Url = msg.url("main:/manager#controller");

// Form 2 with an absent argument — the ref-doc calls `msg.url(nil)` equivalent
// to the no-arg form, so `undefined` addresses the current script.
const url1Undefined: Url = msg.url(undefined);

// Form 3: three-arg, all required.
const url3: Url = msg.url(hash("main"), hash("/manager"), hash("controller"));

// Form 3 with an `undefined` socket — the runtime's documented current-world
// form, mixing an absent socket with a `Hash` path and a `string` fragment.
const urlNilSocket: Url = msg.url(undefined, hash("/door"), "door.ts");

void url0;
void url1;
void url1Undefined;
void url3;
void urlNilSocket;

// @ts-expect-error the two-arg form is runtime-invalid — must remain a type error.
const _urlBad2: Url = msg.url("main", "camera");

// @ts-expect-error an `undefined` socket does not collapse the arity — the
// two-arg form stays runtime-invalid.
const _urlBadNil2: Url = msg.url(undefined, hash("/door"));

// @ts-expect-error the one-arg form takes only a string, never a Hash.
const _urlBadHash: Url = msg.url(hash("x"));

// Same-world relative addressing reads a sibling by bare id — the
// canonical cross-script access pattern (no `socket:` prefix).
const siblingWorld: Vector3 = go.get_world_position("sibling");
go.set_position(vmath.vector3(0), "sibling");
void siblingWorld;
