import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TranslationStore } from "../src/example-store";

// Build-time only: lives under `scripts/` (never reachable from the shipped
// `src/index.ts` graph) so its `node:fs` import cannot leak into a consumer's
// typecheck. `src/example-store.ts` stays pure for exactly that reason.
const TRANSLATIONS_PATH = resolve(import.meta.dir, "..", "examples", "translations.json");

export function loadTranslations(path: string = TRANSLATIONS_PATH): TranslationStore {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  return JSON.parse(raw) as TranslationStore;
}
