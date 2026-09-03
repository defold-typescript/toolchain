import { loadApiTargetsRegistry } from "./api-registry";
import { CURRENT_STABLE_DEFOLD_VERSION } from "./defold-version";

export const CURRENT_STABLE_SURFACE_ID = `defold-${CURRENT_STABLE_DEFOLD_VERSION}`;

export interface SelectedApiSurface {
  readonly surfaceId: string | null;
  readonly available: boolean;
}

export function selectApiSurface(resolvedVersion: string): SelectedApiSurface {
  const id = `defold-${resolvedVersion}`;
  const target = loadApiTargetsRegistry().find((t) => t.id === id);
  if (target) {
    return { surfaceId: target.id, available: true };
  }
  return { surfaceId: null, available: false };
}
