import { writeFileSync } from "node:fs";
import { formatJsonLikeBiome } from "./format-json";
import { readJsoncObject } from "./jsonc-file";

export function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${formatJsonLikeBiome(value)}\n`);
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readVscodeJson(filePath: string): Record<string, unknown> | null {
  try {
    return readJsoncObject(filePath);
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
