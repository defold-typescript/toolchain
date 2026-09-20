import { readFileSync, writeFileSync } from "node:fs";
import { formatJsonLikeBiome } from "./format-json";

export function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${formatJsonLikeBiome(value)}\n`);
}

// Strip `//` line comments, `/* */` block comments, and trailing commas so a
// hand-edited JSONC `.vscode` file parses with `JSON.parse`. The walk tracks
// string state so a `//` or comma inside a value (e.g. a URL) is preserved.
function parseJsonc(text: string): unknown {
  let out = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        out += ch;
      }
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      inLineComment = true;
      i++;
    } else if (ch === "/" && next === "*") {
      inBlockComment = true;
      i++;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readVscodeJson(filePath: string): Record<string, unknown> | null {
  try {
    const parsed = parseJsonc(readFileSync(filePath, "utf8"));
    return isJsonObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function reconcileManagedList(
  existing: unknown,
  managed: readonly string[],
  canonical: readonly string[],
): string[] {
  const managedSet = new Set(managed);
  const canonicalSet = new Set(canonical);
  const out: string[] = [];
  const values = Array.isArray(existing)
    ? existing.filter((value): value is string => typeof value === "string")
    : [];
  for (const value of values) {
    if (out.includes(value)) {
      continue;
    }
    if (managedSet.has(value) && !canonicalSet.has(value)) {
      continue;
    }
    out.push(value);
  }
  for (const value of canonical) {
    if (!out.includes(value)) {
      out.push(value);
    }
  }
  return out;
}
