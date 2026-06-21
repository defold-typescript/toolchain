import { join } from "node:path";
import type { ApiPage } from "./api-surface";
import {
  type ApiVersion,
  listApiVersions,
  loadApiSurface,
  loadApiSurfaceForVersion,
} from "./api-surface-loader";

export const TYPES_DIR = join(process.cwd(), "../types");

export function apiPages(): ApiPage[] {
  return loadApiSurface(TYPES_DIR);
}

export function apiVersions(): ApiVersion[] {
  return listApiVersions(TYPES_DIR);
}

export function apiPagesForVersion(versionId: string): ApiPage[] {
  return loadApiSurfaceForVersion(TYPES_DIR, versionId);
}
