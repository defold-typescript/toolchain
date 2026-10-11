/**
 * Reads the `ts step` fences of a tutorial page. The first step fence for a
 * title lists that file whole. Each later one is a diff of it in the notation
 * the docs site renders: `// [!code ++]` ends an added line, `// [!code --]` a
 * removed one, and a `// ...` line stands for the lines left out between two
 * hunks. Applying the fences in page order gives the project a reader has at
 * the end of each lesson.
 */

// The same `title="..."` info-string shape the docs site renders as a file name.
export function fenceTitle(info: string): string | undefined {
  const match = info.match(/\btitle=(?:"([^"]*)"|'([^']*)')/);
  const title = match?.[1] ?? match?.[2] ?? "";
  return title.length > 0 ? title : undefined;
}

// A fence inside a callout (`> [!WARNING]`) carries the blockquote prefix on every line, and its
// closing line must carry the prefix its opening line has.
const TS_FENCE = /^(> ?)?```ts(?=[\s{]|$)([^\n]*)\n([\s\S]*?)^\1```/gm;

export interface TsFence {
  /** The info string after `ts`. */
  readonly info: string;
  readonly body: string;
  /** The 1-based page line of the fence's opening line. */
  readonly line: number;
}

export function tsFences(text: string): TsFence[] {
  return [...text.matchAll(TS_FENCE)].map((m) => ({
    info: m[2] as string,
    body: m[1] === undefined ? (m[3] as string) : (m[3] as string).replace(/^> ?/gm, ""),
    line: text.slice(0, m.index).split("\n").length,
  }));
}

// The info string's second token, as the docs site reads `original`: Shiki and
// the language badge take only the first, so the fence still renders as `ts`.
export function isStepFence(info: string): boolean {
  return info.trim().split(/\s+/)[0] === "step";
}

export interface LessonProject {
  /** The text of the `## ` heading the project's section starts with; `""` above the first one. */
  readonly heading: string;
  /** Fence title to the file's text as it stands when the section ends. */
  readonly files: ReadonlyMap<string, string>;
}

const MARKER = /^(.*?)\s*\/\/ \[!code (\+\+|--)\]\s*$/;

function isSeparator(line: string): boolean {
  return line.trim() === "// ...";
}

/** One line of a step fence: its code without the marker, and the marker it ended with. */
export interface StepLine {
  readonly text: string;
  readonly mark: "++" | "--" | undefined;
}

/** The lines of a step fence as the applier reads them; the docs site must show them the same way. */
export function stepLines(fence: TsFence): StepLine[] {
  return fence.body
    .replace(/\n$/, "")
    .split("\n")
    .map((line) => {
      const marked = line.match(MARKER);
      return marked === null
        ? { text: line, mark: undefined }
        : { text: marked[1] as string, mark: marked[2] as "++" | "--" };
    });
}

interface Heading {
  readonly line: number;
  readonly text: string;
}

/** The `## ` headings outside any fence, each with its 1-based page line. */
function sectionHeadings(page: string): Heading[] {
  const headings: Heading[] = [];
  let fenced = false;
  page.split("\n").forEach((text, i) => {
    if (/^(?:> ?)?```/.test(text)) {
      fenced = !fenced;
    } else if (!fenced && text.startsWith("## ")) {
      headings.push({ line: i + 1, text: text.slice(3).trim() });
    }
  });
  return headings;
}

interface Hunk {
  readonly before: readonly string[];
  readonly after: readonly string[];
}

/** The hunks of a diff fence: the runs of lines between its `// ...` lines. */
function hunks(lines: readonly StepLine[]): Hunk[] {
  const found: Hunk[] = [];
  let before: string[] = [];
  let after: string[] = [];
  const close = () => {
    if (before.length > 0 || after.length > 0) found.push({ before, after });
    before = [];
    after = [];
  };
  for (const { text, mark } of lines) {
    if (mark === undefined && isSeparator(text)) {
      close();
      continue;
    }
    if (mark !== "++") before.push(text);
    if (mark !== "--") after.push(text);
  }
  close();
  return found;
}

/** Where `run` starts in `file`, at every place it matches as whole lines. */
function runStarts(file: readonly string[], run: readonly string[]): number[] {
  const starts: number[] = [];
  for (let start = 0; start + run.length <= file.length; start++) {
    if (run.every((line, i) => file[start + i] === line)) starts.push(start);
  }
  return starts;
}

/** How many leading lines of `run` match `file` at the place where the most do; below `run.length`. */
function longestLead(file: readonly string[], run: readonly string[]): number {
  let longest = 0;
  for (let start = 0; start < file.length; start++) {
    let lead = 0;
    while (lead < run.length - 1 && file[start + lead] === run[lead]) lead++;
    longest = Math.max(longest, lead);
  }
  return longest;
}

/**
 * Applies one step fence to `files` and reports whether a file changed. Throws
 * an `Error` naming the fence's title and page line when the fence cannot be
 * applied.
 */
function applyStep(files: Map<string, readonly string[]>, fence: TsFence): boolean {
  const title = fenceTitle(fence.info);
  if (title === undefined) {
    throw new Error(`step fence at line ${fence.line} has no title`);
  }
  const fail = (problem: string): never => {
    throw new Error(`step fence "${title}" at line ${fence.line}: ${problem}`);
  };
  if (fence.body.trim() === "") fail("the fence is empty");
  const lines = stepLines(fence);
  for (const { text, mark } of lines) {
    if (mark === undefined && text.includes("[!code")) {
      fail(`\`${text.trim()}\` holds a marker other than \`// [!code ++]\` and \`// [!code --]\``);
    }
    // The site reads a marker alone on a line as marking the line after it.
    if (mark !== undefined && text === "") {
      fail("a diff marker stands alone on a line; a blank line is shown unchanged, never marked");
    }
  }

  const current = files.get(title);
  if (current === undefined) {
    if (lines.some(({ text, mark }) => mark !== undefined || isSeparator(text))) {
      fail("the first listing of a file holds no diff marker and no `// ...` line");
    }
    files.set(
      title,
      lines.map(({ text }) => text),
    );
    return true;
  }

  let next = current;
  for (const hunk of hunks(lines)) {
    const anchor = hunk.before[0];
    if (anchor === undefined) {
      return fail("a hunk of added lines needs an unchanged line beside it to place it by");
    }
    const starts = runStarts(next, hunk.before);
    const start = starts[0];
    if (start === undefined) {
      const stray = hunk.before[longestLead(next, hunk.before)] as string;
      const where = stray === anchor ? "" : `; the file differs at \`${stray.trim()}\``;
      return fail(`the lines from \`${anchor.trim()}\` match no place in the file${where}`);
    }
    if (starts.length > 1) {
      return fail(`the lines from \`${anchor.trim()}\` match ${starts.length} places in the file`);
    }
    next = [...next.slice(0, start), ...hunk.after, ...next.slice(start + hunk.before.length)];
  }
  files.set(title, next);
  return next.length !== current.length || next.some((line, i) => line !== current[i]);
}

/**
 * The project each lesson of `page` leaves: one per `## ` section that changed
 * a file, in page order, holding every file as it stands when the section ends.
 */
export function lessonProjects(page: string): LessonProject[] {
  const headings = sectionHeadings(page);
  const files = new Map<string, readonly string[]>();
  const projects: LessonProject[] = [];
  let heading = "";
  let nextHeading = 0;
  let changed = false;
  const closeSection = () => {
    if (changed) {
      const texts = [...files].map(([title, lines]): [string, string] => [
        title,
        `${lines.join("\n")}\n`,
      ]);
      projects.push({ heading, files: new Map(texts) });
    }
    changed = false;
  };
  for (const fence of tsFences(page)) {
    if (!isStepFence(fence.info)) continue;
    for (
      let mark = headings[nextHeading];
      mark !== undefined && mark.line < fence.line;
      mark = headings[nextHeading]
    ) {
      closeSection();
      heading = mark.text;
      nextHeading++;
    }
    changed = applyStep(files, fence) || changed;
  }
  closeSection();
  return projects;
}
