import { readFileSync } from "node:fs";
import { join } from "node:path";

// Repo-root-relative, the shape the ratchet backlog registers its sources by.
export const VERDICTS_DIR = join("packages", "types", "scripts");
export const VERDICTS_FILE_NAME = "engine-binding-verdicts.json";
export const VERDICTS_FILE = join(import.meta.dir, VERDICTS_FILE_NAME);

export interface Verdict {
  readonly verdict: "accepted" | "manual" | "open";
  readonly reason?: string;
  readonly extracted?: string;
  readonly declared?: string;
}

const VERDICT_KINDS: ReadonlySet<string> = new Set(["accepted", "manual", "open"]);

export function parseVerdicts(raw: unknown, source: string): Record<string, Verdict> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${source}: expected an object of verdicts`);
  }
  for (const [key, value] of Object.entries(raw)) {
    const verdict = (value as { verdict?: unknown } | null)?.verdict;
    if (typeof verdict !== "string" || !VERDICT_KINDS.has(verdict)) {
      throw new Error(`${source}: ${key} has no accepted, manual or open verdict`);
    }
  }
  return raw as Record<string, Verdict>;
}

export function readVerdicts(path: string = VERDICTS_FILE): Record<string, Verdict> {
  return parseVerdicts(JSON.parse(readFileSync(path, "utf8")), path);
}

export function openVerdictSlots(
  manifestFile: string,
  verdicts: Record<string, unknown>,
): string[] {
  return Object.entries(verdicts as Record<string, Verdict>)
    .filter(([, v]) => v.verdict === "open")
    .map(
      ([key, v]) =>
        `${manifestFile}: ${key} open (extracted ${v.extracted}, declared ${v.declared})`,
    );
}
