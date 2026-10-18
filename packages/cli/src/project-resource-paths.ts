import { type Dirent, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { isDefignoredPath, parseDefignore } from "@defold-typescript/transpiler";

// Tool state, not project resources: the build tree the editor writes, its own
// port file, and version control.
export const NON_RESOURCE_ROOTS: readonly string[] = ["build", ".internal", ".git"];
export const NON_RESOURCE_SEGMENTS: readonly string[] = ["node_modules", ".defold-types"];

export function readDefignoreLines(cwd: string): string[] {
  try {
    return parseDefignore(readFileSync(path.join(cwd, ".defignore"), "utf8"));
  } catch {
    return [];
  }
}

export function isNonResourcePath(rel: string, defignoreLines: readonly string[]): boolean {
  const segments = rel.split("/");
  if (NON_RESOURCE_ROOTS.includes(segments[0] ?? "")) return true;
  if (NON_RESOURCE_SEGMENTS.some((segment) => segments.includes(segment))) return true;
  return isDefignoredPath(rel, defignoreLines);
}

// The project-relative POSIX folder (`"."` at the root) of the first
// `ext.manifest` a depth-first walk reaches, checking each folder before its
// name-sorted subfolders and skipping the ones that hold no project resources.
// A missing or unreadable folder holds no native extension.
export function findNativeExtensionManifest(cwd: string): string | null {
  const defignoreLines = readDefignoreLines(cwd);
  const visit = (rel: string): string | null => {
    let entries: Dirent[];
    try {
      entries = readdirSync(rel === "" ? cwd : path.join(cwd, rel), { withFileTypes: true });
    } catch {
      return null;
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    if (entries.some((entry) => entry.isFile() && entry.name === "ext.manifest")) {
      return rel === "" ? "." : rel;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const child = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (isNonResourcePath(child, defignoreLines)) continue;
      const found = visit(child);
      if (found !== null) return found;
    }
    return null;
  };
  return visit("");
}
