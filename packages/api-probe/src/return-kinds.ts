import type { DeclaredKinds } from "../../types/scripts/lua-kind";
import type { DeclaredReturns } from "./witness";

// A Defold buffer reports as plain userdata. An `Opaque` handle hides its
// representation: most are userdata, a render target is a numeric asset handle.
function matches(actual: string, declared: Exclude<DeclaredKinds, "any">): boolean {
  if ((declared as readonly string[]).includes(actual)) return true;
  if (actual === "userdata") return declared.includes("buffer");
  return actual === "number" && declared.includes("userdata");
}

// How the values an ok call returned differ from its declaration. Every fixed
// position must be present, a nullable one as nil; a non-variadic return
// declares its width exactly, so a trailing nil past it is a value too.
export function returnMismatches(declared: DeclaredReturns, actual: readonly string[]): string[] {
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
    if (want !== "any" && !matches(kind, want)) {
      problems.push(`value ${i + 1} is ${kind}, declared ${text}`);
    }
  }
  return problems;
}
