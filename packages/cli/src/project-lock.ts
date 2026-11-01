// What `resolve` recorded, in a committed file of its own: `package.json` is edited
// by hand, and a record there is lost whenever that file does not parse. Maps are
// sorted with one entry per line, so branches touching different entries merge
// cleanly. A value here reaches cache paths and download URLs, so reading checks
// every one rather than trusting a file that a merge can leave in any state.

import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { COMMIT_COMMENT } from "./extension-version";

export const PROJECT_LOCK_FILE = "defold-typescript.lock";

const LOCK_VERSION = 1;
const PIN = /^(commit:[0-9a-f]{40}|files-sha256:[0-9a-f]{64})$/;
// A library key becomes a folder name under the cache, so it is one path segment.
const LIBRARY_KEY = /^(?!\.{1,2}$)[A-Za-z0-9._-]+$/;

// `shared` is the commit `index-slot-classifications.json` is read from, the one
// data file no library owns; `libraries` is the commit each used library is read from.
export interface LibraryDataPins {
  readonly shared: string;
  readonly libraries: Readonly<Record<string, string>>;
}

export interface ProjectLock {
  readonly extensions: Readonly<Record<string, string>>;
  readonly libraryData?: LibraryDataPins;
}

export type ProjectLockRead =
  | { readonly status: "absent" }
  | { readonly status: "ok"; readonly lock: ProjectLock }
  | { readonly status: "invalid"; readonly reason: string };

function invalid(detail: string): ProjectLockRead {
  return { status: "invalid", reason: `${PROJECT_LOCK_FILE} ${detail}` };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readProjectLock(cwd: string): ProjectLockRead {
  const path = join(cwd, PROJECT_LOCK_FILE);
  if (!existsSync(path)) {
    return { status: "absent" };
  }
  let root: unknown;
  try {
    root = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return invalid(
      "does not parse: resolve any conflict markers, or delete the file to record afresh",
    );
  }
  if (!isPlainObject(root)) {
    return invalid("must hold a JSON object");
  }
  if (root.version !== LOCK_VERSION) {
    return invalid(`has "version" ${JSON.stringify(root.version)}, expected ${LOCK_VERSION}`);
  }
  const extensions = root.extensions ?? {};
  if (!isPlainObject(extensions)) {
    return invalid('has an "extensions" value that is not a map');
  }
  for (const [url, pin] of Object.entries(extensions)) {
    if (typeof pin !== "string" || !PIN.test(pin)) {
      return invalid(
        `has "extensions" entry ${url} in neither form: commit:<40 hex> or files-sha256:<hex>`,
      );
    }
  }
  const { libraryData } = root;
  if (libraryData === undefined) {
    return { status: "ok", lock: { extensions: extensions as Record<string, string> } };
  }
  if (!isPlainObject(libraryData)) {
    return invalid('has a "libraryData" value that is not a map');
  }
  const { shared, libraries } = libraryData;
  if (typeof shared !== "string" || !COMMIT_COMMENT.test(shared)) {
    return invalid('has a "libraryData.shared" value that is not a 40-hex commit');
  }
  if (!isPlainObject(libraries)) {
    return invalid('has a "libraryData.libraries" value that is not a map');
  }
  for (const [name, commit] of Object.entries(libraries)) {
    if (!LIBRARY_KEY.test(name)) {
      return invalid(`has a "libraryData.libraries" key ${name} that is not one path segment`);
    }
    if (typeof commit !== "string" || !COMMIT_COMMENT.test(commit)) {
      return invalid(`has "libraryData.libraries" entry ${name} that is not a 40-hex commit`);
    }
  }
  return {
    status: "ok",
    lock: {
      extensions: extensions as Record<string, string>,
      libraryData: { shared, libraries: libraries as Record<string, string> },
    },
  };
}

function sortedByKey(map: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(map)
      .sort()
      .map((key) => [key, map[key] as string]),
  );
}

function serializeProjectLock(lock: ProjectLock): string {
  return `${JSON.stringify(
    {
      version: LOCK_VERSION,
      extensions: sortedByKey(lock.extensions),
      ...(lock.libraryData === undefined
        ? {}
        : {
            libraryData: {
              shared: lock.libraryData.shared,
              libraries: sortedByKey(lock.libraryData.libraries),
            },
          }),
    },
    null,
    2,
  )}\n`;
}

export function writeProjectLock(cwd: string, lock: ProjectLock): void {
  const path = join(cwd, PROJECT_LOCK_FILE);
  const text = serializeProjectLock(lock);
  if (existsSync(path) && readFileSync(path, "utf8") === text) {
    return;
  }
  const stage = `${path}.${process.pid}.partial`;
  writeFileSync(stage, text);
  try {
    renameSync(stage, path);
  } catch (err) {
    rmSync(stage, { force: true });
    throw err;
  }
}
