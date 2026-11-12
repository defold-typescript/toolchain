/** Files under one folder that each of `INCLUDE_PARITY_PATTERNS` partly matches. */
export const INCLUDE_PARITY_FILES = [
  "save.ts",
  "util.ts",
  "other.ts",
  "deep/sub.ts",
  "deep/zzz.ts",
  "deep/more/save.ts",
] as const;

/** Include patterns whose classes, negation, ranges and brace lists `globSync` honors. */
export const INCLUDE_PARITY_PATTERNS = [
  "src/**/[su]*.ts",
  "src/**/[!s]*.ts",
  "src/**/[a-t]*.ts",
  "src/**/{save,sub}.ts",
  "src/*/{deep,none}/**/*.ts",
] as const;
