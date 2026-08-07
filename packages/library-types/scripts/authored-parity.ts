/**
 * Surface parity for the authored/forked lane: what the fork *declares* against
 * what the pinned upstream Lua *defines*.
 *
 * The lane's own gate is an identity diff between the vendored `.d.ts` and the
 * emitted golden, which proves the emit is lossless and says nothing about whether
 * the fork is right. `parse-lua-surface.ts` reads the upstream side; this module
 * compares it with `api-doc/<namespace>.json` — the artifact the docs-site renders,
 * so the report measures the surface a user actually sees rather than an
 * intermediate the reader alone knows about.
 *
 * Scope is the *callable* surface on both sides: upstream members that carry a
 * parameter list, against api-doc `FUNCTION` elements. A `TYPEDEF` is a type, not a
 * runtime member, and an upstream constant field (`M.APIOPERATOR_BEST = "BEST"`) has
 * no arity to compare — folding either in would move the numbers without measuring
 * anything the report can act on. The fields are still *counted*, as
 * `upstreamFields`, so a module whose callable surface is one function cannot post a
 * `coverage` of 1 that reads as a complete audit.
 *
 * Every classifier here is one-sided on purpose. `missingMembers` and
 * `phantomMembers` are name-set differences, `arityMismatches` compares parameter
 * *counts* for shared names (upstream Lua names its parameters, the fork renames
 * freely, and a rename is not the defect this measures), and `coverage` is the
 * fraction of upstream members that are declared *and* agree on arity. A non-empty
 * list is a correction to make in the fork, never a number to re-baseline.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type LuaMember, parseLuaSurface } from "./parse-lua-surface";
import { type AuthoredTarget, readAuthoredTargets } from "./sync-authored-types";

export const AUTHORED_PARITY_DIR = "fidelity/authored";

export interface AuthoredArityMismatch {
  name: string;
  upstream: number;
  declared: number;
}

export interface AuthoredParityReport {
  namespace: string;
  upstreamMembers: number;
  /** Non-callable upstream members (`M.SOME_CONSTANT = "X"`), which the callable
   * comparison never examines. Recorded beside `upstreamMembers` so a high
   * `coverage` over a handful of functions cannot be read as a complete audit of
   * the module: a non-zero count is unmeasured surface, not agreement. */
  upstreamFields: number;
  declaredMembers: number;
  missingMembers: string[];
  phantomMembers: string[];
  arityMismatches: AuthoredArityMismatch[];
  undocumentedMembers: number;
  coverage: number;
}

interface DeclaredMember {
  params: number;
  documented: boolean;
}

/** Package-root-relative POSIX path of a target's committed parity artifact. */
export function authoredParityPath(target: AuthoredTarget): string {
  return `${AUTHORED_PARITY_DIR}/${target.namespace}.json`;
}

/** The opted-in targets, in `authored-targets.json` order. A target that vendors
 * no upstream Lua is measured by nothing and emits nothing. */
export function authoredParityTargets(packageRoot: string): AuthoredTarget[] {
  return readAuthoredTargets(packageRoot).filter((target) => target.upstreamLua.length > 0);
}

// Four places is what the near-zero end of this lane needs: `nakama` sits at
// 4/156, where three places would round two whole members into the same figure.
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

interface UpstreamSurface {
  callable: Map<string, LuaMember>;
  /** Field names, minus any name that is callable somewhere in the target's
   * sources — a name defined both ways is compared, not counted as unexamined. */
  fields: Set<string>;
}

function upstreamSurface(packageRoot: string, target: AuthoredTarget): UpstreamSurface {
  const callable = new Map<string, LuaMember>();
  const fields = new Set<string>();
  for (const relative of target.upstreamLua) {
    const surface = parseLuaSurface(readFileSync(join(packageRoot, relative), "utf8"));
    for (const member of surface.members) {
      if (member.params === undefined) fields.add(member.name);
      else callable.set(member.name, member);
    }
  }
  for (const name of callable.keys()) fields.delete(name);
  return { callable, fields };
}

function declaredSurface(packageRoot: string, target: AuthoredTarget): Map<string, DeclaredMember> {
  const doc = JSON.parse(readFileSync(join(packageRoot, target.apiDoc), "utf8")) as {
    elements: {
      type: string;
      name: string;
      brief?: string;
      description?: string;
      parameters?: unknown[];
    }[];
  };
  const members = new Map<string, DeclaredMember>();
  for (const element of doc.elements) {
    if (element.type !== "FUNCTION") continue;
    members.set(element.name, {
      params: element.parameters?.length ?? 0,
      documented: (element.brief ?? "") !== "" || (element.description ?? "") !== "",
    });
  }
  return members;
}

/**
 * The parity report for one opted-in target, recomputed from the vendored upstream
 * Lua and the committed api-doc. Pure with respect to the working tree: it reads,
 * never writes, so the committed artifact and this return value can be compared.
 */
export function buildAuthoredParity(
  packageRoot: string,
  target: AuthoredTarget,
): AuthoredParityReport {
  const { callable: upstream, fields } = upstreamSurface(packageRoot, target);
  const declared = declaredSurface(packageRoot, target);

  const missingMembers: string[] = [];
  const arityMismatches: AuthoredArityMismatch[] = [];
  let undocumentedMembers = 0;
  let correct = 0;

  for (const [name, member] of upstream) {
    const match = declared.get(name);
    if (match === undefined) {
      missingMembers.push(name);
      continue;
    }
    const upstreamParams = (member.params as string[]).length;
    if (upstreamParams === match.params) correct += 1;
    else arityMismatches.push({ name, upstream: upstreamParams, declared: match.params });
    if (member.doc !== "" && !match.documented) undocumentedMembers += 1;
  }

  const phantomMembers = [...declared.keys()].filter((name) => !upstream.has(name));

  return {
    namespace: target.namespace,
    upstreamMembers: upstream.size,
    upstreamFields: fields.size,
    declaredMembers: declared.size,
    missingMembers: missingMembers.sort(),
    phantomMembers: phantomMembers.sort(),
    arityMismatches: arityMismatches.sort((a, b) => a.name.localeCompare(b.name)),
    undocumentedMembers,
    coverage: upstream.size === 0 ? 1 : round4(correct / upstream.size),
  };
}

/** The committed artifact's exact bytes, so a round-trip comparison is total. */
export function renderAuthoredParity(report: AuthoredParityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  for (const target of authoredParityTargets(root)) {
    const report = buildAuthoredParity(root, target);
    const dest = join(root, authoredParityPath(target));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, renderAuthoredParity(report));
    console.log(
      `${target.namespace}: ${report.upstreamMembers} upstream, ${report.missingMembers.length} missing, ${report.phantomMembers.length} phantom, ${report.arityMismatches.length} arity, coverage ${report.coverage}, ${report.upstreamFields} unexamined fields`,
    );
  }
}
