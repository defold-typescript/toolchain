import {
  checkUrlFragmentReachability,
  type SceneComponentIndex,
} from "@defold-typescript/transpiler";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";

// Render the URL fragment reachability report as build warnings. The check's own
// `message` is carried verbatim — it is already phrased for a reader, so a
// second wording layer here would duplicate what the check decided. Warn-only,
// and the return shape matches `scanOrphanOutputs` and `scanSceneResourceRefs`
// so the build can merge all three.
export function scanUrlFragmentReachability(input: {
  program: ts.Program;
  index: SceneComponentIndex;
  table: UrlParameterTable;
}): string[] {
  const report = checkUrlFragmentReachability(input);
  if (report.kind === "suppressed") {
    // One line, never zero: a check that could not run must not read as one
    // that found nothing.
    return [
      `unreachable-address check did not run: the component id universe is incomplete ` +
        `(${report.reasons.join("; ")})`,
    ];
  }
  return report.findings.map((finding) => `${finding.fileName}: ${finding.message}`);
}
