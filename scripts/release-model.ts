import {
  CURRENT_STABLE_DEFOLD_VERSION,
  DEFOLD_VERSIONS,
  PREVIOUS_STABLE_DEFOLD_VERSION,
} from "../packages/cli/src/defold-version.ts";

// One machine-readable source of truth for the Defold-version knowledge that was
// otherwise duplicated across the CLI, the types-side sync/import scripts, and
// mise. It is *seeded from* the CLI tuple rather than owning it: the CLI keeps
// the shipped, runtime-critical `DEFOLD_VERSIONS`, and this contributor-tier
// model derives everything else (fixture paths, promoted namespaces, extension
// pins, target metadata, the patch-vs-minor classifier) from that seed.

export const RELEASE_MODEL = {
  current: CURRENT_STABLE_DEFOLD_VERSION,
  previous: PREVIOUS_STABLE_DEFOLD_VERSION,
  all: [...DEFOLD_VERSIONS] as readonly string[],
} as const;

export type ReleaseTransition = "patch" | "minor";

// A bump's mode is a function of its target, not a stored field: same
// major.minor as the previous release is a patch, anything else is a minor.
export function classifyTransition(previous: string, to: string): ReleaseTransition {
  const minorOf = (version: string): string => version.split(".").slice(0, 2).join(".");
  return minorOf(previous) === minorOf(to) ? "patch" : "minor";
}

export function fixtureDir(version: string): string {
  return `fixtures/defold-${version}`;
}

// Newest-first ordering over `major.minor.patch` strings, shared with the bump
// orchestrator so the retention rule and the plan validator order versions the
// same way.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let index = 0; index < Math.max(pa.length, pb.length); index += 1) {
    const delta = (pa[index] ?? 0) - (pb[index] ?? 0);
    if (delta !== 0) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function minorLineOf(version: string): string {
  return version.split(".").slice(0, 2).join(".");
}

export type RetentionSlot = "current" | "previous-minor";

// Which Defold surfaces a bump leaves pre-baked, as data the planner executes
// rather than prose it restates. The toolchain ships the incoming release plus
// the newest release of the preceding minor line; an intermediate patch keeps
// its `api-targets.json` entry, its fixtures and its committed
// `generated/versions/` surface, and only leaves the `DEFOLD_VERSIONS` tuple —
// which is what `bump-defold` reports as a remaining human decision.
//
// This is the bump's default, not a cap: a surface restored by hand (as 1.13.0
// was) stays pre-baked until the next bump applies the rule again.
export const SURFACE_RETENTION = {
  keep: ["current", "previous-minor"] as readonly RetentionSlot[],
} as const;

// Apply `SURFACE_RETENTION` to a candidate version set, newest-first. The
// previous-minor slot falls back to the newest remaining predecessor when every
// known release shares the incoming release's minor line, because
// `PREVIOUS_STABLE_DEFOLD_VERSION` reads the tuple's second entry.
export function retainedVersions(all: readonly string[], to: string): string[] {
  const ordered = [...new Set([to, ...all])].sort(compareVersions).reverse();
  const retained: string[] = [];
  for (const slot of SURFACE_RETENTION.keep) {
    const pick =
      slot === "current"
        ? to
        : (ordered.find((version) => version !== to && minorLineOf(version) !== minorLineOf(to)) ??
          ordered.find((version) => version !== to));
    if (pick !== undefined && !retained.includes(pick)) retained.push(pick);
  }
  return retained;
}

// The Defold versions the changelog's preamble presents as selectable. The
// preamble is live page prose above the first `## vX.Y.Z` heading — unlike a
// released section it is not frozen, so it has to keep tracking the target
// registry, and `release-model.test.ts` guards it against `api-targets.json`.
export function preambleSelectableVersions(changelog: string): string[] {
  const firstRelease = changelog.search(/^## v\d/m);
  const preamble = firstRelease === -1 ? changelog : changelog.slice(0, firstRelease);
  return [...new Set([...preamble.matchAll(/`(\d+\.\d+\.\d+)`/g)].map((match) => match[1] ?? ""))];
}

// Namespaces promoted into the generated surface for the first time at a given
// release. Seeded with the 1.13.0 set formerly held as
// `DEFOLD_1_13_PROMOTED_NAMESPACES` in the release importer.
const PROMOTED_NAMESPACES_BY_VERSION: Readonly<Record<string, readonly string[]>> = {
  "1.13.0": [
    "b2d.chain",
    "b2d.fixture",
    "b2d.joint",
    "b2d.shape",
    "b2d.world",
    "compute",
    "material",
  ],
};

export function promotedNamespacesFor(version: string): string[] {
  return [...(PROMOTED_NAMESPACES_BY_VERSION[version] ?? [])];
}

export interface ExtensionPin {
  readonly namespace: string;
  readonly repo: string;
  readonly tag: string;
  readonly path: string;
}

// Extension-only namespaces pinned to a release tag. The types-side sync script
// holds these values in its own `EXTENSION_MANIFEST` (the per-package rootDir
// boundary prevents importing this module); `release-model.test.ts`
// correspondence-guards that manifest against these pins so tag drift fails CI.
export const EXTENSION_PINS: readonly ExtensionPin[] = [
  {
    namespace: "iac",
    repo: "defold/extension-iac",
    tag: "1.4.0",
    path: "extension-iac/api/iac.script_api",
  },
  {
    namespace: "iap",
    repo: "defold/extension-iap",
    tag: "8.4.0",
    path: "extension-iap/api/iap.script_api",
  },
  {
    namespace: "push",
    repo: "defold/extension-push",
    tag: "4.1.0",
    path: "extension-push/api/push.script_api",
  },
  {
    namespace: "webview",
    repo: "defold/extension-webview",
    tag: "1.5.0",
    path: "webview/api/webview.script_api",
  },
];

export interface TargetMeta {
  readonly fixturesDir: string;
  readonly generatedDir: string;
  readonly coreTypesImport: string;
  readonly default: boolean;
}

// The `api-targets.json` metadata a target carries. The default (current-stable)
// target lives at the package-root `generated/`; a demoted target is nested under
// `generated/versions/defold-<version>/`, so its core-types import climbs two
// extra levels.
export function targetMetaFor(version: string, options: { isDefault: boolean }): TargetMeta {
  return options.isDefault
    ? {
        fixturesDir: fixtureDir(version),
        generatedDir: "generated",
        coreTypesImport: "../src/core-types",
        default: true,
      }
    : {
        fixturesDir: fixtureDir(version),
        generatedDir: `generated/versions/defold-${version}`,
        coreTypesImport: "../../../src/core-types",
        default: false,
      };
}
