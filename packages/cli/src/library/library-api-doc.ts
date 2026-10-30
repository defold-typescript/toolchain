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
 * Throws when two targets name the same path, since one would replace the other.
 */
export async function libraryApiDocs(dataDir: string): Promise<ReadonlyMap<string, string>> {
  const docs = new Map<string, string>();
  const add = (path: string, contents: string): void => {
    if (docs.has(path)) throw new Error(`library data names api-doc path ${path} twice`);
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
  return docs;
}
