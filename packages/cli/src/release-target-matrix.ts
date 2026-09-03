import { selectApiSurface } from "./api-surface";
import { DEFOLD_VERSIONS } from "./defold-version";
import { resolveRegisteredSurfaceGeneratedDir } from "./materialize";

// The exact release targets a promotion is gated against: one spec per pre-baked
// `DEFOLD_VERSIONS` entry — every entry, including any deliberate restoration,
// not just the current/previous-minor pair the retention rule picks — each backed
// by a committed surface. Intermediate patches the retention rule drops keep their
// surface but leave this matrix with the tuple.
export interface ReleaseTargetSpec {
  readonly version: string;
  readonly surfaceId: string;
  readonly isCurrentStable: boolean;
}

export const RELEASE_TARGET_MATRIX: readonly ReleaseTargetSpec[] = DEFOLD_VERSIONS.map(
  (version, i) => ({
    version,
    surfaceId: `defold-${version}`,
    isCurrentStable: i === 0,
  }),
);

export interface SurfaceSelection {
  readonly surfaceId: string | null;
  readonly available: boolean;
  readonly generatedDir: string | null;
}

// Which committed generated `.d.ts` set backs a target. Every pre-baked target
// resolves to a committed directory; an unregistered version resolves to nothing
// (a project pinned to it would not type-check). Selection reads the registry,
// not the tuple, so a demoted version still resolves.
export function selectMatrixSurface(version: string): SurfaceSelection {
  const selected = selectApiSurface(version);
  return {
    surfaceId: selected.surfaceId,
    available: selected.available,
    generatedDir: resolveRegisteredSurfaceGeneratedDir(selected.surfaceId),
  };
}
