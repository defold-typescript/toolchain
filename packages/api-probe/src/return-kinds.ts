import { type FieldReport, kindMatches, shapeMismatches } from "./table-shapes";
import type { DeclaredReturns } from "./witness";

// How the values an ok call returned differ from its declaration. Every fixed
// position must be present, a nullable one as nil; a non-variadic return
// declares its width exactly, so a trailing nil past it is a value too. A
// returned table is compared with its declared shape through the fields the
// engine reported for it.
export function returnMismatches(
  declared: DeclaredReturns,
  actual: readonly string[],
  fields: FieldReport = {},
): string[] {
  const width = declared.kinds.length;
  const problems: string[] = [];
  for (let i = 0; i < Math.max(width, actual.length); i++) {
    const kind = actual[i];
    const want = declared.kinds[i];
    if (want === undefined) {
      if (!declared.variadic)
        problems.push(`value ${i + 1} is ${kind}, beyond the ${width} declared`);
      continue;
    }
    const text = want === "any" ? "any" : want.join("|");
    if (kind === undefined) {
      problems.push(`value ${i + 1} is absent, declared ${text}`);
      continue;
    }
    if (want === "any") continue;
    if (!kindMatches(kind, want)) {
      problems.push(`value ${i + 1} is ${kind}, declared ${text}`);
      continue;
    }
    const shape = declared.shapes?.[i];
    if (kind === "table" && shape !== undefined) {
      problems.push(...shapeMismatches(i + 1, shape, fields));
    }
  }
  return problems;
}
