import type { DeclaredKinds } from "../../types/scripts/lua-kind";
import type { DeclaredReturns } from "./witness";

// A Defold buffer reports as plain userdata. An `Opaque` handle hides its
// representation: most are userdata, a render target is a numeric asset handle.
function matches(actual: string, declared: Exclude<DeclaredKinds, "any">): boolean {
  if ((declared as readonly string[]).includes(actual)) return true;
  if (actual === "userdata") return declared.includes("buffer");
  return actual === "number" && declared.includes("userdata");
}

// How the values an ok call returned differ from its declaration. A value past
// the last one returned reads as nil, as it does in Lua.
export function returnMismatches(declared: DeclaredReturns, actual: readonly string[]): string[] {
  const width = declared.kinds.length;
  const problems: string[] = [];
  for (let i = 0; i < Math.max(width, actual.length); i++) {
    const kind = actual[i] ?? "nil";
    const want = declared.kinds[i];
    if (want === undefined) {
      if (!declared.variadic && kind !== "nil") {
        problems.push(`value ${i + 1} is ${kind}, beyond the ${width} declared`);
      }
      continue;
    }
    if (want !== "any" && !matches(kind, want)) {
      problems.push(`value ${i + 1} is ${kind}, declared ${want.join("|")}`);
    }
  }
  return problems;
}
