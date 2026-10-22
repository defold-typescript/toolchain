import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SignatureStore } from "../src/signature-store";

// Build-time only: lives under `scripts/` (never reachable from the shipped
// `src/index.ts` graph) so its `node:fs` import cannot leak into a consumer's
// typecheck. `src/signature-store.ts` stays pure for exactly that reason.
export const IO_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "io.json");
export const STRING_SIGNATURES_PATH = resolve(
  import.meta.dirname,
  "..",
  "signatures",
  "string.json",
);
export const TABLE_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "table.json");
export const OS_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "os.json");
export const COROUTINE_SIGNATURES_PATH = resolve(
  import.meta.dirname,
  "..",
  "signatures",
  "coroutine.json",
);
export const MATH_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "math.json");
export const BIT_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "bit.json");
export const DEBUG_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "debug.json");
export const PACKAGE_SIGNATURES_PATH = resolve(
  import.meta.dirname,
  "..",
  "signatures",
  "package.json",
);
export const BASE_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "base.json");
export const SOCKET_SIGNATURES_PATH = resolve(
  import.meta.dirname,
  "..",
  "signatures",
  "socket.json",
);
export const VMATH_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "vmath.json");
export const GO_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "go.json");
export const GUI_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "gui.json");
export const MSG_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "msg.json");
export const RENDER_SIGNATURES_PATH = resolve(
  import.meta.dirname,
  "..",
  "signatures",
  "render.json",
);
export const SYS_SIGNATURES_PATH = resolve(import.meta.dirname, "..", "signatures", "sys.json");

export function loadSignatureFile(path: string): SignatureStore {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  return JSON.parse(raw) as SignatureStore;
}
