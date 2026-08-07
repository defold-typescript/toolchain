/**
 * A line-oriented reader for the *public surface* of a plain-Lua module — the
 * member names and parameter names a `local M = {} … return M` file declares.
 *
 * `sync-authored-types.ts` gates the authored/forked lane on a forked-vs-generated
 * identity diff and records that there is no coverage comparison against a primary
 * source. That holds for *types*: upstream Lua declares none. It does not hold for
 * *surface*: names and arity are right there in the source, so a fork that drops a
 * member or a trailing parameter is measurable. This module reads that side; the
 * comparison lives in `authored-parity.ts`.
 *
 * The corpus is a handful of pinned files, so line scanning is what it needs — a
 * Lua grammar would buy nothing here. Two rules keep it honest:
 *
 * - **Column 0 only.** A definition is a member when it starts the line. This is
 *   what keeps `nakama/util/log.lua`'s `M.log = noop` — reassigned inside three
 *   different function bodies — out of the surface, and it is why the reader never
 *   needs to know where a block ends.
 * - **Loud failure over silent undercount.** A missing `return <name>` or a
 *   parameter list that does not close on its own line throws. The whole point of
 *   the instrument is that a dropped member is visible; a parser that quietly
 *   skips what it cannot read would inflate every coverage number it feeds.
 */

export interface LuaMember {
  name: string;
  /** Absent for a non-callable field (`M.SOME_CONSTANT = "X"`), so a field can
   * never be confused with a zero-arity function. */
  params?: string[];
  /** True when the definition ends in `...`, which is not a named parameter. */
  varargs: boolean;
  /** The `---` LuaDoc block immediately above the definition, comment markers
   * stripped; empty when the block is absent or opens with a plain `--`. */
  doc: string;
}

export interface LuaSurface {
  moduleLocal: string;
  members: LuaMember[];
}

const RETURN_LINE = /^return\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?\s*$/;
const IDENTIFIER = "[A-Za-z_][A-Za-z0-9_]*";

function resolveModuleLocal(lines: string[]): string {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = RETURN_LINE.exec(lines[index] as string);
    if (match) return match[1] as string;
  }
  throw new Error(
    "lua surface: the source has no trailing `return <name>`, so the module-local name cannot be derived.",
  );
}

/** The parameter names between the parentheses opened at `open` on `line`, with a
 * `...` tail reported separately. Throws when the list does not close on the same
 * line rather than dropping the member. */
function readParams(
  line: string,
  open: number,
  lineNumber: number,
): { params: string[]; varargs: boolean } {
  const close = line.indexOf(")", open);
  if (close === -1) {
    throw new Error(
      `lua surface: line ${lineNumber} opens a parameter list that does not close on the same line — ${line.trim()}`,
    );
  }
  const raw = line
    .slice(open + 1, close)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return { params: raw.filter((part) => part !== "..."), varargs: raw.includes("...") };
}

/** The contiguous comment block ending at `index - 1`, kept only when it opens
 * with `---`. LuaDoc in this corpus is a `---` summary followed by plain `--`
 * `@param`/`@return` lines, so the marker on the *first* line is what decides. */
function readDoc(lines: string[], index: number): string {
  const block: string[] = [];
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = (lines[cursor] as string).trim();
    if (!line.startsWith("--") || line.startsWith("--[[")) break;
    block.unshift(line);
  }
  if (block.length === 0 || !(block[0] as string).startsWith("---")) return "";
  return block
    .map((line) => line.replace(/^-+\s?/, "").trimEnd())
    .join("\n")
    .trim();
}

/**
 * The public surface of a Lua module source: the module-local name it returns and
 * every member assigned to it at column 0, in source order. A name defined more
 * than once keeps its first position and its last definition, matching Lua.
 */
export function parseLuaSurface(source: string): LuaSurface {
  const lines = source.split("\n");
  const moduleLocal = resolveModuleLocal(lines);
  const definition = new RegExp(`^function\\s+${moduleLocal}\\.(${IDENTIFIER})\\s*\\(`);
  const assignment = new RegExp(`^${moduleLocal}\\.(${IDENTIFIER})\\s*=\\s*(.*)$`);
  const assignedFunction = /^function\s*\(/;

  const members = new Map<string, LuaMember>();
  const record = (member: LuaMember): void => {
    members.set(member.name, member);
  };

  for (const [index, line] of lines.entries()) {
    const defined = definition.exec(line);
    if (defined) {
      const { params, varargs } = readParams(line, defined[0].length - 1, index + 1);
      record({ name: defined[1] as string, params, varargs, doc: readDoc(lines, index) });
      continue;
    }
    const assigned = assignment.exec(line);
    if (!assigned) continue;
    const name = assigned[1] as string;
    const rhs = assigned[2] as string;
    if (!assignedFunction.test(rhs)) {
      record({ name, varargs: false, doc: readDoc(lines, index) });
      continue;
    }
    const open = line.indexOf("(", line.length - rhs.length);
    const { params, varargs } = readParams(line, open, index + 1);
    record({ name, params, varargs, doc: readDoc(lines, index) });
  }

  return { moduleLocal, members: [...members.values()] };
}
