import type { HsmViewFile } from "../src/hsm-view-server";

export interface SearchMatch {
  readonly file: number;
  readonly line: number;
  readonly start: number;
  readonly end: number;
}

export interface SearchState {
  readonly query: string;
  readonly matches: readonly SearchMatch[];
  readonly current: number | undefined;
}

export const emptySearch: SearchState = { query: "", matches: [], current: undefined };

/** Every case-insensitive occurrence of `query` in the rendered lines, in file then position order. */
export function findMatches(
  files: readonly Pick<HsmViewFile, "lines">[],
  query: string,
): SearchMatch[] {
  if (query === "") {
    return [];
  }
  // A regex folds case without changing lengths, which lowercasing the text can do.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  const matches: SearchMatch[] = [];
  files.forEach((file, fileIndex) => {
    file.lines.forEach((runs, line) => {
      const text = runs.map((run) => run.text).join("");
      for (const match of text.matchAll(pattern)) {
        matches.push({
          file: fileIndex,
          line,
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    });
  });
  return matches;
}

export function search(files: readonly Pick<HsmViewFile, "lines">[], query: string): SearchState {
  const matches = findMatches(files, query);
  return { query, matches, current: matches.length === 0 ? undefined : 0 };
}

/** Moves to the next or previous match, wrapping at either end. */
export function step(state: SearchState, delta: 1 | -1): SearchState {
  const count = state.matches.length;
  if (count === 0) {
    return { ...state, current: undefined };
  }
  const from = state.current ?? (delta === 1 ? -1 : 0);
  return { ...state, current: (((from + delta) % count) + count) % count };
}
