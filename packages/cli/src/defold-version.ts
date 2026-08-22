// The single source of truth for supported Defold versions, newest first.
// Everything below (the named stable constants and the release target matrix)
// derives from this list, so rotating a version is a one-line edit here.
//
// What belongs here is a bounded rule, not an accumulation: a bump keeps the
// current release plus the newest release of the preceding minor line pre-baked
// and demotes intermediate patches, which stay resolvable through their
// `api-targets.json` entry and committed `generated/versions/` surface. The rule
// is executable as `SURFACE_RETENTION` in `scripts/release-model.ts` — the
// per-package rootDir boundary keeps that contributor-tier module out of this
// one — and `bump:defold` reports every version it drops. Entries beyond the two
// slots are deliberate restorations and survive until the next bump.
export const DEFOLD_VERSIONS = ["1.13.1", "1.13.0", "1.12.4"] as const;

export const CURRENT_STABLE_DEFOLD_VERSION = DEFOLD_VERSIONS[0];

// The immediately-preceding stable release, kept as a committed historical
// surface (`api-targets.json` -> `defold-<this version>`) that the release matrix
// and readiness gate promote the current release over. Every entry after it is a
// still-supported rollback target with its own committed surface.
export const PREVIOUS_STABLE_DEFOLD_VERSION = DEFOLD_VERSIONS[1];
