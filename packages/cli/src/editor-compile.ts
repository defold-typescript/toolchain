import { type ChunkLocation, lookupChunkLocation, mapConsoleLine } from "./console-source-map";
import {
  type CommandResult,
  type CompileAnswer,
  type CompileOutcome,
  type EditorIssue,
  formatEditorIssue,
} from "./editor-attach";

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

/** The one line printed when the editor returned no compile verdict. */
export const EDITOR_COMPILE_NOTICES: Readonly<Record<CompileOutcome, string>> = {
  compiled: "the Defold editor compiled the project but returned no result to read",
  unsupported:
    "editor compile skipped: the attached Defold editor has no compile command; --editor-compile needs Defold 1.13.2 or later",
  skipped: "editor compile skipped: the Defold editor refused the request",
  unavailable: "editor compile skipped: no Defold editor is attached",
};

export interface EditorVerdict {
  readonly json: { readonly success: boolean; readonly issues: readonly CompileIssue[] };
  /** Unprefixed: each command adds its own `defold-typescript <command>: ` tag. */
  readonly lines: readonly string[];
  /** Present only on a failed verdict. */
  readonly error?: string;
}

/**
 * Only a failed verdict is an error. No editor, an editor before 1.13.2 and a
 * refused request are all states a build in CI meets, and none of them says the
 * project is broken.
 */
export function editorVerdict(cwd: string, result: CommandResult, action: string): EditorVerdict {
  const json = { success: result.success, issues: mapCompileIssues(cwd, result.issues) };
  const lines = result.issues.map(
    (issue) => `editor: ${mapConsoleLine(cwd, formatEditorIssue(issue))}`,
  );
  if (result.success) return { json, lines };
  const count = result.issues.length;
  return {
    json,
    lines,
    error: `the Defold editor failed to ${action} with ${count} issue${count === 1 ? "" : "s"}`,
  };
}

export interface EditorCompileReport {
  readonly json: {
    readonly outcome: CompileOutcome;
    readonly success?: boolean;
    readonly issues?: readonly CompileIssue[];
  };
  readonly lines: readonly string[];
  readonly error?: string;
}

/**
 * The one report `build --editor-compile` and `watch --editor-compile` both
 * print, so the two commands' `editorCompile` payloads cannot drift apart.
 */
export function editorCompileReport(cwd: string, answer: CompileAnswer): EditorCompileReport {
  const { outcome, result } = answer;
  if (outcome !== "compiled" || result === null) {
    return { json: { outcome }, lines: [EDITOR_COMPILE_NOTICES[outcome]] };
  }
  const verdict = editorVerdict(cwd, result, "compile the project");
  return { ...verdict, json: { outcome, ...verdict.json } };
}
