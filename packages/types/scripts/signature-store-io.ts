import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SignatureStore } from "../src/signature-store";

// Build-time only: lives under `scripts/` (never reachable from the shipped
// `src/index.ts` graph) so its `node:fs` import cannot leak into a consumer's
// typecheck. `src/signature-store.ts` stays pure for exactly that reason.
const IO_SIGNATURES_PATH = resolve(import.meta.dir, "..", "signatures", "io.json");

export function loadSignatures(path: string = IO_SIGNATURES_PATH): SignatureStore {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  return JSON.parse(raw) as SignatureStore;
}
