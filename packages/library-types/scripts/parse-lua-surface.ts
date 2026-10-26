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
 *   parameter list that never closes throws, as does a
 *   `return setmetatable(M, …)` whose metatable carries `__index` or is named by a
 *   variable whose keys this reader cannot see — either could add members no column-0
 *   scan will find. The whole point of the instrument is that a dropped member is
 *   visible; a parser that quietly skips what it cannot read would inflate every
 *   coverage number it feeds.
 *
 * The returned table's constructor is the one place a member sits off column 0: a
 * column-0 `local M = {` (or `M = {`) whose entries run to the matching `}` gives each
 * depth-1 `<name> = <value>` entry as a member, so
 *
 *     local M = {
 *       Client = Client,
 *     }
 *
 * reads the same as `M.Client = Client`. The same loud rule holds there: a constructor
 * that never closes, an entry that is not `<name> =` (a bracketed key, a positional
 * value), or entries on the opening line itself throw rather than read short. Only a
 * module local derived from the trailing return reads its constructor: an annotation
 * file named through `options.moduleLocal` is read for the function stubs its
 * assignments declare, and its constructor holds constants.
 */

export interface LuaMember {
  name: string;
  /** Absent for a non-callable field (`M.SOME_CONSTANT = "X"`), so a field can
   * never be confused with a zero-arity function. */
  params?: string[];
  /** True when the definition ends in `...`, which is not a named parameter. */
  varargs: boolean;
  /** The `---` LuaDoc block immediately above the definition, comment markers
   * stripped, one interior blank line crossed; empty when the block is absent or
   * opens with a plain `--`. */
  doc: string;
  /** True when a comment block *was* there and the `---` rule declined it, which `doc`
   * alone cannot say — an empty `doc` otherwise means upstream documented nothing. */
  refusedDoc: boolean;
}

export interface LuaSurface {
  moduleLocal: string;
  members: LuaMember[];
}

export interface LuaSurfaceOptions {
  /** The table the members hang off, for a source that never returns it. A LuaLS
   * annotation file (`---@meta`) declares the module as a bare global and ends on its
   * last stub, so there is no `return <name>` to derive the name from — and deriving
   * one is not the reader's job when the caller already knows which namespace it
   * vendored the file for. Supplying a name the source never assigns to reads an empty
   * surface rather than throwing: the caller named the table, so an empty result is its
   * own answer. */
  moduleLocal?: string;
}

const RETURN_LINE = /^return\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?\s*$/;
const RETURN_SETMETATABLE = /^return\s+setmetatable\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,/;
const IDENTIFIER = "[A-Za-z_][A-Za-z0-9_]*";
const FUNCTION_VALUE = /^function\s*\(/;
const CONSTRUCTOR_ENTRY = new RegExp(`^\\s*(${IDENTIFIER})\\s*=(?!=)\\s*(.*)$`);

/** The metatable argument of a `return setmetatable(<name>, …)`, refused unless its
 * keys are readable and none of them delegates. `text` runs from the comma to the end
 * of the source rather than to the matching brace: over-reading can only refuse a file
 * loudly, where under-reading would accept a delegating module and report its short
 * surface as complete. */
function assertNoDelegation(text: string): void {
  if (text.trimStart().startsWith("{") === false) {
    throw new Error(
      "lua surface: the returned `setmetatable` is given a metatable this reader cannot see the keys of, so a delegated member would be invisible — inline the table literal or measure the module another way.",
    );
  }
  if (text.includes("__index")) {
    throw new Error(
      "lua surface: the returned metatable carries `__index`, so members reached through it would be invisible to a column-0 scan and the surface would read as complete while short.",
    );
  }
}

function resolveModuleLocal(lines: string[]): string {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index] as string;
    const bare = RETURN_LINE.exec(line);
    if (bare) return bare[1] as string;
    const wrapped = RETURN_SETMETATABLE.exec(line);
    if (wrapped) {
      assertNoDelegation(
        [line.slice((wrapped[0] as string).length), ...lines.slice(index + 1)].join("\n"),
      );
      return wrapped[1] as string;
    }
  }
  throw new Error(
    "lua surface: the source has no trailing `return <name>`, so the module-local name cannot be derived.",
  );
}

/** The parameter names between the parenthesis opened at `open` on line `index` and
 * the first `)` after it, on that line or a following one, with a `...` tail reported
 * separately. Throws when no `)` follows before the end of the source rather than
 * dropping the member. */
function readParams(
  lines: string[],
  index: number,
  open: number,
): { params: string[]; varargs: boolean } {
  const line = lines[index] as string;
  const rest = [line.slice(open + 1), ...lines.slice(index + 1)].join("\n");
  const close = rest.indexOf(")");
  if (close === -1) {
    throw new Error(
      `lua surface: line ${index + 1} opens a parameter list that never closes — ${line.trim()}`,
    );
  }
  const raw = rest
    .slice(0, close)
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  return { params: raw.filter((part) => part !== "..."), varargs: raw.includes("...") };
}

/** `line` with its quoted strings emptied and its trailing comment dropped, so the
 * braces left are the ones Lua reads. */
function stripStringsAndComment(line: string): string {
  return line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""').replace(/--.*$/, "");
}

function braceDelta(line: string): number {
  let delta = 0;
  for (const char of stripStringsAndComment(line)) {
    if (char === "{") delta += 1;
    else if (char === "}") delta -= 1;
  }
  return delta;
}

/** The depth-1 entries of the constructor whose `{` sits at `open` on line `index`, and
 * the line holding its matching `}`. An entry is read at the line that starts it, so a
 * nested table's keys stay out while its own entry counts. */
function readConstructor(
  lines: string[],
  index: number,
  open: number,
): { entries: LuaMember[]; close: number } {
  const opening = lines[index] as string;
  const inline = stripStringsAndComment(opening.slice(open + 1)).trim();
  if (inline === "}") return { entries: [], close: index };
  if (inline !== "") {
    throw new Error(
      `lua surface: line ${index + 1} puts constructor entries on the line that opens it, which this reader does not split — ${opening.trim()}`,
    );
  }
  const entries: LuaMember[] = [];
  let depth = 1;
  for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
    const line = lines[cursor] as string;
    const trimmed = line.trim();
    if (depth === 1 && trimmed !== "" && !trimmed.startsWith("--") && !trimmed.startsWith("}")) {
      const entry = CONSTRUCTOR_ENTRY.exec(line);
      if (!entry) {
        throw new Error(
          `lua surface: line ${cursor + 1} is a constructor entry that is not \`<name> = <value>\`, so its key is invisible — ${trimmed}`,
        );
      }
      const name = entry[1] as string;
      const rhs = entry[2] as string;
      if (FUNCTION_VALUE.test(rhs)) {
        const { params, varargs } = readParams(
          lines,
          cursor,
          line.indexOf("(", line.length - rhs.length),
        );
        entries.push({ name, params, varargs, ...readDoc(lines, cursor) });
      } else {
        entries.push({ name, varargs: false, ...readDoc(lines, cursor) });
      }
    }
    depth += braceDelta(line);
    if (depth <= 0) return { entries, close: cursor };
  }
  throw new Error(
    `lua surface: line ${index + 1} opens a constructor that never closes — ${opening.trim()}`,
  );
}

/** The contiguous run of comment lines ending at `index - 1`, in source order. */
function readSegment(lines: string[], index: number): string[] {
  const segment: string[] = [];
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const line = (lines[cursor] as string).trim();
    if (!line.startsWith("--") || line.startsWith("--[[")) break;
    segment.unshift(line);
  }
  return segment;
}

/** The contiguous comment block ending at `index - 1`, kept only when it opens
 * with `---`. LuaDoc in this corpus is a `---` summary followed by plain `--`
 * `@param`/`@return` lines, so the marker on the *first* line is what decides.
 *
 * A single blank line inside the run is crossed, and only when the segment
 * attached to the definition opens no block of its own — upstream wraps a long
 * `@param` list around a blank, which would otherwise truncate the block to its
 * tag half and lose the summary above. A segment carrying its own `---` is never
 * absorbed into the one below it, so a blank-separated section header stays out. */
function readDoc(lines: string[], index: number): Pick<LuaMember, "doc" | "refusedDoc"> {
  const attached = readSegment(lines, index);
  if (attached.length === 0) return { doc: "", refusedDoc: false };
  const above = index - attached.length - 1;
  const block =
    attached.some((line) => line.startsWith("---")) ||
    above < 0 ||
    (lines[above] as string).trim() !== ""
      ? attached
      : [...readSegment(lines, above), ...attached];
  if (!(block[0] as string).startsWith("---")) return { doc: "", refusedDoc: true };
  const doc = block
    .map((line) => line.replace(/^-+\s?/, "").trimEnd())
    .join("\n")
    .trim();
  return { doc, refusedDoc: false };
}

/**
 * The public surface of a Lua module source: the module-local name it returns — or the
 * one `options.moduleLocal` names — and every member assigned to it at column 0, in
 * source order. A name defined more than once keeps its first position and its last
 * definition, matching Lua.
 */
export function parseLuaSurface(source: string, options: LuaSurfaceOptions = {}): LuaSurface {
  const lines = source.split("\n");
  const moduleLocal = options.moduleLocal ?? resolveModuleLocal(lines);
  const definition = new RegExp(`^function\\s+${moduleLocal}\\.(${IDENTIFIER})\\s*\\(`);
  const assignment = new RegExp(`^${moduleLocal}\\.(${IDENTIFIER})\\s*=\\s*(.*)$`);
  const tableConstructor =
    options.moduleLocal === undefined
      ? new RegExp(`^(?:local\\s+)?${moduleLocal}\\s*=\\s*\\{`)
      : undefined;

  const members = new Map<string, LuaMember>();
  const record = (member: LuaMember): void => {
    members.set(member.name, member);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] as string;
    const opened = tableConstructor?.exec(line);
    if (opened) {
      const { entries, close } = readConstructor(lines, index, opened[0].length - 1);
      for (const entry of entries) record(entry);
      index = close;
      continue;
    }
    const defined = definition.exec(line);
    if (defined) {
      const { params, varargs } = readParams(lines, index, defined[0].length - 1);
      record({ name: defined[1] as string, params, varargs, ...readDoc(lines, index) });
      continue;
    }
    const assigned = assignment.exec(line);
    if (!assigned) continue;
    const name = assigned[1] as string;
    const rhs = assigned[2] as string;
    if (!FUNCTION_VALUE.test(rhs)) {
      record({ name, varargs: false, ...readDoc(lines, index) });
      continue;
    }
    const open = line.indexOf("(", line.length - rhs.length);
    const { params, varargs } = readParams(lines, index, open);
    record({ name, params, varargs, ...readDoc(lines, index) });
  }

  return { moduleLocal, members: [...members.values()] };
}
