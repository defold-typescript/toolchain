import SCAFFOLD_COMPILER_OPTIONS from "./scaffold-tsconfig.json";

export interface ScaffoldStrictness {
  exactOptionalPropertyTypes: boolean;
  noUncheckedIndexedAccess: boolean;
}

// The repo's tsconfig sets both flags; a scaffolded project omits them, so an
// omitted flag is `false` here and overrides the repo's `true`.
export function scaffoldStrictness(
  scaffold: Readonly<Record<string, unknown>> = SCAFFOLD_COMPILER_OPTIONS,
): ScaffoldStrictness {
  return {
    exactOptionalPropertyTypes: scaffold.exactOptionalPropertyTypes === true,
    noUncheckedIndexedAccess: scaffold.noUncheckedIndexedAccess === true,
  };
}
