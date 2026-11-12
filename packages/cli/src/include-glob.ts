/**
 * One `include` pattern, matched segment by segment the way `globSync` matches
 * a real folder, so discovery through a symbolic link and the `watch` filter
 * agree with what `build` finds on disk.
 */
export interface IncludeGlob {
  /** The literal folder before the first segment holding `*`, `?`, `[` or `{`; "" for the project root. */
  readonly walkBase: string;
  matches(rel: string): boolean;
  /** False only when no path beneath `dirRel` can match. */
  mayContain(dirRel: string): boolean;
}

const GLOBSTAR = Symbol("globstar");

type Segment = typeof GLOBSTAR | RegExp;

const SEGMENT_METACHARACTER_RE = /[*?[{]/;

export function compileIncludeGlob(pattern: string): IncludeGlob {
  const normalized = pattern.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
  const alternatives = expandBraces(normalized).map((alternative) =>
    alternative.split("/").map(compileSegment),
  );
  const walkBase = literalBase(normalized);
  return {
    walkBase,
    matches: (rel) => {
      const parts = rel.split("/");
      return alternatives.some((segments) => consumes(segments, 0, parts, 0, false));
    },
    mayContain: (dirRel) => {
      const parts = dirRel === "" ? [] : dirRel.split("/");
      return alternatives.some((segments) => consumes(segments, 0, parts, 0, true));
    },
  };
}

function literalBase(pattern: string): string {
  const segments = pattern.split("/");
  const firstGlob = segments.findIndex((segment) => SEGMENT_METACHARACTER_RE.test(segment));
  const end = firstGlob === -1 ? segments.length - 1 : firstGlob;
  return segments.slice(0, Math.max(end, 0)).join("/");
}

/**
 * Whether `segments` from `si` consumes every part of `parts` from `pi`. With
 * `leaveRoom`, a segment must remain once the parts run out, so a folder
 * qualifies only when something beneath it can still match.
 */
function consumes(
  segments: readonly Segment[],
  si: number,
  parts: readonly string[],
  pi: number,
  leaveRoom: boolean,
): boolean {
  if (pi === parts.length) {
    if (leaveRoom) {
      return si < segments.length;
    }
    return segments.slice(si).every((segment) => segment === GLOBSTAR);
  }
  const segment = segments[si];
  if (segment === undefined) {
    return false;
  }
  if (segment === GLOBSTAR) {
    // `**` spans any number of segments (including none); a trailing `**`
    // spans the rest of the path.
    return (
      consumes(segments, si + 1, parts, pi, leaveRoom) ||
      consumes(segments, si, parts, pi + 1, leaveRoom)
    );
  }
  return segment.test(parts[pi] as string) && consumes(segments, si + 1, parts, pi + 1, leaveRoom);
}

function compileSegment(segment: string): Segment {
  if (segment === "**") {
    return GLOBSTAR;
  }
  let out = "";
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i] as string;
    if (c === "*") {
      out += "[^/]*";
    } else if (c === "?") {
      out += "[^/]";
    } else if (c === "[") {
      const close = classEnd(segment, i);
      if (close === -1) {
        out += "\\[";
      } else {
        out += compileClass(segment.slice(i + 1, close));
        i = close;
      }
    } else {
      out += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`);
}

/** The index of the `]` closing the class opened at `open`, or -1 when none does. */
function classEnd(segment: string, open: number): number {
  let i = open + 1;
  if (segment[i] === "!" || segment[i] === "^") {
    i++;
  }
  // A `]` right after the opening bracket is a member, not the close.
  if (segment[i] === "]") {
    i++;
  }
  return segment.indexOf("]", i);
}

function compileClass(body: string): string {
  const negated = body.startsWith("!") || body.startsWith("^");
  const members = (negated ? body.slice(1) : body).replace(/[\\\]^[]/g, "\\$&");
  return `[${negated ? "^" : ""}${members}]`;
}

/**
 * Every pattern a `{a,b}` list stands for, nested lists included. A brace with
 * no top-level comma, or no closing brace, stays literal.
 */
function expandBraces(pattern: string): string[] {
  for (let open = pattern.indexOf("{"); open !== -1; open = pattern.indexOf("{", open + 1)) {
    const commas: number[] = [];
    let depth = 0;
    let close = -1;
    for (let i = open + 1; i < pattern.length; i++) {
      const c = pattern[i];
      if (c === "{") {
        depth++;
      } else if (c === "}") {
        if (depth === 0) {
          close = i;
          break;
        }
        depth--;
      } else if (c === "," && depth === 0) {
        commas.push(i);
      }
    }
    if (close === -1 || commas.length === 0) {
      continue;
    }
    const prefix = pattern.slice(0, open);
    const suffix = pattern.slice(close + 1);
    const bounds = [open, ...commas, close];
    return bounds
      .slice(1)
      .flatMap((end, k) =>
        expandBraces(`${prefix}${pattern.slice((bounds[k] as number) + 1, end)}${suffix}`),
      );
  }
  return [pattern];
}
