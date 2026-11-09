// Prints the declarations of the library modules a project's dependencies
// confirm, through the generator of the lane that serves each one. The LuaLS and
// script_api lanes read the dependency's own archive; when that archive cannot be
// printed — a version our corrections do not fit, a moved module file — they print
// the sources library data pins instead and say why, so a user is never left with
// less than the pinned version. The authored lane prints its fork, which no
// archive changes.

import { type ReadLibraryOptions, readLibraryData } from "./library-data";
import type { LibrarySourceTree } from "./source-tree";
import { type AuthoredTarget, emitAuthoredDeclaration } from "./sync-authored-types";
import { emitLualsTargetDeclarations, type LualsTarget } from "./sync-luals-types";
import { emitScriptApiDeclaration, type ScriptApiTarget } from "./sync-script-api-types";

type ServedTarget =
  | { readonly lane: "luals"; readonly target: LualsTarget }
  | { readonly lane: "script-api"; readonly target: ScriptApiTarget }
  | { readonly lane: "authored"; readonly target: AuthoredTarget };

export interface PrintedLibraryModule {
  readonly module: string;
  readonly contents: string;
  // `pinned` for a lane that prints from library data alone, and for an archive
  // that could not be printed, which `reason` then explains.
  readonly from: "archive" | "pinned";
  // The upstream ref library data pins the module's sources to.
  readonly ref: string;
  readonly reason?: string;
}

export interface PrintLibraryModulesResult {
  readonly printed: PrintedLibraryModule[];
  readonly unprintable: string[];
}

function servedTargets(root: string, read: ReadLibraryOptions): Map<string, ServedTarget> {
  const served = new Map<string, ServedTarget>();
  const add = (entry: ServedTarget): void => {
    const { moduleId } = entry.target;
    const existing = served.get(moduleId);
    if (existing !== undefined) {
      throw new Error(
        `library data names module ${moduleId} in both its ${existing.lane} and ${entry.lane} targets`,
      );
    }
    served.set(moduleId, entry);
  };
  const libraries = readLibraryData(root, read);
  for (const target of libraries.flatMap(({ luals }) => luals)) add({ lane: "luals", target });
  for (const target of libraries.flatMap(({ scriptApi }) => scriptApi)) {
    add({ lane: "script-api", target });
  }
  for (const target of libraries.flatMap(({ authored }) => authored)) {
    add({ lane: "authored", target });
  }
  return served;
}

export function servedModules(root: string, read: ReadLibraryOptions = {}): string[] {
  return [...servedTargets(root, read).keys()];
}

// With no tree, each lane reads the sources vendored in library data.
async function printTarget(
  root: string,
  entry: ServedTarget,
  read: ReadLibraryOptions,
  tree?: LibrarySourceTree,
): Promise<string> {
  switch (entry.lane) {
    case "luals":
      return emitLualsTargetDeclarations(root, entry.target, tree, read);
    case "script-api":
      return emitScriptApiDeclaration(root, entry.target, tree, read);
    case "authored":
      return emitAuthoredDeclaration(root, entry.target);
  }
}

export async function printLibraryModules(
  root: string,
  modules: readonly string[],
  archive: LibrarySourceTree | null,
  read: ReadLibraryOptions = {},
): Promise<PrintLibraryModulesResult> {
  const served = servedTargets(root, read);
  const printed: PrintedLibraryModule[] = [];
  const unprintable: string[] = [];
  for (const module of modules) {
    const entry = served.get(module);
    if (entry === undefined) {
      unprintable.push(module);
      continue;
    }
    const { ref } = entry.target;
    if (archive === null || entry.lane === "authored") {
      printed.push({ module, contents: await printTarget(root, entry, read), from: "pinned", ref });
      continue;
    }
    try {
      const contents = await printTarget(root, entry, read, archive);
      printed.push({ module, contents, from: "archive", ref });
    } catch (error) {
      printed.push({
        module,
        contents: await printTarget(root, entry, read),
        from: "pinned",
        ref,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { printed, unprintable };
}
