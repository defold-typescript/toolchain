// Every module `resolve` serves, printed from the sources library data pins, as
// `resolve` prints it for a project whose dependency archive is not at hand. The
// checks, tools and docs pages that describe the corpus read this print, so they
// see exactly what a user is given.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { printLibraryModules, servedModules } from "./print-library";

const corpora = new Map<string, Promise<ReadonlyMap<string, string>>>();

async function printAll(root: string): Promise<ReadonlyMap<string, string>> {
  const { printed, unprintable } = await printLibraryModules(root, servedModules(root), null);
  if (unprintable.length > 0) {
    throw new Error(`library data serves modules it cannot print: ${unprintable.join(", ")}`);
  }
  return new Map(printed.map(({ module, contents }) => [module, contents]));
}

// Memoized per root for the process: many suites read the whole corpus.
export function printCorpus(root: string): Promise<ReadonlyMap<string, string>> {
  let corpus = corpora.get(root);
  if (corpus === undefined) {
    corpus = printAll(root);
    corpora.set(root, corpus);
  }
  return corpus;
}

export async function printedModule(root: string, moduleId: string): Promise<string> {
  const contents = (await printCorpus(root)).get(moduleId);
  if (contents === undefined) throw new Error(`library data serves no module ${moduleId}`);
  return contents;
}

// Writes `<moduleId>.d.ts` per printed module and returns the paths written.
export async function writePrintedCorpus(root: string, dir: string): Promise<string[]> {
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const [moduleId, contents] of await printCorpus(root)) {
    const file = join(dir, `${moduleId}.d.ts`);
    writeFileSync(file, contents);
    written.push(file);
  }
  return written;
}
