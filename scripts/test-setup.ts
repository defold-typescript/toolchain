import { setDefaultTimeout } from "bun:test";

// Bun's default per-test timeout is 5s. Several tests do real work — the
// `build editor attach` cases each run two full `dispatch(["build", …])`
// transpiles — which lands at 3–8s on the windows-latest runner, roughly
// 1.7x slower than ubuntu/macos on the same suite. At the default, whichever
// heavy test happened to sit nearest the line tripped nondeterministically:
// a red run and its rerun failed on disjoint test sets, always on timeout,
// never on an assertion. 30s clears the slowest observed test with headroom.
setDefaultTimeout(30_000);
