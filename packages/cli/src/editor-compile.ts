import { type ChunkLocation, lookupChunkLocation } from "./console-source-map";
import type { EditorIssue } from "./editor-attach";

export interface CompileIssue extends EditorIssue {
  /** The authored `.ts` location, present only when the build's map answers. */
  readonly source?: ChunkLocation;
}

/**
 * Every issue, warnings included, since a successful compile can still carry
 * them. The editor's range is zero-based and the map lookup is one-based. An
 * issue on a resource the build never mapped (a `.collection`, the lualib
 * bundle) or with no range keeps only its raw location.
 */
export function mapCompileIssues(cwd: string, issues: readonly EditorIssue[]): CompileIssue[] {
  return issues.map((issue) => {
    if (issue.resource === undefined || issue.range === undefined) return issue;
    const source = lookupChunkLocation(cwd, issue.resource, issue.range.start.line + 1);
    return source === null ? issue : { ...issue, source };
  });
}
