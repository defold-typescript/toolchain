import {
  checkCrossWorldAddresses,
  checkUrlFragmentReachability,
} from "@defold-typescript/transpiler";
import type { UrlParameterTable } from "@defold-typescript/types";
import type * as ts from "typescript";
import { type SceneIndexCache, sceneComponentIndexOf } from "./scene-index-cache";
import { projectObjectIndex, worldsFor } from "./scene-relative-addresses";

/** The `source` an editor renders beside the message, and `--json` never sees. */
export const DEFOLD_DIAGNOSTIC_SOURCE = "defold-typescript";

// A range neither TypeScript (< 100000) nor tstl occupies, so a host filtering
// by code can tell the two address findings apart from each other and from
// everything else the language service reports.
const UNREACHABLE_FRAGMENT_CODE = 9_000_101;
const FOREIGN_SOCKET_CODE = 9_000_102;

function suggestion(
  typescript: typeof import("typescript"),
  file: ts.SourceFile,
  finding: { readonly start: number; readonly length: number; readonly message: string },
  code: number,
): ts.Diagnostic {
  return {
    file,
    start: finding.start,
    length: finding.length,
    messageText: finding.message,
    category: typescript.DiagnosticCategory.Suggestion,
    source: DEFOLD_DIAGNOSTIC_SOURCE,
    code,
  };
}

/**
 * The address findings the editor surfaces on the file being edited, as
 * advisory suggestions.
 *
 * Every path that cannot produce one answers with an empty array. A suppressed
 * reachability report is the important case: there is no file span on which a
 * "the check did not run" notice could honestly sit, and a speculative squiggle
 * is worse than none — the build says so in prose instead, where a whole-project
 * line has somewhere to go.
 *
 * The *whole* hole is one index, composed the way `sceneIndexForBuild` composes
 * it: what the parse could not read plus what the walk could not reach. The
 * completion path deliberately reads a partial universe — a suggestion claims
 * nothing about what is absent — but a finding does, so a component declared
 * only by an unresolved dependency suppresses the check rather than reporting
 * the address as unreachable.
 */
export function sceneReachabilityDiagnostics(input: {
  ts: typeof import("typescript");
  program: ts.Program;
  table: UrlParameterTable;
  cache: SceneIndexCache;
  fileName: string;
}): ts.Diagnostic[] {
  const { ts: typescript, program, table, cache, fileName } = input;
  const sourceFile = program.getSourceFile(fileName);
  if (!sourceFile) {
    return [];
  }
  const index = sceneComponentIndexOf(cache);
  const report = checkUrlFragmentReachability({
    program,
    table,
    index: { ids: index.ids, incomplete: [...index.incomplete, ...cache.documents().unreadable] },
    objects: projectObjectIndex(cache),
    sourceFiles: [sourceFile],
  });
  const fragments =
    report.kind === "suppressed"
      ? []
      : report.findings.map((finding) =>
          suggestion(typescript, sourceFile, finding, UNREACHABLE_FRAGMENT_CODE),
        );

  // Outside the branch above, never inside it: the two honesty rules are
  // independent — one suppresses index-wide on an incomplete component universe,
  // the other withholds per file on an unresolvable world — which is the reason
  // the transpiler kept them as two exports rather than one.
  const crossWorld = checkCrossWorldAddresses({
    program,
    table,
    worldsOf: (name) => worldsFor(cache, name),
    sourceFiles: [sourceFile],
  }).map((finding) => suggestion(typescript, sourceFile, finding, FOREIGN_SOCKET_CODE));

  return [...fragments, ...crossWorld];
}
