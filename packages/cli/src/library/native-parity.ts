/**
 * Surface parity for the curated native-extension lane: what each hand-authored
 * declaration names against what its vendored C++ registers.
 *
 * The declared side is `lowerNativeApiDoc`'s model — the same one the `/api` page
 * renders — with `FUNCTION` elements as callables, the method signatures of its
 * `TYPEDEF` elements as userdata methods, and `VARIABLE` elements as constants.
 * The upstream side is `parseNativeRegistration` over the target's
 * `upstreamSource`, plus `parseNativeMethodTables` over each of its
 * `upstreamMethodSources`. Methods are measured per metatable, against the
 * interfaces the target's `methodTables` maps it to, and count on the callable
 * axis. The two axes are reported separately and never averaged, under
 * the authored lane's either-side rule (`classifyFieldAxis`), and ratcheted by the
 * same parity floors in its `library.json`.
 *
 * A native module has one more way to be wrong than a Lua one: its declaration can
 * sit under a namespace other than the name the C++ registers, which leaves every
 * member unreachable at runtime while both axes still read 1. `moduleNameMatches`
 * records that separately, and the floor gate treats `false` as a regression.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type AuthoredArityMismatch, classifyArity, classifyFieldAxis } from "./authored-parity";
import { libraryFile } from "./library-data";
import { parseLuaSurface } from "./parse-lua-surface";
import { parseNativeMethodTables, parseNativeRegistration } from "./parse-native-registration";
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
  /** (metatable, method) pairs the C++ registers. */
  upstreamMethods: number;
  /** (metatable, method) pairs the declaration provides through `methodTables`. */
  declaredMethods: number;
  /** `<metatable>.<method>`, registered but not declared on that metatable's interfaces. */
  missingMethods: string[];
  /** `<metatable>.<method>`, declared on that metatable's interfaces but not registered. */
  phantomMethods: string[];
  /** Functions and userdata methods together, so a dropped method lowers it as a
   * dropped function does. */
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
  dataDir: string,
  target: NativeTarget,
  registered: ReadonlySet<string>,
  declaredArity: ReadonlyMap<string, number[]>,
): ArityAxis {
  if (target.upstreamAnnotation === undefined) return { arityMeasured: false };
  const annotation = parseLuaSurface(
    readFileSync(join(dataDir, target.upstreamAnnotation), "utf8"),
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
        `${libraryFile(target.repo)}: "${at}" excepts a member the annotation and the C++ do not share — delete the entry`,
      );
    }
    if (excepted.has(entry.name)) {
      throw new Error(`${libraryFile(target.repo)}: "${at}" is excepted twice — keep one entry`);
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
        `${libraryFile(target.repo)}: "${target.namespace}.${name}" records an annotation-arity exception, but the declaration agrees with the annotation — delete the entry`,
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

interface MethodAxis {
  upstreamMethods: number;
  declaredMethods: number;
  missingMethods: string[];
  phantomMethods: string[];
}

/**
 * The userdata methods, measured per metatable. The C++ fills one metatable per
 * nameless `luaL_register` call and never says which declared type it belongs to, so
 * `methodTables` says so, and each metatable is compared with the union of its
 * interfaces' method signatures. Matching by bare name across every interface would
 * read a method dropped from one type as declared whenever a sibling type declares the
 * same name.
 *
 * Every method on either side must be measured: a registered metatable with no entry, an
 * entry for a metatable nothing registers, an entry naming an interface the declaration
 * lacks, a declared type with methods no entry names, and a metatable registered twice
 * all throw.
 */
function measureMethods(
  dataDir: string,
  target: NativeTarget,
  ownTables: Record<string, string[]>,
  typedefs: ReadonlyMap<string, ReadonlySet<string>>,
): MethodAxis {
  const at = `${libraryFile(target.repo)}: "${target.namespace}"`;
  const sources: [file: string, tables: Record<string, string[]>][] = [
    [target.upstreamSource, ownTables],
    ...(target.upstreamMethodSources ?? []).map(
      (file) =>
        [file, parseNativeMethodTables(readFileSync(join(dataDir, file), "utf8"), file)] as [
          string,
          Record<string, string[]>,
        ],
    ),
  ];
  const registered = new Map<string, { file: string; methods: string[] }>();
  for (const [file, tables] of sources) {
    for (const [metatable, methods] of Object.entries(tables)) {
      const earlier = registered.get(metatable);
      if (earlier !== undefined) {
        throw new Error(
          `${at} fills metatable "${metatable}" more than once, in ${earlier.file} and ${file} — list each method source once`,
        );
      }
      registered.set(metatable, { file, methods });
    }
  }

  const methodTables = target.methodTables ?? {};
  for (const [metatable, { file }] of registered) {
    if (!(metatable in methodTables)) {
      throw new Error(
        `${at} fills metatable "${metatable}" in ${file}, but has no methodTables entry for it — map it to the interfaces it provides`,
      );
    }
  }
  const mapped = new Set<string>();
  for (const [metatable, interfaces] of Object.entries(methodTables)) {
    if (!registered.has(metatable)) {
      throw new Error(
        `${at} has a methodTables entry "${metatable}" for a metatable nothing registers — delete the entry`,
      );
    }
    for (const name of interfaces) {
      if (!typedefs.has(name)) {
        throw new Error(
          `${at} maps metatable "${metatable}" to "${name}", but the declaration's API doc has no type "${name}" — declare it where a member's signature reaches it`,
        );
      }
      mapped.add(name);
    }
  }
  const unmapped = [...typedefs]
    .filter(([name, methods]) => methods.size > 0 && !mapped.has(name))
    .map(([name]) => `"${name}"`);
  if (unmapped.length > 0) {
    throw new Error(
      `${at} declares methods on ${unmapped.join(", ")}, which no methodTables entry names, so they would go unmeasured`,
    );
  }

  let upstreamMethods = 0;
  let declaredMethods = 0;
  const missingMethods: string[] = [];
  const phantomMethods: string[] = [];
  for (const [metatable, { methods }] of registered) {
    const upstream = new Set(methods);
    const declared = new Set(
      (methodTables[metatable] ?? []).flatMap((name) => [...(typedefs.get(name) ?? [])]),
    );
    upstreamMethods += upstream.size;
    declaredMethods += declared.size;
    for (const name of upstream) {
      if (!declared.has(name)) missingMethods.push(`${metatable}.${name}`);
    }
    for (const name of declared) {
      if (!upstream.has(name)) phantomMethods.push(`${metatable}.${name}`);
    }
  }
  return {
    upstreamMethods,
    declaredMethods,
    missingMethods: missingMethods.sort(),
    phantomMethods: phantomMethods.sort(),
  };
}

export function buildNativeParity(dataDir: string, target: NativeTarget): NativeParityReport {
  const { elements } = JSON.parse(lowerNativeApiDoc(dataDir, target)) as {
    elements: {
      type: string;
      name: string;
      parameters?: unknown[];
      functions?: { name: string }[];
    }[];
  };
  const declaredCallable = new Set(
    elements.filter((element) => element.type === "FUNCTION").map((element) => element.name),
  );
  // A userdata method is matched per metatable, against the interfaces `methodTables`
  // maps it to; `measureMethods` says why a bare-name match across every type would not do.
  const typedefs = new Map<string, Set<string>>();
  for (const element of elements) {
    if (element.type !== "TYPEDEF") continue;
    const methods = typedefs.get(element.name) ?? new Set<string>();
    for (const method of element.functions ?? []) methods.add(method.name);
    typedefs.set(element.name, methods);
  }
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
    [...(target.upstreamHeaders ?? []), target.upstreamSource]
      .map((file) => readFileSync(join(dataDir, file), "utf8"))
      .join("\n"),
    target.upstreamSource,
  );
  const upstreamCallable = new Set(registration.functions);

  const missingFunctions = [...upstreamCallable].filter((name) => !declaredCallable.has(name));
  const phantomFunctions = [...declaredCallable].filter((name) => !upstreamCallable.has(name));
  const methods = measureMethods(dataDir, target, registration.methods, typedefs);
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
    ...methods,
    callableCoverage: coverage(
      upstreamCallable.size + methods.upstreamMethods,
      missingFunctions.length + methods.missingMethods.length,
    ),
    upstreamConstants: fields.upstreamFields.size,
    declaredConstants: fields.declaredFields.size,
    missingConstants: fields.missingFields,
    phantomConstants: fields.phantomFields,
    fieldCoverage: coverage(fields.upstreamFields.size, fields.missingFields.length),
    ...measureArity(dataDir, target, upstreamCallable, declaredArity),
  };
}

/** The committed report's exact bytes, so a round-trip comparison is total. */
export function renderNativeParity(report: NativeParityReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

if (import.meta.main) {
  const { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT: root } = await import("./package-root");
  for (const target of readNativeTargets(LIBRARY_DATA_DIR)) {
    const report = buildNativeParity(LIBRARY_DATA_DIR, target);
    const dest = join(root, nativeParityPath(target));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, renderNativeParity(report));
    const arity = report.arityMeasured
      ? `${report.arityMismatches?.length ?? 0} arity, ${report.arityExceptions?.length ?? 0} excepted, ${(report.annotationDrift?.unregistered.length ?? 0) + (report.annotationDrift?.undeclared.length ?? 0)} drift`
      : "arity unmeasured";
    console.log(
      `${target.namespace}: module ${report.moduleName}${report.moduleNameMatches ? "" : " (MISMATCH)"} | functions ${report.upstreamFunctions} upstream, ${report.missingFunctions.length} missing, ${report.phantomFunctions.length} phantom | methods ${report.upstreamMethods} upstream, ${report.missingMethods.length} missing, ${report.phantomMethods.length} phantom | callable coverage ${report.callableCoverage} | constants ${report.upstreamConstants} upstream, ${report.missingConstants.length} missing, ${report.phantomConstants.length} phantom, coverage ${report.fieldCoverage} | ${arity}`,
    );
  }
}
