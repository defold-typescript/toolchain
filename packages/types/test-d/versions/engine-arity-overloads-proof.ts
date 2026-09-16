export {};

// A negative assertion only. A missing per-target `skipFunctions` entry leaves
// the generated declaration in place, which *merges* with the authored arms —
// so every positive call still compiles and proves nothing. What the surviving
// generated `vmath.euler_to_quat` signature uniquely accepts is the call shape
// below, and only a target that really skipped the function rejects it.
//
// `render.render_target` has no counterpart here: its authored wide arm repeats
// the generated signature verbatim, so a surviving generated declaration adds no
// call shape and no compile-time predicate can see it. The skip-parity case in
// `test/versions.test.ts` covers that side instead.

// @ts-expect-error the generated `x: number | Vector3` arm is the only signature
// that accepts a vector3 in slot 0 alongside two more numbers.
vmath.euler_to_quat(vmath.vector3(0), 45, 90);
