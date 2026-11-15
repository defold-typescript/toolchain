import * as path from "node:path";
import * as ts from "typescript";

/**
 * A `tsconfig.json` as TypeScript reads it, `extends` chain included.
 *
 * Each file list comes back twice. `include`/`exclude` are the entries as a
 * config would spell them, inherited ones rebased onto this config's folder and
 * a `${configDir}` entry left as written, so a writer can copy them into this
 * config. `includeRelative`/`excludeRelative` are the same entries relative to
 * this config's folder with `${configDir}` dropped, for every use as a path.
 * An absolute entry stays absolute in both, and neither is ever made absolute.
 */
export interface EffectiveTsconfig {
  readonly include: string[] | undefined;
  readonly exclude: string[] | undefined;
  readonly includeRelative: string[] | undefined;
  readonly excludeRelative: string[] | undefined;
  /**
   * With forward slashes: the config's own value as written, or an inherited or
   * `${configDir}` one relative to this config's folder.
   */
  readonly outDir: string | undefined;
  readonly options: ts.CompilerOptions;
  readonly fileNames: string[];
}

// "No inputs were found in config file": a config read only for its settings,
// or a project with no sources yet, is still a config.
const NO_INPUTS = 18003;
// biome-ignore lint/suspicious/noTemplateCurlyInString: TypeScript's own config placeholder, written literally
const CONFIG_DIR = "${configDir}";

// A UNC share, a drive, or a leading slash. TypeScript reads each of these as a
// root on every OS, so one is never folded away or rebased.
const ROOT_RE = /^(\/\/[^/]+\/[^/]+|[A-Za-z]:\/?|\/)/;

function normalizeEntry(entry: string): string {
  const slashed = entry.replace(/\\/g, "/");
  const root = ROOT_RE.exec(slashed)?.[0] ?? "";
  const segments: string[] = [];
  for (const segment of slashed.slice(root.length).split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      const last = segments[segments.length - 1];
      if (last !== undefined && last !== "..") {
        segments.pop();
      } else if (root === "") {
        segments.push(segment);
      }
      continue;
    }
    segments.push(segment);
  }
  const rest = segments.join("/");
  if (root === "") {
    return rest === "" ? "." : rest;
  }
  if (rest === "") {
    return root;
  }
  return root.endsWith("/") ? `${root}${rest}` : `${root}/${rest}`;
}

function asWritten(entry: string): string {
  return entry.startsWith(CONFIG_DIR) ? entry : normalizeEntry(entry);
}

function relativeToConfig(entry: string): string {
  if (!entry.startsWith(CONFIG_DIR)) {
    return normalizeEntry(entry);
  }
  return normalizeEntry(entry.slice(CONFIG_DIR.length).replace(/^[\\/]/, ""));
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : undefined;
}

function diagnosticMessage(configPath: string, diagnostic: ts.Diagnostic): string {
  const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
  const file = diagnostic.file?.fileName ?? configPath;
  return `${file}: ${text}`;
}

export function readEffectiveTsconfig(
  configPath: string,
  readFile: (filePath: string) => string | undefined,
  readDirectory?: ts.ParseConfigHost["readDirectory"],
): EffectiveTsconfig {
  // A rooted path is kept as given: the editor host names files the way it
  // names them, and resolving `/project` on Windows would add a drive it lacks.
  const slashed = configPath.replace(/\\/g, "/");
  const absolute = ROOT_RE.test(slashed) ? slashed : path.resolve(configPath).replace(/\\/g, "/");
  const configDir = path.posix.dirname(absolute);
  const read = ts.readConfigFile(absolute, readFile);
  if (read.error !== undefined) {
    throw new Error(diagnosticMessage(absolute, read.error));
  }
  const host: ts.ParseConfigHost = {
    useCaseSensitiveFileNames: ts.sys?.useCaseSensitiveFileNames ?? true,
    readDirectory: readDirectory ?? (() => []),
    fileExists: (filePath) => readFile(filePath) !== undefined,
    readFile,
  };
  const parsed = ts.parseJsonConfigFileContent(read.config, host, configDir, undefined, absolute);
  const error = parsed.errors.find((diagnostic) => diagnostic.code !== NO_INPUTS);
  if (error !== undefined) {
    throw new Error(diagnosticMessage(absolute, error));
  }
  const raw = parsed.raw as {
    include?: unknown;
    exclude?: unknown;
    compilerOptions?: { outDir?: unknown };
  };
  const include = stringList(raw.include);
  const exclude = stringList(raw.exclude);
  // The config's own `outDir` keeps its spelling, so a message about it quotes
  // what the user wrote; an inherited or `${configDir}` one is rebased here.
  const ownOutDir = raw.compilerOptions?.outDir;
  const outDir = parsed.options.outDir;
  return {
    include: include?.map(asWritten),
    exclude: exclude?.map(asWritten),
    includeRelative: include?.map(relativeToConfig),
    excludeRelative: exclude?.map(relativeToConfig),
    outDir:
      typeof ownOutDir === "string" && !ownOutDir.includes(CONFIG_DIR)
        ? ownOutDir.replace(/\\/g, "/")
        : outDir === undefined
          ? undefined
          : path.posix.relative(configDir, outDir.replace(/\\/g, "/")),
    options: parsed.options,
    fileNames: parsed.fileNames,
  };
}
