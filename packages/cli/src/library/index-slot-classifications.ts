import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LibraryIndexSlotClassifications } from "@defold-typescript/types";
import { parseLibraryIndexSlotClassifications } from "@defold-typescript/types/library-runtime";

export const INDEX_SLOT_CLASSIFICATIONS_FILE = "index-slot-classifications.json";

export function readLibraryIndexSlotClassifications(
  packageRoot: string,
): LibraryIndexSlotClassifications {
  return parseLibraryIndexSlotClassifications(
    JSON.parse(readFileSync(join(packageRoot, INDEX_SLOT_CLASSIFICATIONS_FILE), "utf8")),
  );
}
