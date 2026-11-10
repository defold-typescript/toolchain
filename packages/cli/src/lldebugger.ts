// `resolve` reads these, so this module imports nothing: `setup-debug` reaches a
// module that starts a process, which `resolve` must never load.

// Our pinned release URL, mirrored from `packages/docs/guide/debugging.md`. The
// `lldebugger-url` leak guard forbids the upstream ts-defold URL, so this must
// stay equal to the guide's snapshot URL.
export const LLDEBUGGER_URL =
  "https://github.com/defold-typescript/toolchain/releases/download/lldebugger-v1/lldebugger.zip";

// The one module a project requires from the debugger; `setup-debug` declares it.
export const LLDEBUGGER_MODULE = "lldebugger.debug";
