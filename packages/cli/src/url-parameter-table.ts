import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import type { UrlParameterTable } from "@defold-typescript/types";

const requireFromHere = createRequire(import.meta.url);

// A file read through the package's `./url-parameters.json` export subpath, and
// deliberately not a value import from `@defold-typescript/types`: that entry
// resolves to TypeScript source, which survives `--packages=external` into the
// packed CLI and fails under plain node exactly the way bug-88 did. The JSON
// subpath has no such hazard.
export function loadUrlParameterTable(): UrlParameterTable {
  const tablePath = requireFromHere.resolve("@defold-typescript/types/url-parameters.json");
  return JSON.parse(readFileSync(tablePath, "utf8")) as UrlParameterTable;
}
