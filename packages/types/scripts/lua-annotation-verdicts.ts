import { readFileSync } from "node:fs";
import { join } from "node:path";

// Kept apart from `lua-annotation-diff.ts` so the ratchet backlog reads the
// verdicts without loading the TypeScript compiler. Repo-root-relative, the
// shape the ratchet backlog registers its sources by.
export const ANNOTATION_VERDICTS_DIR = join("packages", "types", "scripts");
export const ANNOTATION_VERDICTS_FILE_NAME = "lua-annotation-verdicts.json";
export const ANNOTATION_VERDICTS_FILE = join(import.meta.dir, ANNOTATION_VERDICTS_FILE_NAME);

export interface AnnotationVerdict {
  readonly verdict: "open" | "accepted" | "corrected";
  readonly reason?: string;
  // `<TABLE>:<key>` of the correction that already fixes the slot upstream's
  // annotation repeats the defect of.
  readonly correction?: string;
  readonly annotated?: string;
  readonly declared?: string;
}

const VERDICT_KINDS: ReadonlySet<string> = new Set(["open", "accepted", "corrected"]);

export function parseAnnotationVerdicts(
  raw: unknown,
  source: string,
): Record<string, AnnotationVerdict> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`${source}: expected an object of verdicts`);
  }
  for (const [key, value] of Object.entries(raw)) {
    const verdict = (value as { verdict?: unknown } | null)?.verdict;
    if (typeof verdict !== "string" || !VERDICT_KINDS.has(verdict)) {
      throw new Error(`${source}: ${key} has no open, accepted or corrected verdict`);
    }
  }
  return raw as Record<string, AnnotationVerdict>;
}

export function readAnnotationVerdicts(
  path: string = ANNOTATION_VERDICTS_FILE,
): Record<string, AnnotationVerdict> {
  return parseAnnotationVerdicts(JSON.parse(readFileSync(path, "utf8")), path);
}

export function openAnnotationVerdictSlots(
  manifestFile: string,
  verdicts: Record<string, unknown>,
): string[] {
  return Object.entries(verdicts as Record<string, AnnotationVerdict>)
    .filter(([, v]) => v.verdict === "open")
    .map(
      ([key, v]) =>
        `${manifestFile}: ${key} open (annotated ${v.annotated}, declared ${v.declared})`,
    );
}
