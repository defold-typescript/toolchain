/**
 * Surface parity for the curated native-extension lane: what each hand-authored
 * declaration names against what its vendored C++ registers.
 *
 * The declared side is `lowerNativeApiDoc`'s model — the same one the `/api` page
 * renders — with `FUNCTION` elements as callables and `VARIABLE` elements as
 * constants. The upstream side is `parseNativeRegistration` over the target's
 * `upstreamSource`. The two axes are reported separately and never averaged, under
 * the authored lane's either-side rule (`classifyFieldAxis`), and ratcheted by the
 * same `authored-parity-floor.json`.
 *
 * A native module has one more way to be wrong than a Lua one: its declaration can
 * sit under a namespace other than the name the C++ registers, which leaves every
 * member unreachable at runtime while both axes still read 1. `moduleNameMatches`
 * records that separately, and the floor gate treats `false` as a regression.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type AuthoredArityMismatch, classifyArity, classifyFieldAxis } from "./authored-parity";
import { parseLuaSurface } from "./parse-lua-surface";
import { parseNativeRegistration } from "./parse-native-registration";
import { lowerNativeApiDoc, type NativeTarget, readNativeTargets } from "./sync-native-types";

export const NATIVE_PARITY_DIR = "fidelity/native";

/** A recorded mismatch the declaration is right to carry, with upstream's own citation. */
export interface NativeArityException extends AuthoredArityMismatch {
  reason: string;
}

/** Where the annotation and the registration table disagree about *which* members
 * exist. Neither list is charged to coverage or to arity: the C++ table is what runs,
 * so a name only the annotation declares is upstream's own staleness, and a name only
 * the C++ registers is simply one the annotation never documented. */
export interface NativeAnnotationDrift {
  unregistered: string[];
  undeclared: string[];
}

export interface NativeParityReport {
  namespace: string;
  moduleName: string;
  moduleNameMatches: boolean;
  upstreamFunctions: number;
  declaredFunctions: number;
  missingFunctions: string[];
  phantomFunctions: string[];
  callableCoverage: number;
  upstreamConstants: number;
  declaredConstants: number;
  missingConstants: string[];
  phantomConstants: string[];
  fieldCoverage: number;
  /** Whether the target names an annotation to read parameter lists from. False leaves
   * the three lists below absent, so an unmeasured target cannot be read as one that
   * was measured and agreed. */
  arityMeasured: boolean;
  arityMismatches?: AuthoredArityMismatch[];
  arityExceptions?: NativeArityException[];
  annotationDrift?: NativeAnnotationDrift;
}

/** Package-root-relative POSIX path of a target's committed parity report. */
export function nativeParityPath(target: NativeTarget): string {
  return `${NATIVE_PARITY_DIR}/${target.namespace}.json`;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function coverage(upstream: number, missing: number): number {
  return upstream === 0 ? 1 : round4((upstream - missing) / upstream);
}

interface ArityAxis {
  arityMeasured: boolean;
  arityMismatches?: AuthoredArityMismatch[];
  arityExceptions?: NativeArityException[];
  annotationDrift?: NativeAnnotationDrift;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/**
 * The arity axis for one target, compared only over names all three sources share.
 *
 * The comparison is the authored lane's `classifyArity`, so a variadic stub becomes a
 * floor and a declaration written as overloads agrees when any one shape meets it. What
 * the native lane adds is a third source: the annotation is upstream *prose about* the
 * C++, not the C++ itself, and it can be wrong about its own module. Where it is, the
 * declaration follows the registration — that is what runs — and the divergence is
 * recorded as an exception carrying upstream's citation rather than reported as a defect
 * in the declaration. An exception the declaration no longer needs throws, so the ledger
 * cannot outlive the disagreement it excuses.
 */
function measureArity(
  packageRoot: string,
  target: NativeTarget,
  registered: ReadonlySet<string>,
  declaredArity: ReadonlyMap<string, number[]>,
): ArityAxis {
  if (target.upstreamAnnotation === undefined) return { arityMeasured: false };
  const annotation = parseLuaSurface(
    readFileSync(join(packageRoot, target.upstreamAnnotation), "utf8"),
    { moduleLocal: target.namespace },
  );
  const stubs = new Map(
    annotation.members
      .filter((member) => member.params !== undefined)
      .map((member) => [member.name, member] as const),
  );

  const excepted = new Map<string, string>();
  for (const entry of target.annotationArityExceptions ?? []) {
    const at = `${target.namespace}.${entry.name}`;
    if (!stubs.has(entry.name) || !registered.has(entry.name)) {
      throw new Error(
        `native-targets.json: "${at}" excepts a member the annotation and the C++ do not share — delete the entry`,
      );
    }
    if (excepted.has(entry.name)) {
      throw new Error(`native-targets.json: "${at}" is excepted twice — keep one entry`);
    }
    excepted.set(entry.name, entry.reason);
  }

  const arityMismatches: AuthoredArityMismatch[] = [];
  const arityExceptions: NativeArityException[] = [];
  for (const [name, stub] of stubs) {
    const declared = declaredArity.get(name);
    if (!registered.has(name) || declared === undefined) continue;
    const params = stub.params as string[];
    const verdict = classifyArity({
      upstreamNamed: params.length,
      upstreamVariadic: stub.varargs,
      upstreamPlaceholder: false,
      declared,
    });
    const reason = excepted.get(name);
    if (verdict.agrees) {
      if (reason === undefined) continue;
      throw new Error(
        `native-targets.json: "${target.namespace}.${name}" records an annotation-arity exception, but the declaration agrees with the annotation — delete the entry`,
      );
    }
    const mismatch = { name, upstream: params.length, declared: verdict.declaredWidest };
    if (reason === undefined) arityMismatches.push(mismatch);
    else arityExceptions.push({ ...mismatch, reason });
  }

  return {
    arityMeasured: true,
    arityMismatches: arityMismatches.sort(byName),
    arityExceptions: arityExceptions.sort(byName),
    annotationDrift: {
      unregistered: [...stubs.keys()].filter((name) => !registered.has(name)).sort(),
      undeclared: [...registered].filter((name) => !stubs.has(name)).sort(),
    },
  };
}

export function buildNativeParity(packageRoot: string, target: NativeTarget): NativeParityReport {
  const { elements } = JSON.parse(lowerNativeApiDoc(packageRoot, target)) as {
    elements: { type: string; name: string; parameters?: unknown[] }[];
  };
  const declaredCallable = new Set(
    elements.filter((element) => element.type === "FUNCTION").map((element) => element.name),
  );
  const declaredVariables = new Set(
    elements.filter((element) => element.type === "VARIABLE").map((element) => element.name),
  );
  // One entry per overload, merged into the set of shapes the name offers — keeping only
  // the last would read a correctly-modelled pair as whichever came last.
  const declaredArity = new Map<string, number[]>();
  for (const element of elements) {
    if (element.type !== "FUNCTION") continue;
    declaredArity.set(
      element.name,
      [...(declaredArity.get(element.name) ?? []), element.parameters?.length ?? 0].sort(
        (a, b) => a - b,
      ),
    );
  }

  const registration = parseNativeRegistration(
    readFileSync(join(packageRoot, target.upstreamSource), "utf8"),
    target.upstreamSource,
  );
  const upstreamCallable = new Set(registration.functions);

  const missingFunctions = [...upstreamCallable].filter((name) => !declaredCallable.has(name));
  const phantomFunctions = [...declaredCallable].filter((name) => !upstreamCallable.has(name));
  const fields = classifyFieldAxis({
    upstreamCallable,
    upstreamNonCallable: new Set(registration.constants),
    declaredCallable,
    declaredVariables,
  });

  return {
    namespace: target.namespace,
    moduleName: registration.moduleName,
    moduleNameMatches: registration.moduleName === target.namespace,
    upstreamFunctions: upstreamCallable.size,
    declaredFunctions: declaredCallable.size,
    missingFunctions: missingFunctions.sort(),
    phantomFunctions: phantomFunctions.sort(),
    callableCoverage: coverage(upstreamCallable.size, missingFunctions.length),
    upstreamConstants: fields.upstreamFields.size,
    declaredConstants: fields.declaredFields.size,
    missingConstants: fields.missingFields,
    phantomConstants: fields.phantomFields,
    fieldCoverage: coverage(fields.upstreamFields.size, fields.missingFields.length),
    ...measureArity(packageRoot, target, upstreamCallable, declaredArity),
  };
}

/** The committed report's exact bytes, so a round-trip comparison is total. */
export function renderNativeParity(report: NativeParityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

if (import.meta.main) {
  const root = join(import.meta.dir, "..");
  for (const target of readNativeTargets(root)) {
    const report = buildNativeParity(root, target);
    const dest = join(root, nativeParityPath(target));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, renderNativeParity(report));
    const arity = report.arityMeasured
      ? `${report.arityMismatches?.length ?? 0} arity, ${report.arityExceptions?.length ?? 0} excepted, ${(report.annotationDrift?.unregistered.length ?? 0) + (report.annotationDrift?.undeclared.length ?? 0)} drift`
      : "arity unmeasured";
    console.log(
      `${target.namespace}: module ${report.moduleName}${report.moduleNameMatches ? "" : " (MISMATCH)"} | functions ${report.upstreamFunctions} upstream, ${report.missingFunctions.length} missing, ${report.phantomFunctions.length} phantom, coverage ${report.callableCoverage} | constants ${report.upstreamConstants} upstream, ${report.missingConstants.length} missing, ${report.phantomConstants.length} phantom, coverage ${report.fieldCoverage} | ${arity}`,
    );
  }
}
