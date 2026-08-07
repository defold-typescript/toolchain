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
 * The declared side is the module's *own* api-doc members. An element marked
 * `global: true` is a file-scope declaration the library installs into the environment,
 * defined upstream in files this target does not vendor, so it is a member of no module
 * and is compared by neither axis — counting one would report real upstream API as
 * invented. `declaredGlobals` records how many were set aside.
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
 * The rule lives in `classifyFieldAxis`, and that target is the only corpus case for
 * it, pinning one of its four clauses; the other three are pinned by synthetic name
 * sets, no measured target producing the shape they guard against.
 *
 * Every classifier here is one-sided on purpose. `missingMembers`/`missingFields` and
 * `phantomMembers`/`phantomFields` are name-set differences, `arityMismatches` compares
 * parameter *counts* for shared names (upstream Lua names its parameters, the fork
 * renames freely, and a rename is not the defect this measures) — except where upstream
 * is variadic, which has no fixed count to disagree with, so its named parameters are a
 * floor the fork must meet and `variadicMembers` says how many members were only checked
 * that way, `coverage` is the
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
  /** Declared names that are *not* members of this module — file-scope declarations the
   * library installs into the environment, whose definitions live upstream in files this
   * target does not vendor. Compared by neither axis, and recorded so a small
   * `declaredMembers` beside a large api-doc is readable rather than surprising. */
  declaredGlobals: number;
  declaredMembers: number;
  missingMembers: string[];
  phantomMembers: string[];
  arityMismatches: AuthoredArityMismatch[];
  undocumentedMembers: number;
  /** How many agreeing members were compared against a floor rather than an exact count,
   * upstream being variadic. Recorded so a `callableCoverage` of 1 over a variadic
   * surface cannot be read as fully verified. */
  variadicMembers: number;
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
  /** Every non-callable name, raw: a name also defined with a parameter list is still
   * here, and `classifyFieldAxis` is what subtracts it. */
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
  return { callable, fields };
}

interface DeclaredSurface {
  callable: Map<string, DeclaredMember>;
  /** Every `VARIABLE` name, raw: a name the fork also declares as a `FUNCTION` is still
   * here, and `classifyFieldAxis` is what subtracts it. */
  fields: Set<string>;
  globals: number;
}

function declaredSurface(packageRoot: string, target: AuthoredTarget): DeclaredSurface {
  const doc = JSON.parse(readFileSync(join(packageRoot, target.apiDoc), "utf8")) as {
    elements: {
      type: string;
      name: string;
      global?: boolean;
      brief?: string;
      description?: string;
      parameters?: unknown[];
    }[];
  };
  const callable = new Map<string, DeclaredMember>();
  const fields = new Set<string>();
  let globals = 0;
  for (const element of doc.elements) {
    if (element.type !== "FUNCTION" && element.type !== "VARIABLE") continue;
    if (element.global === true) {
      globals += 1;
      continue;
    }
    if (element.type === "FUNCTION") {
      callable.set(element.name, {
        params: element.parameters?.length ?? 0,
        documented: (element.brief ?? "") !== "" || (element.description ?? "") !== "",
      });
    } else fields.add(element.name);
  }
  return { callable, fields, globals };
}

/** The four raw name sets of a target, callable and non-callable on both sides. */
export interface FieldAxisInput {
  upstreamCallable: ReadonlySet<string>;
  upstreamNonCallable: ReadonlySet<string>;
  declaredCallable: ReadonlySet<string>;
  declaredVariables: ReadonlySet<string>;
}

/** The field axis of one target: the two examined sets and their two differences. */
export interface FieldAxis {
  upstreamFields: Set<string>;
  declaredFields: Set<string>;
  missingFields: string[];
  phantomFields: string[];
}

/**
 * The whole either-side rule, in one place and pure over name sets: a name callable on
 * either side belongs to the callable axis and is never counted as a field.
 *
 * Four clauses enforce it — a subtraction per side, then a filter per difference — and
 * only one of them has a case in the measured corpus, so the rest are pinned by
 * synthetic sets rather than by any target. `missingFields` re-tests `declaredCallable`
 * even though `declaredFields` already excludes those names: a name the fork declares
 * *only* as a `FUNCTION` never enters `declaredFields` to begin with, and that is the
 * corner the clause exists for.
 */
export function classifyFieldAxis(input: FieldAxisInput): FieldAxis {
  const upstreamFields = new Set(input.upstreamNonCallable);
  for (const name of input.upstreamCallable) upstreamFields.delete(name);
  const declaredFields = new Set(input.declaredVariables);
  for (const name of input.declaredCallable) declaredFields.delete(name);
  return {
    upstreamFields,
    declaredFields,
    missingFields: [...upstreamFields]
      .filter((name) => !declaredFields.has(name) && !input.declaredCallable.has(name))
      .sort(),
    phantomFields: [...declaredFields]
      .filter((name) => !upstreamFields.has(name) && !input.upstreamCallable.has(name))
      .sort(),
  };
}

/** One shared name's two parameter counts, and whether upstream's definition ends in
 * `...`. A named object rather than three scalars: two of them are numbers, and a
 * transposed call would compare the wrong pair silently. */
export interface ArityInput {
  upstreamNamed: number;
  upstreamVariadic: boolean;
  declared: number;
}

/** Whether the fork's count is acceptable, and whether saying so took a floor. */
export interface ArityVerdict {
  agrees: boolean;
  floorChecked: boolean;
}

/**
 * The arity comparison for one shared member, pure over the two counts.
 *
 * `function M.play(...)` names no parameters, so an exact comparison reads the fork's one
 * rest parameter as a mismatch against zero — the instrument's defect, not the fork's. A
 * variadic upstream member has no fixed count to disagree with, so its named parameters
 * become a floor: the fork must declare at least them, and anything above is the rest.
 *
 * The softening stays visible. `floorChecked` is true whenever upstream is variadic —
 * whether or not the floor was exceeded — so `variadicMembers` counts every member the
 * weaker check covered rather than only the ones it changed the verdict for.
 */
export function classifyArity(input: ArityInput): ArityVerdict {
  return {
    agrees: input.upstreamVariadic
      ? input.declared >= input.upstreamNamed
      : input.declared === input.upstreamNamed,
    floorChecked: input.upstreamVariadic,
  };
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
  const { callable: upstream, fields: upstreamVariables } = upstreamSurface(packageRoot, target);
  const {
    callable: declared,
    fields: declaredVariables,
    globals: declaredGlobals,
  } = declaredSurface(packageRoot, target);
  const { upstreamFields, declaredFields, missingFields, phantomFields } = classifyFieldAxis({
    upstreamCallable: new Set(upstream.keys()),
    upstreamNonCallable: upstreamVariables,
    declaredCallable: new Set(declared.keys()),
    declaredVariables,
  });

  const missingMembers: string[] = [];
  const arityMismatches: AuthoredArityMismatch[] = [];
  let undocumentedMembers = 0;
  let variadicMembers = 0;
  let correct = 0;

  for (const [name, member] of upstream) {
    const match = declared.get(name);
    if (match === undefined) {
      missingMembers.push(name);
      continue;
    }
    const upstreamParams = (member.params as string[]).length;
    const verdict = classifyArity({
      upstreamNamed: upstreamParams,
      upstreamVariadic: member.varargs,
      declared: match.params,
    });
    if (verdict.agrees) correct += 1;
    else arityMismatches.push({ name, upstream: upstreamParams, declared: match.params });
    if (verdict.floorChecked) variadicMembers += 1;
    if (member.doc !== "" && !match.documented) undocumentedMembers += 1;
  }

  const phantomMembers = [...declared.keys()].filter((name) => !upstream.has(name));

  return {
    namespace: target.namespace,
    upstreamMembers: upstream.size,
    upstreamFields: upstreamFields.size,
    declaredFields: declaredFields.size,
    missingFields,
    phantomFields,
    fieldCoverage:
      upstreamFields.size === 0
        ? 1
        : round4((upstreamFields.size - missingFields.length) / upstreamFields.size),
    declaredGlobals,
    declaredMembers: declared.size,
    missingMembers: missingMembers.sort(),
    phantomMembers: phantomMembers.sort(),
    arityMismatches: arityMismatches.sort((a, b) => a.name.localeCompare(b.name)),
    undocumentedMembers,
    variadicMembers,
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
