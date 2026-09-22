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
import { classifyFieldAxis } from "./authored-parity";
import { parseNativeRegistration } from "./parse-native-registration";
import { lowerNativeApiDoc, type NativeTarget, readNativeTargets } from "./sync-native-types";

export const NATIVE_PARITY_DIR = "fidelity/native";

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

export function buildNativeParity(packageRoot: string, target: NativeTarget): NativeParityReport {
  const { elements } = JSON.parse(lowerNativeApiDoc(packageRoot, target)) as {
    elements: { type: string; name: string }[];
  };
  const declaredCallable = new Set(
    elements.filter((element) => element.type === "FUNCTION").map((element) => element.name),
  );
  const declaredVariables = new Set(
    elements.filter((element) => element.type === "VARIABLE").map((element) => element.name),
  );

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
    console.log(
      `${target.namespace}: module ${report.moduleName}${report.moduleNameMatches ? "" : " (MISMATCH)"} | functions ${report.upstreamFunctions} upstream, ${report.missingFunctions.length} missing, ${report.phantomFunctions.length} phantom, coverage ${report.callableCoverage} | constants ${report.upstreamConstants} upstream, ${report.missingConstants.length} missing, ${report.phantomConstants.length} phantom, coverage ${report.fieldCoverage}`,
    );
  }
}
