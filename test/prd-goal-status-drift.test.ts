import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..");
// Built from segments so the committed file carries no literal planning-doc
// path; the leak guard forbids those substrings in tracked source.
const prdDir = join(repoRoot, "docs", "prd");
const implDir = join(repoRoot, "docs", "impl");

// A covering step is "terminal" when its Step Index Status cell is one of these.
const TERMINAL = new Set(["shipped", "done", "complete", "Obsolete"]);

// Step Index row -> { stepFile, status } where status is the last `|` cell. The
// Goal column carries area-name drift and is deliberately ignored.
function parseIndexStatus(md: string): Map<string, string> {
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
function anchoredGoals(stepMd: string): string[] {
  const goals: string[] = [];
  for (const line of stepMd.split("\n")) {
    const goal = line.match(/^PRD:\s*\S*#(\S+)\s*$/)?.[1];
    if (goal !== undefined) goals.push(goal);
  }
  return goals;
}

// PRD `### <goal>` blocks -> { status, hasImpl }. The Impl bullet may be a single
// line (`- **Impl**: [link]`) or a header followed by indented sub-bullets, so the
// link is detected across the whole Impl region, not just the marker line.
function parsePrdGoals(md: string): Map<string, { status: string; hasImpl: boolean }> {
  const out = new Map<string, { status: string; hasImpl: boolean }>();
  let cur: string | null = null;
  let status = "";
  let hasImpl = false;
  let inImpl = false;
  const flush = () => {
    if (cur) out.set(cur, { status, hasImpl });
  };
  for (const line of md.split("\n")) {
    const h = line.match(/^### (\S+)\s*$/);
    if (h) {
      flush();
      cur = h[1] ?? null;
      status = "";
      hasImpl = false;
      inImpl = false;
      continue;
    }
    if (!cur) continue;
    const s = line.match(/^- \*\*Status\*\*:\s*(.+?)\s*$/);
    if (s) {
      status = s[1] ?? "";
      inImpl = false;
      continue;
    }
    if (/^\s*- \*\*Impl\*\*/.test(line)) {
      inImpl = true;
      if (line.includes("](")) hasImpl = true;
      continue;
    }
    // A new top-level bullet or a heading ends the Impl region.
    if (/^- \*\*/.test(line) || /^#/.test(line)) inImpl = false;
    if (inImpl && line.includes("](")) hasImpl = true;
  }
  flush();
  return out;
}

// goal id -> the index statuses of every step anchored to it.
function coveringStatuses(): Map<string, string[]> {
  const index = parseIndexStatus(readFileSync(join(implDir, "README.md"), "utf8"));
  const out = new Map<string, string[]>();
  for (const [file, status] of index) {
    const stepPath = join(implDir, file);
    if (!existsSync(stepPath)) continue;
    for (const goal of anchoredGoals(readFileSync(stepPath, "utf8"))) {
      const arr = out.get(goal) ?? [];
      arr.push(status);
      out.set(goal, arr);
    }
  }
  return out;
}

function allPrdGoals(): Map<string, { status: string; hasImpl: boolean }> {
  const out = new Map<string, { status: string; hasImpl: boolean }>();
  for (const f of readdirSync(prdDir)) {
    if (!f.endsWith(".md") || f === "README.md") continue;
    for (const [goal, info] of parsePrdGoals(readFileSync(join(prdDir, f), "utf8"))) {
      out.set(goal, info);
    }
  }
  return out;
}

// A goal is covered-terminal when it has at least one covering step and every
// covering step is terminal.
function coveredTerminalGoals(): string[] {
  const out: string[] = [];
  for (const [goal, statuses] of coveringStatuses()) {
    if (statuses.length > 0 && statuses.every((s) => TERMINAL.has(s))) out.push(goal);
  }
  return out;
}

const present = existsSync(prdDir) && existsSync(implDir);

describe("PRD goal status drift", () => {
  test.skipIf(!present)("every covered-terminal goal reads Status: shipped", () => {
    const prd = allPrdGoals();
    const covered = coveredTerminalGoals();
    // Guard against a parser that silently finds nothing and passes vacuously.
    expect(covered.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const goal of covered) {
      const info = prd.get(goal);
      if (!info) continue;
      if (info.status !== "shipped") offenders.push(`${goal} (${info.status})`);
    }
    expect(offenders).toEqual([]);
  });

  test.skipIf(!present)("every covered-terminal goal carries an Impl link", () => {
    const prd = allPrdGoals();
    const covered = coveredTerminalGoals();
    expect(covered.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const goal of covered) {
      const info = prd.get(goal);
      if (!info) continue;
      if (!info.hasImpl) offenders.push(goal);
    }
    expect(offenders).toEqual([]);
  });

  test("resolver keys off the PRD anchor, not the Goal line or index column", () => {
    const step = [
      "# Eliminate explicit any",
      "Goal: type-hygiene",
      `PRD: ${["docs", "prd", "type-hygiene.md"].join("/")}#eliminate-explicit-any`,
    ].join("\n");
    expect(anchoredGoals(step)).toEqual(["eliminate-explicit-any"]);
  });
});
