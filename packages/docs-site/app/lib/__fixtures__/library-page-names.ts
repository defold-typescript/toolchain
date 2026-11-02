import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LIBRARY_DATA_DIR, LIBRARY_TYPES_ROOT } from "../../../../cli/src/library/package-root";

// The names library pages went by, read from the data files that fed them, so a
// test can prove no surface still offers one.
export function libraryPageNames(): string[] {
  const stems = readdirSync(join(LIBRARY_TYPES_ROOT, "api-doc"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length));
  const { libraries } = JSON.parse(
    readFileSync(join(LIBRARY_DATA_DIR, "defold-extensions.json"), "utf8"),
  ) as { libraries: { docs: { page: string }[] }[] };
  return [...stems, ...libraries.flatMap((library) => library.docs.map((doc) => doc.page))];
}
