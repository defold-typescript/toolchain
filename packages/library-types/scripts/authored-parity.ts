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
 * was the case that forced this — it declared twelve upstream *functions* as `VARIABLE`,
 * which the callable axis already reported as `missingMembers`, and calling them phantom
 * fields as well would both double-count and describe an upstream name as invented. That
 * fork has since been corrected, so the rule now stands on `classifyFieldAxis` alone: no
 * measured target produces any of its four clauses, and all four are pinned by synthetic
 * name sets.
 *
 * Every classifier here is one-sided on purpose. `missingMembers`/`missingFields` and
 * `phantomMembers`/`phantomFields` are name-set differences, `arityMismatches` compares
 * parameter *counts* for shared names (upstream Lua names its parameters, the fork
 * renames freely, and a rename is not the defect this measures) — except where upstream
 * is variadic, which has no fixed count to disagree with, so its named parameters are a
 * floor the fork must meet and `variadicMembers` says how many members were only checked
 * that way, and except where the fork declares several overloads, which offer a *set* of
 * counts rather than one and where `overloadedMembers` says how many were compared that
 * way, `coverage` is the
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
  /** The widest signature the fork offers for this name — the same number for a member
   * declared once, and the largest of the set for one declared as overloads. One number
   * per name is what keeps this list a diff-stable correction list. */
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
  /** Upstream members the fork deliberately does not declare, each with the reason
   * upstream's own source gives. Counted as correct, so a target can reach a full
   * `callableCoverage` by justification rather than by declaring everything — and named
   * here, so that justification stays readable instead of vanishing into the ratio. */
  parityExceptions: AuthoredParityException[];
  /** Upstream prose that reached neither the fork nor the import — a member whose block
   * the reader accepted but which carries no summary to lower, being nothing but tags or
   * nothing but the member's own name. Distinct from `refusedDocBlocks`, where prose does
   * exist and the reader declined the block it sits in. */
  undocumentedMembers: number;
  /** Declared elements carrying upstream's own summary because the fork supplied none,
   * on both axes. Recorded beside `undocumentedMembers` because it is where that
   * shortfall went: without it, a target the import silently skipped and a target the
   * fork documents itself would read the same. */
  importedDocs: number;
  /** Upstream comment blocks the reader declined because no segment opened with `---`.
   * Such a block leaves no `doc` behind, so `undocumentedMembers` cannot charge it and
   * the loss would otherwise read as a clean zero. Author the fork's own doc-comment to
   * surface one: no parser rule separates upstream's prose blocks from its section
   * headers, so the judgment is a human's. */
  refusedDocBlocks: number;
  /** How many agreeing members were compared against a floor rather than an exact count,
   * upstream being variadic. Recorded so a `callableCoverage` of 1 over a variadic
   * surface cannot be read as fully verified. */
  variadicMembers: number;
  /** How many members the fork declares as several overloads, so the comparison had a
   * set of counts to accept rather than one. Recorded beside `variadicMembers` and for
   * the same reason: a member that agrees because *one* of its shapes matches is a
   * weaker result than one that agrees outright. */
  overloadedMembers: number;
  /** Named for its axis, not for the module: neither this nor `fieldCoverage` is
   * "the" coverage of a target, and the two are never averaged into one. */
  callableCoverage: number;
}

interface DeclaredMember {
  /** Every declared signature's parameter count, ascending. A name the api-doc holds
   * once yields one entry; an overload pair yields both. */
  params: number[];
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
  /** Counted here rather than in the callable loop below, which never visits the field
   * side: most refused blocks in this corpus sit above a constant. */
  refusedDocs: number;
}

function upstreamSurface(packageRoot: string, target: AuthoredTarget): UpstreamSurface {
  const callable = new Map<string, LuaMember>();
  const fields = new Set<string>();
  let refusedDocs = 0;
  for (const relative of target.upstreamLua) {
    const surface = parseLuaSurface(readFileSync(join(packageRoot, relative), "utf8"));
    for (const member of surface.members) {
      if (member.refusedDoc) refusedDocs += 1;
      if (member.params === undefined) fields.add(member.name);
      else callable.set(member.name, member);
    }
  }
  return { callable, fields, refusedDocs };
}

interface DeclaredSurface {
  callable: Map<string, DeclaredMember>;
  /** Every `VARIABLE` name, raw: a name the fork also declares as a `FUNCTION` is still
   * here, and `classifyFieldAxis` is what subtracts it. */
  fields: Set<string>;
  globals: number;
  /** Elements carrying `docSource: "upstream"`, counted across both axes — the field
   * side has no `documented` bookkeeping of its own, and the count is about provenance
   * rather than callability. */
  imported: number;
}

function declaredSurface(packageRoot: string, target: AuthoredTarget): DeclaredSurface {
  const doc = JSON.parse(readFileSync(join(packageRoot, target.apiDoc), "utf8")) as {
    elements: {
      type: string;
      name: string;
      global?: boolean;
      brief?: string;
      description?: string;
      docSource?: string;
      parameters?: unknown[];
    }[];
  };
  const callable = new Map<string, DeclaredMember>();
  const fields = new Set<string>();
  let globals = 0;
  let imported = 0;
  for (const element of doc.elements) {
    if (element.type !== "FUNCTION" && element.type !== "VARIABLE") continue;
    if (element.global === true) {
      globals += 1;
      continue;
    }
    if (element.docSource === "upstream") imported += 1;
    if (element.type === "FUNCTION") {
      // Merged rather than overwritten: the api-doc holds one `FUNCTION` element per
      // overload, and keeping only the last read a correctly-modelled pair as whichever
      // shape happened to come last. `documented` is true when *any* of them carries
      // prose — the docs-site renders the group, not the element.
      const documented = (element.brief ?? "") !== "" || (element.description ?? "") !== "";
      const existing = callable.get(element.name);
      const params = [...(existing?.params ?? []), element.parameters?.length ?? 0].sort(
        (a, b) => a - b,
      );
      callable.set(element.name, {
        params,
        documented: (existing?.documented ?? false) || documented,
      });
    } else fields.add(element.name);
  }
  return { callable, fields, globals, imported };
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
  /** Every parameter count the fork declares for this name — one entry per overload,
   * and never empty. */
  declared: number[];
}

/** Whether the fork's count is acceptable, whether saying so took a floor or a set, and
 * the single count a disagreement is reported at. */
export interface ArityVerdict {
  agrees: boolean;
  floorChecked: boolean;
  overloadChecked: boolean;
  /** The widest shape the fork offers — what `arityMismatches` reports, so the list
   * stays one number per name whether or not the member is overloaded. */
  declaredWidest: number;
}

/**
 * The arity comparison for one shared member, pure over the counts.
 *
 * `function M.play(...)` names no parameters, so an exact comparison reads the fork's one
 * rest parameter as a mismatch against zero — the instrument's defect, not the fork's. A
 * variadic upstream member has no fixed count to disagree with, so its named parameters
 * become a floor: the fork must declare at least them, and anything above is the rest.
 *
 * A fork may also declare several overloads for one name, modelling an upstream body that
 * branches on whether an argument was passed. That is a *set* of call shapes, and the
 * member agrees when any one of them meets the rule above — reading a single count would
 * charge a correct fork for whichever shape the reader happened to keep.
 *
 * Both softenings stay visible. `floorChecked` is true whenever upstream is variadic and
 * `overloadChecked` whenever the fork declares more than one shape — in each case whether
 * or not it changed the verdict — so `variadicMembers` and `overloadedMembers` count every
 * member the weaker check covered rather than only the ones it rescued.
 */
export function classifyArity(input: ArityInput): ArityVerdict {
  const meets = (declared: number) =>
    input.upstreamVariadic ? declared >= input.upstreamNamed : declared === input.upstreamNamed;
  return {
    agrees: input.declared.some(meets),
    floorChecked: input.upstreamVariadic,
    overloadChecked: input.declared.length > 1,
    declaredWidest: Math.max(...input.declared),
  };
}

export const AUTHORED_EXCEPTIONS_MANIFEST_FILE = "authored-parity-exceptions.json";

/**
 * Why the fork is right not to declare an upstream member. Closed, and both members
 * were introduced by a real case rather than anticipated: a speculative kind would
 * read as a licence to except anything.
 *
 * `script-lifecycle` — upstream exports it for the library's own bundled `.script`,
 * saying so in its own comment; a consumer never calls it, and declaring it would
 * widen the published surface with functions no consumer should reach.
 * `deprecated-stub` — upstream's body is nothing but `error("… is deprecated")`, so
 * declaring the member offers a call that cannot succeed.
 *
 * An arity or phantom exception is deliberately not expressible here. `nakama`'s 26
 * phantoms are the case that will ask for one, and it states its own shape.
 */
export const AUTHORED_EXCEPTION_KINDS = ["deprecated-stub", "script-lifecycle"] as const;

export type AuthoredExceptionKind = (typeof AUTHORED_EXCEPTION_KINDS)[number];

/** One justified divergence. `reason` cites upstream's own file and line, so the
 * entry can be re-checked against the pin rather than taken on trust. */
export interface AuthoredParityException {
  name: string;
  kind: AuthoredExceptionKind;
  reason: string;
}

function exceptionField(entry: Record<string, unknown>, field: string, path: string, at: string) {
  const value = entry[field];
  if (typeof value !== "string" || value === "") {
    throw new Error(`${path}: ${at} needs a non-empty string "${field}", got ${describe(value)}`);
  }
  return value;
}

/**
 * The exceptions manifest's parse-time contract: a plain object mapping each namespace
 * to an array of `{ name, kind, reason }` entries. Modelled on `parseAuthoredFloors` —
 * pure over `raw`, so the caller owns the read — and on the `parityVerdict` closed set,
 * whose unknown-reason throw this mirrors.
 */
export function parseAuthoredExceptions(
  raw: unknown,
  path: string,
): Record<string, AuthoredParityException[]> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${path}: expected a JSON object of exceptions, got ${describe(raw)}`);
  }
  const manifest: Record<string, AuthoredParityException[]> = {};
  for (const [namespace, entries] of Object.entries(raw)) {
    if (!Array.isArray(entries)) {
      throw new Error(
        `${path}: "${namespace}" must be an array of entries, got ${describe(entries)}`,
      );
    }
    manifest[namespace] = entries.map((entry) => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
        throw new Error(`${path}: "${namespace}" holds a non-object entry ${describe(entry)}`);
      }
      const record = entry as Record<string, unknown>;
      const name = exceptionField(record, "name", path, `an entry of "${namespace}"`);
      const at = `"${namespace}.${name}"`;
      const kind = record.kind;
      if (!AUTHORED_EXCEPTION_KINDS.includes(kind as AuthoredExceptionKind)) {
        throw new Error(
          `${path}: ${at} has unknown kind ${describe(kind)} — expected one of ${AUTHORED_EXCEPTION_KINDS.join(", ")}`,
        );
      }
      return {
        name,
        kind: kind as AuthoredExceptionKind,
        reason: exceptionField(record, "reason", path, at),
      };
    });
  }
  return manifest;
}

/** The committed ledger, read from the package root the parity pass measures. */
export function readAuthoredExceptions(
  packageRoot: string,
): Record<string, AuthoredParityException[]> {
  const path = AUTHORED_EXCEPTIONS_MANIFEST_FILE;
  return parseAuthoredExceptions(JSON.parse(readFileSync(join(packageRoot, path), "utf8")), path);
}

/**
 * The parity report for one opted-in target, recomputed from the vendored upstream
 * Lua and the committed api-doc. Pure with respect to the working tree: it reads,
 * never writes, so the committed artifact and this return value can be compared.
 */
export function buildAuthoredParity(
  packageRoot: string,
  target: AuthoredTarget,
  exceptions: Record<string, AuthoredParityException[]> = readAuthoredExceptions(packageRoot),
): AuthoredParityReport {
  const {
    callable: upstream,
    fields: upstreamVariables,
    refusedDocs: refusedDocBlocks,
  } = upstreamSurface(packageRoot, target);
  const {
    callable: declared,
    fields: declaredVariables,
    globals: declaredGlobals,
    imported: importedDocs,
  } = declaredSurface(packageRoot, target);
  const { upstreamFields, declaredFields, missingFields, phantomFields } = classifyFieldAxis({
    upstreamCallable: new Set(upstream.keys()),
    upstreamNonCallable: upstreamVariables,
    declaredCallable: new Set(declared.keys()),
    declaredVariables,
  });

  // Checked ahead of the loop rather than inside it, so a stale entry throws on the
  // entry's own terms — an entry naming nothing upstream is never reached by a loop
  // over upstream members at all.
  const excepted = new Map<string, AuthoredParityException>();
  for (const exception of exceptions[target.namespace] ?? []) {
    const at = `${target.namespace}.${exception.name}`;
    if (!upstream.has(exception.name)) {
      throw new Error(
        `${AUTHORED_EXCEPTIONS_MANIFEST_FILE}: "${at}" excepts a member upstream does not define — delete the entry`,
      );
    }
    if (declared.has(exception.name)) {
      throw new Error(
        `${AUTHORED_EXCEPTIONS_MANIFEST_FILE}: "${at}" is unnecessary, the fork declares it — delete the entry`,
      );
    }
    excepted.set(exception.name, exception);
  }

  const missingMembers: string[] = [];
  const parityExceptions: AuthoredParityException[] = [];
  const arityMismatches: AuthoredArityMismatch[] = [];
  let undocumentedMembers = 0;
  let variadicMembers = 0;
  let overloadedMembers = 0;
  let correct = 0;

  for (const [name, member] of upstream) {
    const match = declared.get(name);
    if (match === undefined) {
      const exception = excepted.get(name);
      if (exception === undefined) missingMembers.push(name);
      else {
        parityExceptions.push(exception);
        correct += 1;
      }
      continue;
    }
    const upstreamParams = (member.params as string[]).length;
    const verdict = classifyArity({
      upstreamNamed: upstreamParams,
      upstreamVariadic: member.varargs,
      declared: match.params,
    });
    if (verdict.agrees) correct += 1;
    else arityMismatches.push({ name, upstream: upstreamParams, declared: verdict.declaredWidest });
    if (verdict.floorChecked) variadicMembers += 1;
    if (verdict.overloadChecked) overloadedMembers += 1;
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
    parityExceptions: parityExceptions.sort((a, b) => a.name.localeCompare(b.name)),
    undocumentedMembers,
    importedDocs,
    refusedDocBlocks,
    variadicMembers,
    overloadedMembers,
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
