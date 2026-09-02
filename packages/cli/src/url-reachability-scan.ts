import {
  checkCrossWorldAddresses,
  checkUrlFragmentReachability,
  type SceneComponentIndex,
} from "@defold-typescript/transpiler";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";

/** One unreachable address, for a consumer that would otherwise parse the prose. */
export interface UnreachableAddressEntry {
  readonly file: string;
  readonly fragment: string;
  readonly message: string;
}

export interface UrlReachabilityScan {
  readonly warnings: string[];
  readonly entries: UnreachableAddressEntry[];
}

// Render the URL fragment reachability report as build warnings, and as the
// structured entries `--json` carries beside them. The check's own `message` is
// carried verbatim into both — it is already phrased for a reader, so a second
// wording layer here would duplicate what the check decided, and one scan
// producing both renderings is what keeps them from disagreeing. Warn-only, and
// `warnings` matches the shape of `scanOrphanOutputs` and `scanSceneResourceRefs`
// so the build can merge all three.
export function scanUrlFragmentReachability(input: {
  program: ts.Program;
  index: SceneComponentIndex;
  table: UrlParameterTable;
}): UrlReachabilityScan {
  const report = checkUrlFragmentReachability(input);
  if (report.kind === "suppressed") {
    // One line, never zero: a check that could not run must not read as one
    // that found nothing. No entries either, for the same reason — a consumer
    // reads the absent field together with this line, never on its own.
    return {
      warnings: [
        `unreachable-address check did not run: the component id universe is incomplete ` +
          `(${report.reasons.join("; ")})`,
      ],
      entries: [],
    };
  }
  return {
    warnings: report.findings.map((finding) => `${finding.fileName}: ${finding.message}`),
    entries: report.findings.map((finding) => ({
      file: finding.fileName,
      fragment: finding.fragment,
      message: finding.message,
    })),
  };
}

/** One address naming a foreign world, for a consumer that would otherwise parse the prose. */
export interface CrossWorldAddressEntry {
  readonly file: string;
  readonly address: string;
  readonly socket: string;
  readonly message: string;
}

export interface CrossWorldAddressScan {
  readonly warnings: string[];
  readonly entries: CrossWorldAddressEntry[];
}

// Render the cross-world address check the way `scanUrlFragmentReachability`
// renders its own, carrying the check's `message` verbatim into both halves for
// the same reason. Its own scan rather than a branch of that one: the fragment
// check suppresses index-wide on an incomplete component universe, and a shared
// early return would silence this one on a hole it does not depend on.
export function scanCrossWorldAddresses(input: {
  program: ts.Program;
  table: UrlParameterTable;
  worldsOf: (fileName: string) => readonly (string | undefined)[];
}): CrossWorldAddressScan {
  const findings = checkCrossWorldAddresses(input);
  return {
    warnings: findings.map((finding) => `${finding.fileName}: ${finding.message}`),
    entries: findings.map((finding) => ({
      file: finding.fileName,
      address: finding.address,
      socket: finding.socket,
      message: finding.message,
    })),
  };
}
