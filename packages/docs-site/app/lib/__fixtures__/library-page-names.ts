import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { newestDataFolder } from "../../../../cli/src/library/data-folder";

const LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../../library-types");

// The names library pages went by, read from the data files that fed them, so a
// test can prove no surface still offers one.
export function libraryPageNames(): string[] {
  const stems = readdirSync(join(LIBRARY_TYPES_DIR, "api-doc"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.slice(0, -".json".length));
  const { libraries } = JSON.parse(
    readFileSync(join(newestDataFolder(LIBRARY_TYPES_DIR), "defold-extensions.json"), "utf8"),
  ) as { libraries: { docs: { page: string }[] }[] };
  return [...stems, ...libraries.flatMap((library) => library.docs.map((doc) => doc.page))];
}
