// The API model the docs site renders, lowered from a library data folder alone,
// through the lowering of the lane that serves each module. The openapi and
// markdown lanes read their targets from the library-types package, not from
// library data, and keep their own `--api-doc` runs.

import { API_DOC_DIR, readLibraryData } from "./library-data";
import { lowerAuthoredApiDoc } from "./sync-authored-types";
import { lowerLualsApiDoc } from "./sync-luals-types";
import { lowerNativeApiDoc, nativeApiDocPath } from "./sync-native-types";
import { lowerScriptApiApiDoc } from "./sync-script-api-types";

/**
 * Each API model in the data folder at `dataDir`, by its path under `api-doc/`.
 * Throws when two targets name the same path, since one would replace the other,
 * and when two paths differ only by case or one uses another as a folder, since
 * those lose a model or stop a write partway on some hosts. Every host refuses
 * them, so a data folder gets the same result everywhere.
 */
export async function libraryApiDocs(dataDir: string): Promise<ReadonlyMap<string, string>> {
  const docs = new Map<string, string>();
  const pathByLowercase = new Map<string, string>();
  const add = (path: string, contents: string): void => {
    if (docs.has(path)) throw new Error(`library data names api-doc path ${path} twice`);
    const sameFile = pathByLowercase.get(path.toLowerCase());
    if (sameFile !== undefined) {
      throw new Error(
        `library data names api-doc paths ${sameFile} and ${path}, which differ only by case`,
      );
    }
    pathByLowercase.set(path.toLowerCase(), path);
    docs.set(path, contents);
  };
  const underApiDoc = (apiDoc: string): string => apiDoc.slice(API_DOC_DIR.length + 1);
  for (const library of readLibraryData(dataDir)) {
    for (const target of library.luals) {
      add(`${target.namespace}.json`, lowerLualsApiDoc(dataDir, target));
    }
    for (const target of library.scriptApi) {
      add(underApiDoc(target.apiDoc), await lowerScriptApiApiDoc(dataDir, target));
    }
    for (const target of library.authored) {
      add(underApiDoc(target.apiDoc), lowerAuthoredApiDoc(dataDir, target));
    }
    for (const target of library.native) {
      add(underApiDoc(nativeApiDocPath(target)), lowerNativeApiDoc(dataDir, target));
    }
  }
  for (const path of pathByLowercase.keys()) {
    for (let end = path.indexOf("/"); end !== -1; end = path.indexOf("/", end + 1)) {
      const file = pathByLowercase.get(path.slice(0, end));
      if (file !== undefined) {
        throw new Error(`library data names api-doc path ${file} as both a file and a folder`);
      }
    }
  }
  return docs;
}
