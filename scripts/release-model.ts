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

// Extension-only namespaces pinned to a release tag; the types-side sync script
// derives its `EXTENSION_MANIFEST` from these.
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
