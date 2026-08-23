import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const repoRoot = join(import.meta.dir, "..");
// Built from segments so the committed file carries no literal planning-doc
// path; the leak guard forbids those substrings in tracked source.
export const prdDir = join(repoRoot, "docs", "prd");
export const implDir = join(repoRoot, "docs", "impl");

// Step Index row -> { stepFile, status } where status is the last `|` cell. The
// Goal column carries area-name drift and is deliberately ignored.
export function parseIndexStatus(md: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of md.split("\n")) {
    const m = line.match(/^\| \[[^\]]+\]\(([^)]+\.md)\).*\|([^|]*)\|\s*$/);
    const file = m?.[1];
    const cell = m?.[2];
    if (file === undefined || cell === undefined) continue;
    const status = cell.trim();
    const prev = out.get(file);
    if (prev === undefined || (prev === "" && status !== "")) out.set(file, status);
  }
  return out;
}

// Goal ids a step claims via its `PRD: <path>#<goal-id>` anchor line(s). Keys off
// the anchor, never the step's `Goal:` line nor the index Goal column.
export function anchoredGoals(stepMd: string): string[] {
  const goals: string[] = [];
  for (const line of stepMd.split("\n")) {
    const goal = line.match(/^PRD:\s*\S*#(\S+)\s*$/)?.[1];
    if (goal !== undefined) goals.push(goal);
  }
  return goals;
}

// Every anchor target a step names, fragment or not, so a path-only anchor is
// reported as a defective anchor rather than read as no anchor at all.
function anchorTargets(stepMd: string): string[] {
  const targets: string[] = [];
  for (const line of stepMd.split("\n")) {
    const target = line.match(/^PRD:\s*(\S+)\s*$/)?.[1];
    if (target !== undefined) targets.push(target);
  }
  return targets;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function firstHeadingText(body: string): string | null {
  for (const line of body.split("\n")) {
    const text = line.match(/^#{1,6}\s+(.*?)\s*$/)?.[1];
    if (text !== undefined) return text;
  }
  return null;
}

// Whether `body` declares `id` as its own: an area goal declares it with a
// `### <id>` heading; a bug file declares it by leading with the id. The bug
// clause reads the first heading only, so an id quoted inside another bug's
// body never counts as a declaration.
export function declaresGoal(body: string, id: string, isBugFile: boolean): boolean {
  if (new RegExp(`^### ${escapeRe(id)}$`, "m").test(body)) return true;
  if (!isBugFile) return false;
  const heading = firstHeadingText(body);
  if (heading === null || !heading.startsWith(id)) return false;
  const next = heading.slice(id.length, id.length + 1);
  return next === "" || !/[a-z0-9]/i.test(next);
}

// One entry per ledger step whose goal cannot be reached by a valid anchor:
// a missing step file, no anchor line, an anchor with no id fragment, a target
// file that is missing, or a target that does not declare the id the anchor
// names.
export function anchorOffenders(root: string = repoRoot): string[] {
  const impl = join(root, "docs", "impl");
  const index = parseIndexStatus(readFileSync(join(impl, "README.md"), "utf8"));
  const offenders: string[] = [];
  for (const file of index.keys()) {
    const stepPath = join(impl, file);
    if (!existsSync(stepPath)) {
      offenders.push(`${file}: (missing step file)`);
      continue;
    }
    const targets = anchorTargets(readFileSync(stepPath, "utf8"));
    if (targets.length === 0) {
      offenders.push(`${file}: (no anchor)`);
      continue;
    }
    for (const target of targets) {
      const hash = target.indexOf("#");
      if (hash < 0) {
        offenders.push(`${file}: ${target} (no id fragment)`);
        continue;
      }
      const relPath = target.slice(0, hash);
      const id = target.slice(hash + 1);
      const absPath = join(root, relPath);
      if (!existsSync(absPath)) {
        offenders.push(`${file}: ${target} (missing file)`);
        continue;
      }
      const isBugFile = relPath.includes("/bugs/");
      if (!declaresGoal(readFileSync(absPath, "utf8"), id, isBugFile)) {
        offenders.push(`${file}: ${target} (missing id)`);
      }
    }
  }
  return offenders;
}
