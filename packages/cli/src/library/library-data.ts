// A library data folder holds one folder per library, named for its repo:
// `library.json` (the repo, its forks, its native extension, its index slots),
// `reviewed.json` (the ref the data was reviewed at), a `recipe.json` when the
// library generates modules, `fork/` for the hand-kept declarations, `source/`
// for the pinned upstream files and `usage/` for the examples that compile against
// its declarations. This is the one reader of that layout; every lane, registry
// and tool projects its targets from it.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, posix, sep, win32 } from "node:path";
import type { IndexSlotClassification } from "@defold-typescript/types";
import type { AuthoredTarget } from "./sync-authored-types";
import type { RefKind } from "./sync-defold-extensions";
import type { LualsTarget } from "./sync-luals-types";
import type { NativeTarget } from "./sync-native-types";
import type { OmittableSlot, ScriptApiTarget } from "./sync-script-api-types";

/**
 * Why a target's surface cannot be measured against upstream. A closed set: the
 * alternative to `upstreamLua` has to be a *chosen* category, because free prose
 * would let "nobody looked yet" and "looked, and it is genuinely unmeasurable"
 * read the same in the config.
 *
 * - `unresolved-path` — the `moduleId`-derived path does not resolve at the
 *   pinned `ref` (including a repository that no longer exists there).
 * - `no-module-file` — the upstream resolves but declares no single module file
 *   this target could be measured against.
 * - `unparseable-shape` — the module file exists but closes in a way
 *   `parseLuaSurface` refuses, such as a metatable that could delegate members
 *   no column-0 scan would find.
 */
export const PARITY_VERDICT_REASONS = [
  "no-module-file",
  "unresolved-path",
  "unparseable-shape",
] as const;

export type ParityVerdictReason = (typeof PARITY_VERDICT_REASONS)[number];

export interface ParityVerdict {
  reason: ParityVerdictReason;
  note: string;
}

export type IndexSlotEntry = Pick<IndexSlotClassification, "class" | "evidence">;

type PerLibrary = "repo" | "ref" | "license";

// Each entry is the lane's target without the fields the library holds once, and
// its paths relative to the library folder.
export type ForkEntry = Omit<AuthoredTarget, PerLibrary | "fidelity" | "upstreamLua"> & {
  fidelity?: string;
  upstreamLua?: string[];
};
export type NativeEntry = Omit<NativeTarget, PerLibrary | "refKind">;
export type LualsEntry = Omit<LualsTarget, PerLibrary | "typeRenames" | "ignore" | "sourceDir"> & {
  typeRenames?: Record<string, string>;
  ignore?: string[];
};
export type ScriptApiEntry = Omit<ScriptApiTarget, PerLibrary | "fidelity" | "sourceFile"> & {
  fidelity?: string;
};

export interface LibraryJson {
  repo: string;
  license?: string;
  refKind?: RefKind;
  forks?: ForkEntry[];
  native?: NativeEntry;
  indexSlots?: Record<string, IndexSlotEntry>;
}

export interface ReviewedJson {
  ref: string;
}

export interface RecipeJson {
  luals?: LualsEntry[];
  scriptApi?: ScriptApiEntry[];
}

export interface LibraryData {
  dir: string;
  repo: string;
  ref: string;
  license: string;
  refKind?: RefKind;
  luals: LualsTarget[];
  scriptApi: ScriptApiTarget[];
  authored: AuthoredTarget[];
  native: NativeTarget[];
  indexSlots: Record<string, IndexSlotEntry>;
  usage: string[];
}

export const LIBRARY_FILE = "library.json";
export const REVIEWED_FILE = "reviewed.json";
export const RECIPE_FILE = "recipe.json";
export const USAGE_DIR = "usage";
// Index slots of library pages no library folder owns: the extensions `resolve`
// types from a project's own archive.
export const EXTENSION_INDEX_SLOTS_FILE = "index-slot-classifications.json";

/** The folder a repo's library data sits in: its URL's last path segment, lowercased, without `.git`. */
export function libraryFolderName(repo: string): string {
  const segment = repo.replace(/\/+$/, "").split("/").pop() ?? "";
  return segment.replace(/\.git$/, "").toLowerCase();
}

/** The `library.json` a repo's entries live in, relative to the data folder. */
export function libraryFile(repo: string): string {
  return `${libraryFolderName(repo)}/${LIBRARY_FILE}`;
}

function readJson<T>(dataDir: string, path: string): T {
  const file = join(dataDir, path);
  if (!existsSync(file)) throw new Error(`library data holds no ${path}`);
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (error) {
    throw new Error(`${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function requireFields(
  file: string,
  entry: Record<string, unknown>,
  label: string,
  fields: readonly string[],
): void {
  for (const field of fields) {
    if (entry[field] === undefined) {
      throw new Error(`${file}: entry ${label} is missing required field "${field}".`);
    }
  }
}

function entryLabel(entry: { moduleId?: unknown }, index: number): string {
  return typeof entry.moduleId === "string" && entry.moduleId !== ""
    ? entry.moduleId
    : `index ${index}`;
}

// A module id names the `.d.ts` written into `.defold-types/`, so it must stay a
// single file name there.
const MODULE_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

function requireModuleId(file: string, label: string, field: string, value: unknown): string {
  if (typeof value !== "string" || !MODULE_ID.test(value)) {
    throw new Error(
      `${file}: entry ${label} has ${field} ${JSON.stringify(value)}, which is not a module id.`,
    );
  }
  return value;
}

function isAbsolutePath(path: string): boolean {
  return posix.isAbsolute(path) || win32.isAbsolute(path);
}

// A path the library folder holds, joined to the folder the way every reader
// joins it.
function underLibrary(file: string, dir: string, label: string, path: string): string {
  const joined = `${dir}/${path}`;
  // A path the entry leaves out is a missing field, not one outside the folder;
  // the lane that reads it reports it.
  if (typeof path !== "string") return joined;
  if (
    isAbsolutePath(path) ||
    !posix.normalize(joined.replaceAll("\\", "/")).startsWith(`${dir}/`)
  ) {
    throw new Error(`${file}: entry ${label} names ${path}, which is outside ${dir}/.`);
  }
  return joined;
}

// A source glob is matched against the upstream tree, whose paths are relative
// and never step up, so a glob that is absolute or steps up selects nothing.
function requireSourceGlob(file: string, dir: string, label: string, glob: string): string {
  if (isAbsolutePath(glob) || glob.replaceAll("\\", "/").split("/").includes("..")) {
    throw new Error(`${file}: entry ${label} has source glob ${glob}, which is outside ${dir}/.`);
  }
  return glob;
}

const LUALS_REQUIRED = ["sourceGlobs", "moduleId", "namespace"] as const;
const SCRIPT_API_REQUIRED = ["scriptApi", "moduleId", "namespace", "apiDoc"] as const;
const FORK_REQUIRED = ["authored", "moduleId", "namespace", "apiDoc"] as const;

/** Validate the parity declaration: exactly one of a non-empty `upstreamLua` and
 * a well-formed `parityVerdict`. Enforced here rather than as required fields
 * because neither field is required on its own — the bijection between them is
 * the gate. */
function validateParityDeclaration(
  file: string,
  label: string,
  upstreamLua: string[],
  verdict: ParityVerdict | undefined,
): void {
  if (upstreamLua.length > 0 && verdict !== undefined) {
    throw new Error(
      `${file}: entry ${label} declares both upstreamLua and parityVerdict — a measured target carries no verdict.`,
    );
  }
  if (upstreamLua.length === 0 && verdict === undefined) {
    throw new Error(
      `${file}: entry ${label} declares neither upstreamLua nor parityVerdict — vendor its upstream .lua, or record a parityVerdict saying why it cannot be measured.`,
    );
  }
  if (verdict === undefined) return;
  if (!(PARITY_VERDICT_REASONS as readonly string[]).includes(verdict.reason)) {
    throw new Error(
      `${file}: entry ${label} has parityVerdict reason "${verdict.reason}", which is not one of ${PARITY_VERDICT_REASONS.join(", ")}.`,
    );
  }
  if (typeof verdict.note !== "string" || verdict.note.trim() === "") {
    throw new Error(
      `${file}: entry ${label} has a parityVerdict with an empty note — say what was looked at and why it could not be measured.`,
    );
  }
}

interface Pin {
  repo: string;
  ref: string;
  license: string | undefined;
}

function lualsTargets(dir: string, pin: Pin, entries: Partial<LualsEntry>[]): LualsTarget[] {
  const file = `${dir}/${RECIPE_FILE}`;
  return entries.map((entry, index) => {
    const label = entryLabel(entry, index);
    requireFields(file, entry, label, LUALS_REQUIRED);
    const sourceDir = underLibrary(file, dir, label, `source/${entry.namespace as string}`);
    return {
      repo: pin.repo,
      ref: pin.ref,
      sourceGlobs: (entry.sourceGlobs as string[]).map((glob) =>
        requireSourceGlob(file, dir, label, glob),
      ),
      moduleId: requireModuleId(file, label, "moduleId", entry.moduleId),
      namespace: entry.namespace as string,
      typeRenames: entry.typeRenames ?? {},
      ignore: entry.ignore ?? [],
      ...(pin.license !== undefined ? { license: pin.license } : {}),
      ...(entry.annotationOverrides !== undefined
        ? { annotationOverrides: entry.annotationOverrides }
        : {}),
      ...(entry.externalTypes !== undefined ? { externalTypes: entry.externalTypes } : {}),
      sourceDir,
    };
  });
}

function scriptApiTargets(
  dir: string,
  pin: Pin,
  entries: Partial<ScriptApiEntry>[],
): ScriptApiTarget[] {
  const file = `${dir}/${RECIPE_FILE}`;
  return entries.map((entry, index) => {
    const label = entryLabel(entry, index);
    requireFields(file, entry, label, SCRIPT_API_REQUIRED);
    const omittableSlots = (entry.omittableSlots ?? []).map((slot, slotIndex) => {
      for (const field of ["element", "slot", "evidence"] as const) {
        const value = (slot as Partial<OmittableSlot>)[field];
        if (typeof value !== "string" || value.trim() === "") {
          throw new Error(
            `${file}: entry ${label} omittableSlots[${slotIndex}] needs a non-empty "${field}".`,
          );
        }
      }
      return slot;
    });
    const moduleId = requireModuleId(file, label, "moduleId", entry.moduleId);
    return {
      repo: pin.repo,
      ref: pin.ref,
      scriptApi: entry.scriptApi as string,
      moduleId,
      namespace: entry.namespace as string,
      apiDoc: entry.apiDoc as string,
      fidelity: entry.fidelity ?? `fidelity/${entry.namespace as string}.json`,
      license: pin.license ?? "",
      ...(omittableSlots.length > 0 ? { omittableSlots } : {}),
      sourceFile: `${dir}/source/${moduleId}.script_api`,
    };
  });
}

function authoredTargets(dir: string, pin: Pin, entries: Partial<ForkEntry>[]): AuthoredTarget[] {
  const file = `${dir}/${LIBRARY_FILE}`;
  return entries.map((entry, index) => {
    const label = entryLabel(entry, index);
    requireFields(file, entry, label, FORK_REQUIRED);
    const upstreamLua = entry.upstreamLua ?? [];
    validateParityDeclaration(file, label, upstreamLua, entry.parityVerdict);
    if (
      entry.instanceType !== undefined &&
      (typeof entry.instanceType !== "string" || !/^[A-Za-z_$][\w$]*$/.test(entry.instanceType))
    ) {
      throw new Error(
        `${file}: entry ${label} has instanceType ${JSON.stringify(entry.instanceType)}, which is not a type name.`,
      );
    }
    if (entry.instanceType !== undefined && upstreamLua.length === 0) {
      throw new Error(
        `${file}: entry ${label} declares instanceType but vendors no upstreamLua, so no method is measured against it.`,
      );
    }
    return {
      repo: pin.repo,
      ref: pin.ref,
      authored: underLibrary(file, dir, label, entry.authored as string),
      moduleId: requireModuleId(file, label, "moduleId", entry.moduleId),
      namespace: entry.namespace as string,
      apiDoc: entry.apiDoc as string,
      fidelity: entry.fidelity ?? `fidelity/${entry.namespace as string}.json`,
      license: pin.license ?? "",
      upstreamLua: upstreamLua.map((path) => underLibrary(file, dir, label, path)),
      ...(entry.instanceType === undefined ? {} : { instanceType: entry.instanceType }),
      ...(entry.parityVerdict === undefined ? {} : { parityVerdict: entry.parityVerdict }),
    };
  });
}

function nativeTarget(
  dir: string,
  pin: Pin,
  refKind: RefKind | undefined,
  entry: NativeEntry,
): NativeTarget {
  const file = `${dir}/${LIBRARY_FILE}`;
  const under = (path: string): string => underLibrary(file, dir, "native", path);
  return {
    repo: pin.repo,
    ref: pin.ref,
    ...(refKind === undefined ? {} : { refKind }),
    license: pin.license ?? "",
    ...entry,
    namespace: requireModuleId(file, "native", "namespace", entry.namespace),
    declaration: under(entry.declaration),
    upstreamSource: under(entry.upstreamSource),
    ...(entry.upstreamHeaders === undefined
      ? {}
      : { upstreamHeaders: entry.upstreamHeaders.map(under) }),
    ...(entry.upstreamMethodSources === undefined
      ? {}
      : { upstreamMethodSources: entry.upstreamMethodSources.map(under) }),
    ...(entry.upstreamAnnotation === undefined
      ? {}
      : { upstreamAnnotation: under(entry.upstreamAnnotation) }),
  };
}

function usageFiles(dataDir: string, dir: string): string[] {
  const usageDir = join(dataDir, dir, USAGE_DIR);
  if (!existsSync(usageDir)) return [];
  return readdirSync(usageDir, { recursive: true })
    .map((file) => String(file).split(sep).join("/"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => `${dir}/${USAGE_DIR}/${file}`)
    .sort();
}

function readLibrary(dataDir: string, dir: string): LibraryData {
  const library = readJson<Partial<LibraryJson>>(dataDir, `${dir}/${LIBRARY_FILE}`);
  if (typeof library.repo !== "string") {
    throw new Error(`${dir}/${LIBRARY_FILE} names no repo`);
  }
  const expected = libraryFolderName(library.repo);
  if (expected !== dir) {
    throw new Error(
      `${dir}/${LIBRARY_FILE}: repo ${library.repo} belongs in folder ${expected}, not ${dir}`,
    );
  }
  const { ref } = readJson<Partial<ReviewedJson>>(dataDir, `${dir}/${REVIEWED_FILE}`);
  if (typeof ref !== "string" || ref === "") {
    throw new Error(`${dir}/${REVIEWED_FILE} names no ref`);
  }
  const recipe = existsSync(join(dataDir, dir, RECIPE_FILE))
    ? readJson<RecipeJson>(dataDir, `${dir}/${RECIPE_FILE}`)
    : {};
  const pin: Pin = { repo: library.repo, ref, license: library.license };
  return {
    dir,
    repo: library.repo,
    ref,
    license: library.license ?? "",
    ...(library.refKind === undefined ? {} : { refKind: library.refKind }),
    luals: lualsTargets(dir, pin, recipe.luals ?? []),
    scriptApi: scriptApiTargets(dir, pin, recipe.scriptApi ?? []),
    authored: authoredTargets(dir, pin, library.forks ?? []),
    native:
      library.native === undefined ? [] : [nativeTarget(dir, pin, library.refKind, library.native)],
    indexSlots: library.indexSlots ?? {},
    usage: usageFiles(dataDir, dir),
  };
}

/** A refusal of library data, naming the library folder at fault. */
export class LibraryDataError extends Error {
  readonly library: string;

  constructor(library: string, message: string) {
    super(message);
    this.name = "LibraryDataError";
    this.library = library;
  }
}

/**
 * Every library folder under `dataDir` in folder-name order. Paths the targets
 * name are relative to `dataDir` (`flow/fork/flow.ui.d.ts`); `apiDoc` and
 * `fidelity` stay relative to the library-types package root, where the toolchain
 * writes them. Throws a `LibraryDataError` on a folder whose name is not its
 * repo's, on a missing `reviewed.json`, on a malformed entry, on a module id or
 * path that leaves its folder, and on a module two folders name.
 */
export function readLibraryData(dataDir: string): LibraryData[] {
  const dirs = readdirSync(dataDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(dataDir, entry.name, LIBRARY_FILE)))
    .map((entry) => entry.name)
    .sort();
  const libraries = dirs.map((dir) => {
    try {
      return readLibrary(dataDir, dir);
    } catch (error) {
      throw new LibraryDataError(dir, error instanceof Error ? error.message : String(error));
    }
  });
  const owner = new Map<string, string>();
  for (const library of libraries) {
    for (const { moduleId } of [...library.luals, ...library.scriptApi, ...library.authored]) {
      const other = owner.get(moduleId);
      if (other !== undefined && other !== library.dir) {
        throw new LibraryDataError(
          library.dir,
          `module ${moduleId} is named by both ${other} and ${library.dir}`,
        );
      }
      owner.set(moduleId, library.dir);
    }
  }
  return libraries;
}

/** Every library's index slots, with those of the extension pages no library owns. */
export function readIndexSlots(dataDir: string): Record<string, IndexSlotEntry> {
  const extensionFile = join(dataDir, EXTENSION_INDEX_SLOTS_FILE);
  const merged: Record<string, IndexSlotEntry> = existsSync(extensionFile)
    ? (JSON.parse(readFileSync(extensionFile, "utf8")) as Record<string, IndexSlotEntry>)
    : {};
  for (const library of readLibraryData(dataDir)) {
    for (const [key, entry] of Object.entries(library.indexSlots)) {
      if (key in merged) {
        throw new Error(`index slot ${key} is classified twice, once in ${library.dir}`);
      }
      merged[key] = entry;
    }
  }
  return merged;
}

function writeJson(dataDir: string, folder: string, file: string, value: unknown): void {
  mkdirSync(join(dataDir, folder), { recursive: true });
  writeFileSync(join(dataDir, folder, file), `${JSON.stringify(value, null, 2)}\n`);
}

/** Write a library's `library.json` into the folder its repo names, which it returns. */
export function writeLibraryJson(dataDir: string, library: LibraryJson): string {
  const folder = libraryFolderName(library.repo);
  writeJson(dataDir, folder, LIBRARY_FILE, library);
  return folder;
}

export function writeReviewedJson(dataDir: string, folder: string, reviewed: ReviewedJson): void {
  writeJson(dataDir, folder, REVIEWED_FILE, reviewed);
}

export function writeRecipeJson(dataDir: string, folder: string, recipe: RecipeJson): void {
  writeJson(dataDir, folder, RECIPE_FILE, recipe);
}
