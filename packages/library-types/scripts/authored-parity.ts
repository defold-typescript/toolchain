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
 * Both halves of the surface are compared, on two axes that are reported separately
 * and never averaged. The *callable* axis puts upstream members carrying a parameter
 * list against api-doc `FUNCTION` elements; the *field* axis puts upstream constants
 * (`M.APIOPERATOR_BEST = "BEST"`) against api-doc `VARIABLE` elements. A `TYPEDEF` is
 * a type rather than a runtime member and enters neither. The same reason picks the
 * declared side for both: `api-doc` is what the docs-site renders.
 *
 * A name that is callable on *either* side belongs to the callable axis and is never
 * counted as a field, so one defect cannot be charged twice. `monarch.transitions.gui`
 * is the case that forces this: it declares twelve upstream *functions* as `VARIABLE`,
 * which the callable axis already reports as `missingMembers` — calling them phantom
 * fields as well would both double-count and describe an upstream name as invented.
 *
 * Every classifier here is one-sided on purpose. `missingMembers`/`missingFields` and
 * `phantomMembers`/`phantomFields` are name-set differences, `arityMismatches` compares
 * parameter *counts* for shared names (upstream Lua names its parameters, the fork
 * renames freely, and a rename is not the defect this measures), `coverage` is the
 * fraction of upstream members that are declared *and* agree on arity, and
 * `fieldCoverage` the fraction of upstream fields that are declared at all — a phantom
 * enters neither, having no upstream member to be a fraction of. A non-empty list is a
 * correction to make in the fork, never a number to re-baseline.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
  /** Non-callable upstream members (`M.SOME_CONSTANT = "X"`), and the denominator of
   * `fieldCoverage`. Recorded beside `upstreamMembers` so a high `callableCoverage`
   * over a handful of functions cannot be read as a complete audit of the module. */
  upstreamFields: number;
  declaredFields: number;
  missingFields: string[];
  phantomFields: string[];
  fieldCoverage: number;
  declaredMembers: number;
  missingMembers: string[];
  phantomMembers: string[];
  arityMismatches: AuthoredArityMismatch[];
  undocumentedMembers: number;
  /** Named for its axis, not for the module: neither this nor `fieldCoverage` is
   * "the" coverage of a target, and the two are never averaged into one. */
  callableCoverage: number;
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

interface DeclaredSurface {
  callable: Map<string, DeclaredMember>;
  /** `VARIABLE` names, minus any name the fork also declares as a `FUNCTION` — the
   * mirror of the subtraction `upstreamSurface` applies to its own fields. */
  fields: Set<string>;
}

function declaredSurface(packageRoot: string, target: AuthoredTarget): DeclaredSurface {
  const doc = JSON.parse(readFileSync(join(packageRoot, target.apiDoc), "utf8")) as {
    elements: {
      type: string;
      name: string;
      brief?: string;
      description?: string;
      parameters?: unknown[];
    }[];
  };
  const callable = new Map<string, DeclaredMember>();
  const fields = new Set<string>();
  for (const element of doc.elements) {
    if (element.type === "FUNCTION") {
      callable.set(element.name, {
        params: element.parameters?.length ?? 0,
        documented: (element.brief ?? "") !== "" || (element.description ?? "") !== "",
      });
    } else if (element.type === "VARIABLE") fields.add(element.name);
  }
  for (const name of callable.keys()) fields.delete(name);
  return { callable, fields };
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
  const { callable: upstream, fields: upstreamFields } = upstreamSurface(packageRoot, target);
  const { callable: declared, fields: declaredFields } = declaredSurface(packageRoot, target);

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

  // Each side's two halves are unioned before the difference, so a name present on
  // both axes lands on the callable one alone (see the module note).
  const missingFields = [...upstreamFields].filter(
    (name) => !declaredFields.has(name) && !declared.has(name),
  );
  const phantomFields = [...declaredFields].filter(
    (name) => !upstreamFields.has(name) && !upstream.has(name),
  );

  return {
    namespace: target.namespace,
    upstreamMembers: upstream.size,
    upstreamFields: upstreamFields.size,
    declaredFields: declaredFields.size,
    missingFields: missingFields.sort(),
    phantomFields: phantomFields.sort(),
    fieldCoverage:
      upstreamFields.size === 0
        ? 1
        : round4((upstreamFields.size - missingFields.length) / upstreamFields.size),
    declaredMembers: declared.size,
    missingMembers: missingMembers.sort(),
    phantomMembers: phantomMembers.sort(),
    arityMismatches: arityMismatches.sort((a, b) => a.name.localeCompare(b.name)),
    undocumentedMembers,
    callableCoverage: upstream.size === 0 ? 1 : round4(correct / upstream.size),
  };
}

/** The committed artifact's exact bytes, so a round-trip comparison is total. */
export function renderAuthoredParity(report: AuthoredParityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export const AUTHORED_FLOOR_MANIFEST_FILE = "authored-parity-floor.json";

/** One artifact's floor, one entry per reported axis. Both are required: an entry
 * naming a single axis would leave the other unratcheted while every surrounding
 * assertion stayed green, which is the failure this shape exists to make impossible. */
export interface AuthoredFloor {
  callable: number;
  field: number;
}

/** The coverage pair a floor entry is compared against. */
export interface AuthoredCoverage {
  namespace: string;
  callableCoverage: number;
  fieldCoverage: number;
}

const AUTHORED_FLOOR_AXES = ["callable", "field"] as const;

// `JSON.stringify` renders NaN and Infinity as `null` and returns `undefined` for
// `undefined`, either of which would misreport the value the manifest actually holds.
function describe(value: unknown): string {
  if (typeof value === "number") return String(value);
  return JSON.stringify(value) ?? String(value);
}

/**
 * The authored floor manifest's parse-time contract: a plain object mapping each
 * artifact path to a `{ callable, field }` pair of finite ratios in `[0, 1]`.
 *
 * Separate from `fidelity-floor.ts`'s `parseFloors`, which validates the token lane's
 * flat ratios — this manifest ratchets two axes per key, so the bare number that
 * lane accepts is precisely the pre-migration shape rejected here.
 */
export function parseAuthoredFloors(raw: unknown, path: string): Record<string, AuthoredFloor> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: expected a JSON object of floors, got ${describe(raw)}`);
  }
  const floors: Record<string, AuthoredFloor> = {};
  for (const [key, entry] of Object.entries(raw)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `${path}: floor "${key}" must be an object of "callable" and "field" ratios, got ${describe(entry)}`,
      );
    }
    for (const axis of AUTHORED_FLOOR_AXES) {
      if (!(axis in entry)) {
        throw new Error(`${path}: floor "${key}" is missing its "${axis}" axis`);
      }
      const value = (entry as Record<string, unknown>)[axis];
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
        throw new Error(
          `${path}: floor "${key}" axis "${axis}" must be a finite number in [0, 1], got ${describe(value)}`,
        );
      }
    }
    floors[key] = entry as unknown as AuthoredFloor;
  }
  return floors;
}

function coverageField(raw: Record<string, unknown>, field: string, path: string): number {
  const value = raw[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}: expected a finite numeric "${field}", got ${describe(value)}`);
  }
  return value;
}

/**
 * Every committed parity artifact, keyed by package-root-relative POSIX path and
 * sorted by that key. Both axes are read under a validating contract, so a renamed
 * or dropped coverage key throws here rather than reaching the ratchet as
 * `undefined` — where every `<` comparison would be false and the gate would pass
 * while comparing nothing.
 */
export function collectAuthoredParity(packageRoot: string): Record<string, AuthoredCoverage> {
  const dir = join(packageRoot, AUTHORED_PARITY_DIR);
  if (!existsSync(dir)) return {};
  const artifacts: Record<string, AuthoredCoverage> = {};
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const key = `${AUTHORED_PARITY_DIR}/${name}`;
    const raw = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
    artifacts[key] = {
      namespace: String(raw.namespace),
      callableCoverage: coverageField(raw, "callableCoverage", key),
      fieldCoverage: coverageField(raw, "fieldCoverage", key),
    };
  }
  return artifacts;
}

/**
 * Every axis of every artifact that sits below its floor, one message per axis so a
 * drop on one can never be masked by the other holding. An artifact with no floor
 * entry is not reported here — the bijection assertions cover that separately.
 */
export function authoredFloorRegressions(
  artifacts: Record<string, AuthoredCoverage>,
  floors: Record<string, AuthoredFloor>,
): string[] {
  const regressions: string[] = [];
  for (const [path, artifact] of Object.entries(artifacts)) {
    const floor = floors[path];
    if (floor === undefined) continue;
    const measured = { callable: artifact.callableCoverage, field: artifact.fieldCoverage };
    for (const axis of AUTHORED_FLOOR_AXES) {
      if (measured[axis] < floor[axis]) {
        regressions.push(
          `${artifact.namespace}: ${axis} coverage ${measured[axis]} is below its floor ${floor[axis]} — correct the fork, do not lower the floor`,
        );
      }
    }
  }
  return regressions;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  for (const target of authoredParityTargets(root)) {
    const report = buildAuthoredParity(root, target);
    const dest = join(root, authoredParityPath(target));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, renderAuthoredParity(report));
    console.log(
      `${target.namespace}: callable ${report.upstreamMembers} upstream, ${report.missingMembers.length} missing, ${report.phantomMembers.length} phantom, ${report.arityMismatches.length} arity, coverage ${report.callableCoverage} | fields ${report.upstreamFields} upstream, ${report.missingFields.length} missing, ${report.phantomFields.length} phantom, coverage ${report.fieldCoverage}`,
    );
  }
}
