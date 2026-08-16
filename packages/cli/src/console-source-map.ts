import { existsSync, readFileSync, statSync } from "node:fs";
import * as path from "node:path";

/** `[generatedColumn, sourceIndex, sourceLine, sourceColumn]`, all zero-based. */
export type MappingSegment = readonly [number, number, number, number];

export interface ChunkLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

export interface ConsoleErrorLocation {
  readonly chunk: string;
  readonly chunkLine: number;
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function decodeField(field: string): number[] {
  const values: number[] = [];
  let shift = 0;
  let accumulated = 0;
  for (const char of field) {
    const digit = BASE64.indexOf(char);
    if (digit < 0) throw new Error(`console source map: unmappable VLQ character ${char}`);
    accumulated += (digit & 31) << shift;
    if ((digit & 32) !== 0) {
      shift += 5;
      continue;
    }
    const magnitude = accumulated >> 1;
    values.push((accumulated & 1) === 1 ? -magnitude : magnitude);
    shift = 0;
    accumulated = 0;
  }
  return values;
}

/**
 * Decodes a v3 `mappings` string into one segment list per generated line.
 * Source index, line, and column accumulate across the whole string while the
 * generated column restarts on every line, per the spec.
 */
export function decodeMappings(mappings: string): MappingSegment[][] {
  const lines: MappingSegment[][] = [];
  let sourceIndex = 0;
  let sourceLine = 0;
  let sourceColumn = 0;
  for (const group of mappings.split(";")) {
    const segments: MappingSegment[] = [];
    let generatedColumn = 0;
    for (const field of group.split(",")) {
      if (field === "") continue;
      const values = decodeField(field);
      generatedColumn += values[0] ?? 0;
      // A one-field segment marks generated text with no source at all. It
      // carries no location, so it must never stand in for the line's mapping.
      if (values.length < 4) continue;
      sourceIndex += values[1] as number;
      sourceLine += values[2] as number;
      sourceColumn += values[3] as number;
      segments.push([generatedColumn, sourceIndex, sourceLine, sourceColumn]);
    }
    lines.push(segments);
  }
  return lines;
}

interface ParsedMap {
  /** Per `sources` entry, the `cwd`-relative file it names, or `null` when none. */
  readonly files: readonly (string | null)[];
  readonly lines: readonly MappingSegment[][];
}

interface CacheEntry {
  readonly mtimeMs: number;
  readonly size: number;
  readonly parsed: ParsedMap | null;
}

// mtime-and-size keyed, never path keyed: a `watch` is long-lived and each
// rebuild rewrites these maps in place, so a path-keyed entry would keep
// reporting locations from a build two edits ago. The negative result is cached
// the same way so a per-frame error in a project whose maps do not parse does
// not re-read the file for every line.
const parsedMaps = new Map<string, CacheEntry>();

/**
 * The `cwd`-relative file a `sources` entry names, or `null` when it names none
 * that may be reported: `sources` holds a bare basename, so it resolves against
 * the map's own directory plus the `sourceRoot` the build wrote there. A result
 * that leaves the project is not a project-relative authored path, and one that
 * is not on disk was not found — a location is only ever reported for a file
 * that is really there.
 */
function resolveSource(
  cwd: string,
  rel: string,
  sourceRoot: string,
  source: string,
): string | null {
  const segments = [path.posix.dirname(rel), ...(sourceRoot === "" ? [] : [sourceRoot])];
  const resolved = path.posix.join(...segments, source);
  if (path.posix.isAbsolute(resolved) || resolved === ".." || resolved.startsWith("../")) {
    return null;
  }
  return existsSync(path.join(cwd, resolved)) ? resolved : null;
}

/**
 * Parses the map beside `rel` and resolves its sources once, so the existence
 * result is cached with the map and refreshes exactly when a rebuild rewrites
 * it — which is the only way a source deleted under a live `watch` comes back.
 */
function loadMap(cwd: string, rel: string): ParsedMap | null {
  const mapPath = path.join(cwd, `${rel}.map`);
  let mtimeMs: number;
  let size: number;
  try {
    ({ mtimeMs, size } = statSync(mapPath));
  } catch {
    return null;
  }
  const cached = parsedMaps.get(mapPath);
  if (cached !== undefined && cached.mtimeMs === mtimeMs && cached.size === size) {
    return cached.parsed;
  }
  let parsed: ParsedMap | null = null;
  try {
    const raw = JSON.parse(readFileSync(mapPath, "utf8")) as Record<string, unknown>;
    const { sources, sourceRoot, mappings } = raw;
    if (
      Array.isArray(sources) &&
      sources.every((entry) => typeof entry === "string") &&
      typeof mappings === "string"
    ) {
      const root = typeof sourceRoot === "string" ? sourceRoot : "";
      parsed = {
        files: (sources as readonly string[]).map((source) =>
          resolveSource(cwd, rel, root, source),
        ),
        lines: decodeMappings(mappings),
      };
    }
  } catch {
    parsed = null;
  }
  parsedMaps.set(mapPath, { mtimeMs, size, parsed });
  return parsed;
}

/**
 * Resolves one generated location to its authored one, or `null` when the map
 * cannot answer. A miss never invents a location: the nearest segment on a
 * neighbouring line is not consulted, because a wrong `.ts` line is worse for
 * the reader than an honest generated one.
 */
export function lookupChunkLocation(
  cwd: string,
  chunkPath: string,
  line: number,
): ChunkLocation | null {
  // Defold reports a resource path (`/main/main.script`); the build wrote that
  // chunk at the same path relative to the project root.
  const rel = chunkPath.startsWith("/") ? chunkPath.slice(1) : chunkPath;
  const map = loadMap(cwd, rel);
  if (map === null) return null;
  const first = map.lines[line - 1]?.[0];
  if (first === undefined) return null;
  const file = map.files[first[1]];
  if (file === undefined || file === null) return null;
  return { file, line: first[2] + 1, column: first[3] + 1 };
}

const CHUNK_REFERENCE =
  /(?<![\w.])(\/?[\w./-]+\.(?:script|gui_script|render_script|editor_script|lua)):(\d+)/g;

/**
 * Rewrites every resolvable chunk reference on a console line as
 * `<authored>:<line>:<column> (<raw>)`. The raw location always survives, and a
 * reference the map cannot answer is left exactly as the console sent it.
 */
export function mapConsoleLine(cwd: string, line: string): string {
  return line.replace(CHUNK_REFERENCE, (raw: string, chunk: string, chunkLine: string) => {
    const found = lookupChunkLocation(cwd, chunk, Number(chunkLine));
    return found === null ? raw : `${found.file}:${found.line}:${found.column} (${raw})`;
  });
}

/** The structured form of what {@link mapConsoleLine} rewrote, in line order. */
export function consoleLineLocations(cwd: string, line: string): ConsoleErrorLocation[] {
  const locations: ConsoleErrorLocation[] = [];
  for (const match of line.matchAll(CHUNK_REFERENCE)) {
    const chunk = match[1] as string;
    const chunkLine = Number(match[2]);
    const found = lookupChunkLocation(cwd, chunk, chunkLine);
    if (found === null) continue;
    locations.push({
      chunk,
      chunkLine,
      file: found.file,
      line: found.line,
      column: found.column,
    });
  }
  return locations;
}
