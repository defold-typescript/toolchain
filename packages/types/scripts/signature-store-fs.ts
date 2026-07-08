import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SignatureStore } from "../src/signature-store";

// Build-time only: lives under `scripts/` (never reachable from the shipped
// `src/index.ts` graph) so its `node:fs` import cannot leak into a consumer's
// typecheck. `src/signature-store.ts` stays pure for exactly that reason.
export const IO_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "io.json");
export const STRING_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "string.json");
export const TABLE_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "table.json");
export const OS_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "os.json");
export const COROUTINE_SIGNATURES_PATH = resolve(
  import.meta.dir,
  "..",
  "signatures",
  "coroutine.json",
);
export const MATH_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "math.json");
export const BIT_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "bit.json");
export const DEBUG_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "debug.json");
export const PACKAGE_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "package.json");
export const BASE_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "base.json");
export const SOCKET_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "socket.json");
export const VMATH_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "vmath.json");

export function loadSignatureFile(path: string): SignatureStore {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  return JSON.parse(raw) as SignatureStore;
}
