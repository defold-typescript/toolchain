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
// one — and `bump:defold` reports every version it drops.
//
// That rule describes what a bump leaves behind, not what the tuple below holds
// right now. A deliberate restoration may add an entry *or* take the second slot
// and push the rule's pick down a position, so between bumps the tuple's
// positions are not the rule's positions. Read a slot as "whatever is there",
// and the next bump as the moment the rule is reapplied.
export const DEFOLD_VERSIONS = ["1.13.1", "1.13.0", "1.12.4"] as const;

export const CURRENT_STABLE_DEFOLD_VERSION = DEFOLD_VERSIONS[0];

// The tuple's second slot, whatever occupies it. A rotation leaves the retained
// release of the *preceding minor line* here, because a bump drops intermediate
// patches from the pre-baked set; a deliberate restoration can occupy the slot
// instead, and holds it until the next bump reapplies the rule. Either way this
// is a committed historical surface (`api-targets.json` -> `defold-<this
// version>`) that the release matrix and readiness gate promote the current
// release over, and every entry after it is a still-supported rollback target
// with its own committed surface.
export const PREVIOUS_STABLE_DEFOLD_VERSION = DEFOLD_VERSIONS[1];
