// The single source of truth for supported Defold versions, newest first.
// Everything below (the named stable constants and the release target matrix)
// derives from this list, so rotating a version is a one-line edit here.
export const DEFOLD_VERSIONS = ["1.13.0", "1.12.4"] as const;

export const CURRENT_STABLE_DEFOLD_VERSION = DEFOLD_VERSIONS[0];

// The immediately-preceding stable release, kept as a committed historical
// surface (`api-targets.json` -> `defold-1.12.4`) that the release matrix and
// readiness gate promote 1.13.0 over.
export const PREVIOUS_STABLE_DEFOLD_VERSION = DEFOLD_VERSIONS[1];
