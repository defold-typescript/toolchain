/**
 * Surface parity for the authored/forked lane: what the fork *declares* against
 * what the pinned upstream Lua *defines*.
 *
 * The lane's own gate is an identity diff between the vendored `.d.ts` and the
 * emitted golden, which proves the emit is lossless and says nothing about whether
 * the fork is right. `parse-lua-surface.ts` reads the upstream side; this module
 * compares it with the fork's API model, lowered from the library data — the artifact
 * the docs-site renders, so the report measures the surface a user actually sees rather
 * than an intermediate the reader alone knows about.
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
 * a type rather than a runtime member and enters neither, with one exception: an upstream
 * `function M:name(…)` method is declared on the interface the target names as its
 * `instanceType`, so that `TYPEDEF`'s `functions` join the callable axis, both sides
 * keyed `<instanceType>:<name>`. The same reason picks the declared side for all of it:
 * `api-doc` is what the docs-site renders.
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
 * way, and except where upstream's own generator left a trailing discard, which is
 * dropped before counting and where `placeholderMembers` says how many carried one,
 * `coverage` is the
 * fraction of upstream members that are declared *and* agree on arity, and
 * `fieldCoverage` the fraction of upstream fields that are declared at all — a phantom
 * enters neither, having no upstream member to be a fraction of. A non-empty list is a
 * correction to make in the fork, never a number to re-baseline.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  type AuthoredFloor,
  type AuthoredParityException,
  describeValue,
  libraryFile,
  readLibraryExceptions,
} from "./library-data";
import { type LuaMember, parseLuaSurface } from "./parse-lua-surface";
import {
  type AuthoredTarget,
  lowerAuthoredApiDoc,
  readAuthoredTargets,
} from "./sync-authored-types";

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
  /** Upstream comment blocks the reader declined *and* the fork left unanswered. Such a
   * block leaves no `doc` behind, so `undocumentedMembers` cannot charge it and the loss
   * would otherwise read as a clean zero. Narrowed to the unanswered ones so it measures
   * documentation actually missing from `/api` rather than a reader property no fork
   * edit can move: authoring the fork's own doc-comment clears the charge. A member the
   * fork documents is answered — the prose cannot have come from the refused block,
   * which imports nothing, so no `docSource` check is needed. A recorded
   * `parityException` is excused too: the member is deliberately undeclared, so there is
   * no element to hang a brief on and the ledger already carries a human's reading of
   * that same comment. A merely missing name is not excused — its remedy is declaring
   * it, and `callableCoverage` charging it there is a different loss. */
  refusedDocBlocks: number;
  /** The raw refusal count, before the answered and excused ones are subtracted. Kept
   * beside `refusedDocBlocks` so a corpus reading 0 cannot be mistaken for upstream
   * writing no `--`-only blocks, and the reader diagnostic that justifies the `---` rule
   * stays legible. */
  refusedDocBlocksTotal: number;
  /** How many agreeing members were compared against a floor rather than an exact count,
   * upstream being variadic. Recorded so a `callableCoverage` of 1 over a variadic
   * surface cannot be read as fully verified. */
  variadicMembers: number;
  /** How many members the fork declares as several overloads, so the comparison had a
   * set of counts to accept rather than one. Recorded beside `variadicMembers` and for
   * the same reason: a member that agrees because *one* of its shapes matches is a
   * weaker result than one that agrees outright. */
  overloadedMembers: number;
  /** How many members upstream defines with a trailing bare `_` the comparison dropped
   * before counting. A generated-module artefact: recorded so a `callableCoverage` over
   * such a surface cannot be read as agreement on every parameter upstream wrote. */
  placeholderMembers: number;
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

/** The opted-in targets, in library-data order. A target that vendors
 * no upstream Lua is measured by nothing and emits nothing. */
export function authoredParityTargets(dataDir: string): AuthoredTarget[] {
  return readAuthoredTargets(dataDir).filter((target) => target.upstreamLua.length > 0);
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
  /** The *names* whose block the reader declined, gathered here rather than in the
   * callable loop below, which never visits the field side: most refused blocks in this
   * corpus sit above a constant. Names rather than a count, so each one can be asked
   * whether the fork answered it. */
  refusedDocs: Set<string>;
}

/** The callable-axis key of an instance method, shared by both sides so a method and a
 * module function of the same name stay apart. */
function methodKey(instanceType: string, name: string): string {
  return `${instanceType}:${name}`;
}

function upstreamSurface(dataDir: string, target: AuthoredTarget): UpstreamSurface {
  const callable = new Map<string, LuaMember>();
  const fields = new Set<string>();
  const refusedDocs = new Set<string>();
  for (const relative of target.upstreamLua) {
    const surface = parseLuaSurface(readFileSync(join(dataDir, relative), "utf8"));
    for (const member of surface.members) {
      let name = member.name;
      if (member.method === true) {
        if (target.instanceType === undefined) {
          throw new Error(
            `${relative}: \`${member.name}\` is a \`:\` method, but ${libraryFile(target.repo)} gives ${target.namespace} no instanceType to measure it against — name the interface its instances are declared with.`,
          );
        }
        name = methodKey(target.instanceType, member.name);
      }
      if (member.refusedDoc) refusedDocs.add(name);
      if (member.params === undefined) fields.add(name);
      else callable.set(name, member);
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
  /** Every name whose element carries prose, across both axes. `DeclaredMember` tracks
   * the same thing for the callable side alone; `refusedDocBlocks` has to ask the
   * question of a constant too, most of this corpus's refused blocks sitting above one. */
  documented: Set<string>;
}

interface ApiDocFunction {
  name: string;
  brief?: string;
  description?: string;
  docSource?: string;
  parameters?: unknown[];
}

function declaredSurface(apiDoc: string, target: AuthoredTarget): DeclaredSurface {
  const doc = JSON.parse(apiDoc) as {
    elements: (ApiDocFunction & {
      type: string;
      global?: boolean;
      functions?: ApiDocFunction[];
    })[];
  };
  const callable = new Map<string, DeclaredMember>();
  const fields = new Set<string>();
  const documented = new Set<string>();
  let globals = 0;
  let imported = 0;
  const hasProse = (element: ApiDocFunction) =>
    (element.brief ?? "") !== "" || (element.description ?? "") !== "";
  // Merged rather than overwritten: the api-doc holds one element per overload, and
  // keeping only the last read a correctly-modelled pair as whichever shape happened to
  // come last. `documented` is true when *any* of them carries prose — the docs-site
  // renders the group, not the element.
  const addCallable = (name: string, element: ApiDocFunction) => {
    const existing = callable.get(name);
    const params = [...(existing?.params ?? []), element.parameters?.length ?? 0].sort(
      (a, b) => a - b,
    );
    callable.set(name, {
      params,
      documented: (existing?.documented ?? false) || hasProse(element),
    });
  };
  for (const element of doc.elements) {
    if (element.type !== "FUNCTION" && element.type !== "VARIABLE") continue;
    if (element.global === true) {
      globals += 1;
      continue;
    }
    if (element.docSource === "upstream") imported += 1;
    if (hasProse(element)) documented.add(element.name);
    if (element.type === "FUNCTION") addCallable(element.name, element);
    else fields.add(element.name);
  }
  const { instanceType } = target;
  if (instanceType !== undefined) {
    const typedef = doc.elements.find(
      (element) => element.type === "TYPEDEF" && element.name === instanceType,
    );
    if (typedef === undefined) {
      throw new Error(
        `${target.apiDoc}: ${libraryFile(target.repo)} names \`${instanceType}\` as ${target.namespace}'s instanceType, but the api-doc holds no TYPEDEF of that name — export the interface, or correct the name.`,
      );
    }
    for (const method of typedef.functions ?? []) {
      const name = methodKey(instanceType, method.name);
      if (method.docSource === "upstream") imported += 1;
      if (hasProse(method)) documented.add(name);
      addCallable(name, method);
    }
  }
  return { callable, fields, globals, imported, documented };
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

/**
 * Whether upstream's parameter list ends in a discard the comparison should drop.
 *
 * Only a *trailing* `_` is unreachable by position: one upstream names in the middle
 * still has to be passed for the parameters after it to land, so the fork declares it.
 *
 * `varargs` decides the case the list alone cannot show. `readParams` filters a `...` tail
 * out of `params` and reports it separately, so `function M.f(a, _, ...)` arrives here with
 * `params` ending in `_` — and that `_` is still passed for any vararg to land, which is
 * the same positional argument again.
 */
export function hasTrailingDiscard(params: readonly string[], varargs: boolean): boolean {
  return !varargs && params.at(-1) === "_";
}

/** One shared name's two parameter counts, and whether upstream's definition ends in
 * `...`. A named object rather than three scalars: two of them are numbers, and a
 * transposed call would compare the wrong pair silently. */
export interface ArityInput {
  upstreamNamed: number;
  upstreamVariadic: boolean;
  /** True when upstream's last named parameter is a generated discard no body reads and no
   * consumer can pass meaningfully, so it is not counted — `hasTrailingDiscard` is the
   * derivation, and reads more than the last entry of the list. */
  upstreamPlaceholder: boolean;
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
  placeholderChecked: boolean;
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
 * A generated module adds a third case. `nakama.lua` is written by
 * `codegen/generate-rest.go`, and 66 of its exports end in a bare `_` that no body reads
 * and no LuaDoc documents — the generator's trailing discard rather than a parameter a
 * consumer can pass. Only a *trailing* one is unreachable by position, so only a trailing
 * one is dropped, and it is dropped before either branch above: a variadic member's floor
 * is the count that remains. The reader is untouched by this — it transcribes what
 * upstream wrote, and the interpretation belongs here.
 *
 * All three softenings stay visible. `floorChecked` is true whenever upstream is variadic,
 * `overloadChecked` whenever the fork declares more than one shape, and
 * `placeholderChecked` whenever a discard was dropped — in each case whether or not it
 * changed the verdict — so `variadicMembers`, `overloadedMembers` and `placeholderMembers`
 * count every member the weaker check covered rather than only the ones it rescued.
 */
export function classifyArity(input: ArityInput): ArityVerdict {
  const upstreamNamed = input.upstreamNamed - (input.upstreamPlaceholder ? 1 : 0);
  const meets = (declared: number) =>
    input.upstreamVariadic ? declared >= upstreamNamed : declared === upstreamNamed;
  return {
    agrees: input.declared.some(meets),
    floorChecked: input.upstreamVariadic,
    overloadChecked: input.declared.length > 1,
    placeholderChecked: input.upstreamPlaceholder,
    declaredWidest: Math.max(...input.declared),
  };
}

/**
 * The parity report for one opted-in target, recomputed from the library data folder
 * alone: the vendored upstream Lua, the API model lowered from the fork, and its
 * library's parity exceptions. Pure with respect to the working tree: it reads, never
 * writes, so the committed artifact and this return value can be compared.
 */
export function buildAuthoredParity(
  dataDir: string,
  target: AuthoredTarget,
  exceptions: Record<string, AuthoredParityException[]> = readLibraryExceptions(
    dataDir,
    target.repo,
  ),
  apiDoc: string = lowerAuthoredApiDoc(dataDir, target),
): AuthoredParityReport {
  const {
    callable: upstream,
    fields: upstreamVariables,
    refusedDocs: refused,
  } = upstreamSurface(dataDir, target);
  const {
    callable: declared,
    fields: declaredVariables,
    globals: declaredGlobals,
    imported: importedDocs,
    documented: declaredDocumented,
  } = declaredSurface(apiDoc, target);
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
        `${libraryFile(target.repo)}: "${at}" excepts a member upstream does not define — delete the entry`,
      );
    }
    if (declared.has(exception.name)) {
      throw new Error(
        `${libraryFile(target.repo)}: "${at}" is unnecessary, the fork declares it — delete the entry`,
      );
    }
    excepted.set(exception.name, exception);
  }

  const refusedDocBlocks = [...refused].filter(
    (name) => !declaredDocumented.has(name) && !excepted.has(name),
  ).length;

  const missingMembers: string[] = [];
  const parityExceptions: AuthoredParityException[] = [];
  const arityMismatches: AuthoredArityMismatch[] = [];
  let undocumentedMembers = 0;
  let variadicMembers = 0;
  let overloadedMembers = 0;
  let placeholderMembers = 0;
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
    const params = member.params as string[];
    const placeholder = hasTrailingDiscard(params, member.varargs);
    // The count actually compared, so `arityMismatches` reports the number the fork has
    // to meet rather than the one upstream's line reads.
    const upstreamParams = params.length - (placeholder ? 1 : 0);
    const verdict = classifyArity({
      upstreamNamed: params.length,
      upstreamVariadic: member.varargs,
      upstreamPlaceholder: placeholder,
      declared: match.params,
    });
    if (verdict.agrees) correct += 1;
    else arityMismatches.push({ name, upstream: upstreamParams, declared: verdict.declaredWidest });
    if (verdict.floorChecked) variadicMembers += 1;
    if (verdict.overloadChecked) overloadedMembers += 1;
    if (verdict.placeholderChecked) placeholderMembers += 1;
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
    refusedDocBlocksTotal: refused.size,
    variadicMembers,
    overloadedMembers,
    placeholderMembers,
    callableCoverage: upstream.size === 0 ? 1 : round4(correct / upstream.size),
  };
}

/** The committed artifact's exact bytes, so a round-trip comparison is total. */
export function renderAuthoredParity(report: AuthoredParityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** The coverage pair a floor entry is compared against. */
export interface AuthoredCoverage {
  namespace: string;
  callableCoverage: number;
  fieldCoverage: number;
  /** Present on a native report only: whether the declared namespace is the module
   * name the C++ registers. `false` is a regression at any coverage, because every
   * declared member then sits under a global the runtime never installs. */
  moduleNameMatches?: boolean;
  /** Ratcheted against zero rather than against a floor. On the authored lane a
   * disagreeing member is already uncounted, so coverage carries it; on the native lane
   * coverage is name-based and would read 1 over a declaration nobody can call with the
   * arguments it names. Carried only from a report that declares the axis measured — a
   * report merely holding an `arityMismatches` key contributes nothing, which is what
   * keeps the zero ratchet on the native lane. */
  arityMismatches?: { name: string }[];
}

function coverageField(raw: Record<string, unknown>, field: string, path: string): number {
  const value = raw[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path}: expected a finite numeric "${field}", got ${describeValue(value)}`);
  }
  return value;
}

/**
 * Every committed parity artifact under `parityDir`, keyed by package-root-relative
 * POSIX path and sorted by that key. Both axes are read under a validating contract,
 * so a renamed or dropped coverage key throws here rather than reaching the ratchet
 * as `undefined` — where every `<` comparison would be false and the gate would pass
 * while comparing nothing. The native lane (`fidelity/native/`) shares this ratchet
 * and adds `moduleNameMatches` and the arity axis, each read here when the report
 * declares it.
 */
export function collectAuthoredParity(
  packageRoot: string,
  parityDir: string = AUTHORED_PARITY_DIR,
): Record<string, AuthoredCoverage> {
  const dir = join(packageRoot, parityDir);
  if (!existsSync(dir)) return {};
  const artifacts: Record<string, AuthoredCoverage> = {};
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    const key = `${parityDir}/${name}`;
    const raw = JSON.parse(readFileSync(join(dir, name), "utf8")) as Record<string, unknown>;
    const artifact: AuthoredCoverage = {
      namespace: String(raw.namespace),
      callableCoverage: coverageField(raw, "callableCoverage", key),
      fieldCoverage: coverageField(raw, "fieldCoverage", key),
    };
    if ("moduleNameMatches" in raw) {
      if (typeof raw.moduleNameMatches !== "boolean") {
        throw new Error(
          `${key}: expected a boolean "moduleNameMatches", got ${describeValue(raw.moduleNameMatches)}`,
        );
      }
      artifact.moduleNameMatches = raw.moduleNameMatches;
    }
    if ("arityMeasured" in raw) {
      if (typeof raw.arityMeasured !== "boolean") {
        throw new Error(
          `${key}: expected a boolean "arityMeasured", got ${describeValue(raw.arityMeasured)}`,
        );
      }
      if (raw.arityMeasured) {
        if (!Array.isArray(raw.arityMismatches)) {
          throw new Error(
            `${key}: a measured arity axis must carry an "arityMismatches" array, got ${describeValue(raw.arityMismatches)}`,
          );
        }
        artifact.arityMismatches = raw.arityMismatches.map((entry) => {
          if (
            entry === null ||
            typeof entry !== "object" ||
            typeof (entry as Record<string, unknown>).name !== "string" ||
            (entry as Record<string, unknown>).name === ""
          ) {
            throw new Error(
              `${key}: every "arityMismatches" entry must name a member, got ${describeValue(entry)}`,
            );
          }
          return { name: (entry as Record<string, unknown>).name as string };
        });
      }
    }
    artifacts[key] = artifact;
  }
  return artifacts;
}

/**
 * Every axis of every artifact that sits below its floor, one message per axis so a
 * drop on one can never be masked by the other holding. An artifact with no floor
 * entry is not reported here — the bijection assertions cover that separately. A
 * native artifact whose namespace is not its registered module name is reported
 * whatever its coverage or floor.
 */
export function authoredFloorRegressions(
  artifacts: Record<string, AuthoredCoverage>,
  floors: Record<string, AuthoredFloor>,
): string[] {
  const regressions: string[] = [];
  for (const [path, artifact] of Object.entries(artifacts)) {
    if (artifact.moduleNameMatches === false) {
      regressions.push(
        `${artifact.namespace}: the declared namespace is not the module name its C++ registers — correct the declaration`,
      );
    }
    for (const mismatch of artifact.arityMismatches ?? []) {
      regressions.push(
        `${artifact.namespace}.${mismatch.name}: the declared parameter count disagrees with upstream — correct the declaration, or record why upstream is wrong`,
      );
    }
    const floor = floors[path];
    if (floor === undefined) continue;
    const measured = { callable: artifact.callableCoverage, field: artifact.fieldCoverage };
    for (const axis of ["callable", "field"] as const) {
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
  const { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT: root } = await import("./package-root");
  for (const target of authoredParityTargets(LIBRARY_DATA_DIR)) {
    const report = buildAuthoredParity(LIBRARY_DATA_DIR, target);
    const dest = join(root, authoredParityPath(target));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, renderAuthoredParity(report));
    console.log(
      `${target.namespace}: callable ${report.upstreamMembers} upstream, ${report.missingMembers.length} missing, ${report.phantomMembers.length} phantom, ${report.arityMismatches.length} arity, coverage ${report.callableCoverage} | fields ${report.upstreamFields} upstream, ${report.missingFields.length} missing, ${report.phantomFields.length} phantom, coverage ${report.fieldCoverage}`,
    );
  }
}
