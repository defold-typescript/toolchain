import { join } from "node:path";
import { type ApiPage, loadApiSurface } from "./api-surface";

export const TYPES_DIR = join(process.cwd(), "../types");

export function apiPages(): ApiPage[] {
  return loadApiSurface(TYPES_DIR);
}
