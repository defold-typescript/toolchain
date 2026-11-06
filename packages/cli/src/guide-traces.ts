/**
 * Reads the `text trace` fences of a tutorial page. A trace fence shows the console a lesson's
 * project prints, and its `run="..."` attribute names the steps that drive the project before the
 * output is read. A `...` line in a trace stands for any number of printed lines left out.
 */
import { type Heading, sectionHeadings } from "./guide-steps";

export type TraceStep =
  | { readonly kind: "frames"; readonly count: number }
  | { readonly kind: "press"; readonly action: string }
  | { readonly kind: "touch" | "move"; readonly name: string };

export interface TraceFence {
  /** The text of the `## ` heading the fence's section starts with; `""` above the first one. */
  readonly heading: string;
  /** The 1-based page line of the fence's opening line. */
  readonly line: number;
  /** The fence's lines, as the page shows them. */
  readonly shown: readonly string[];
  readonly steps: readonly TraceStep[];
}

// A fence inside a callout carries the blockquote prefix on every line, as a `ts` fence does.
const TEXT_FENCE = /^(> ?)?```text(?=[\s{]|$)([^\n]*)\n([\s\S]*?)^\1```/gm;

const SKIP = "...";

// The info string's second token, as `step` is for a `ts` fence: the site renders the first only.
function isTraceFence(info: string): boolean {
  return info.trim().split(/\s+/)[0] === "trace";
}

/** The text of the last heading above `line`, or `""` above the first one. */
export function headingAt(headings: readonly Heading[], line: number): string {
  let text = "";
  for (const heading of headings) {
    if (heading.line >= line) break;
    text = heading.text;
  }
  return text;
}

function parseSteps(info: string, line: number): TraceStep[] {
  const match = info.match(/\brun=(?:"([^"]*)"|'([^']*)')/);
  const run = match?.[1] ?? match?.[2] ?? "";
  const fail = (step: string, problem: string): never => {
    throw new Error(`trace fence at line ${line}: \`${step}\` ${problem}`);
  };
  return run
    .split(";")
    .map((step) => step.trim())
    .filter((step) => step.length > 0)
    .map((step): TraceStep => {
      const [, kind, rest = ""] = step.match(/^(\S+)\s*(.*)$/) ?? [];
      switch (kind) {
        case "frames":
          if (!/^[1-9]\d*$/.test(rest)) fail(step, "needs a whole number of frames above 0");
          return { kind, count: Number(rest) };
        case "press":
          if (!/^\S+$/.test(rest)) fail(step, "needs one action name");
          return { kind, action: rest };
        case "touch":
        case "move":
          if (rest.length === 0) fail(step, "needs a firefly name");
          return { kind, name: rest };
        default:
          return fail(step, "is no step: use frames, press, touch or move");
      }
    });
}

export function traceFences(page: string): TraceFence[] {
  const headings = sectionHeadings(page);
  const fences: TraceFence[] = [];
  for (const m of page.matchAll(TEXT_FENCE)) {
    const info = m[2] as string;
    if (!isTraceFence(info)) continue;
    const line = page.slice(0, m.index).split("\n").length;
    const raw = m[1] === undefined ? (m[3] as string) : (m[3] as string).replace(/^> ?/gm, "");
    const body = raw.replace(/\n$/, "");
    fences.push({
      heading: headingAt(headings, line),
      line,
      shown: body === "" ? [] : body.split("\n"),
      steps: parseSteps(info, line),
    });
  }
  return fences;
}

interface Run {
  readonly lines: readonly string[];
  /** The 0-based index in `shown` of the run's first line. */
  readonly from: number;
}

function runs(shown: readonly string[]): Run[] {
  const found: Run[] = [];
  let lines: string[] = [];
  let from = 0;
  shown.forEach((line, i) => {
    if (line.trim() === SKIP) {
      if (lines.length > 0) found.push({ lines, from });
      lines = [];
      from = i + 1;
    } else {
      lines.push(line);
    }
  });
  if (lines.length > 0) found.push({ lines, from });
  return found;
}

/** How many leading lines of `run` match `printed` from `start`. */
function lead(printed: readonly string[], run: readonly string[], start: number): number {
  let n = 0;
  while (n < run.length && printed[start + n] === run[n]) n++;
  return n;
}

function describeLine(printed: readonly string[], index: number): string {
  const line = printed[index];
  return line === undefined ? "the end of the output" : `\`${line}\` (printed line ${index + 1})`;
}

/**
 * Whether `printed` reads as `shown`, where a `...` shown line skips zero or more printed lines.
 * With no leading `...` the first shown line is the first printed line, and with no trailing one
 * the last is the last. Returns `undefined` on a match, else a message naming the first shown line
 * that found no place and the printed line it was held against.
 */
export function matchTrace(
  shown: readonly string[],
  printed: readonly string[],
): string | undefined {
  const pinnedStart = shown[0]?.trim() !== SKIP;
  const pinnedEnd = shown[shown.length - 1]?.trim() !== SKIP;
  const found = runs(shown);
  const missed = (run: Run, start: number): string => {
    const at = lead(printed, run.lines, start);
    const index = run.from + at;
    return `shown line ${index + 1}, \`${shown[index]}\`, found no place; it was held against ${describeLine(printed, start + at)}`;
  };
  let position = 0;
  for (const [i, run] of found.entries()) {
    const first = i === 0 && pinnedStart;
    const last = i === found.length - 1 && pinnedEnd;
    if (first || last) {
      const start = first ? 0 : printed.length - run.lines.length;
      if (start < position || lead(printed, run.lines, start) < run.lines.length) {
        return missed(run, Math.max(start, position));
      }
      if (first && last && printed.length > run.lines.length) {
        return `the trace ends at \`${run.lines.at(-1)}\`, and the output goes on with ${describeLine(printed, run.lines.length)}`;
      }
      position = start + run.lines.length;
      continue;
    }
    let best = position;
    let start = position;
    for (; start + run.lines.length <= printed.length; start++) {
      if (lead(printed, run.lines, start) === run.lines.length) break;
      if (lead(printed, run.lines, start) > lead(printed, run.lines, best)) best = start;
    }
    if (start + run.lines.length > printed.length) return missed(run, best);
    position = start + run.lines.length;
  }
  if (found.length === 0 && pinnedStart && printed.length > 0) {
    return `the trace shows nothing, and the output reads ${describeLine(printed, 0)}`;
  }
  return undefined;
}
