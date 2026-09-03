import { setDefaultTimeout } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";

// Bun's default per-test timeout is 5s. Several tests do real work — the
// `build editor attach` cases each run two full `dispatch(["build", …])`
// transpiles — which lands at 3–8s on the windows-latest runner, roughly
// 1.7x slower than ubuntu/macos on the same suite. At the default, whichever
// heavy test happened to sit nearest the line tripped nondeterministically:
// a red run and its rerun failed on disjoint test sets, always on timeout,
// never on an assertion. 30s clears the slowest observed test with headroom.
setDefaultTimeout(30_000);

// The upstream-release notice is a production convenience that reaches the
// network. Defaulting it off for the suite keeps every command test offline and
// deterministic — otherwise any drift-checked command on a version pin would
// issue a live `d.defold.com` request and then assert against whatever the real
// stable channel happens to be. `upstream-notice`'s own tests clear this for the
// cases that exercise the feature.
process.env.DEFOLD_TYPESCRIPT_NO_UPDATE_CHECK = "1";

// Defense in depth for a test that clears the opt-out: the cache lives under
// `DEFOLD_TYPESCRIPT_CACHE`, so a per-run temp root keeps the default path
// resolvable but empty rather than reading — or rewriting — the developer's real
// `~/.cache` entry.
if (!process.env.DEFOLD_TYPESCRIPT_CACHE) {
  process.env.DEFOLD_TYPESCRIPT_CACHE = mkdtempSync(path.join(tmpdir(), "dts-test-cache-"));
}
