import { join } from "node:path";
import type { ApiPage } from "./api-surface";
import { loadApiSurface } from "./api-surface-loader";

export const TYPES_DIR = join(process.cwd(), "../types");

export function apiPages(): ApiPage[] {
  return loadApiSurface(TYPES_DIR);
}
