import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type LibraryIndexSlotClassifications,
  parseLibraryIndexSlotClassifications,
} from "@defold-typescript/types";

export const INDEX_SLOT_CLASSIFICATIONS_FILE = "index-slot-classifications.json";

export function readLibraryIndexSlotClassifications(
  packageRoot: string = join(import.meta.dir, ".."),
): LibraryIndexSlotClassifications {
  return parseLibraryIndexSlotClassifications(
    JSON.parse(readFileSync(join(packageRoot, INDEX_SLOT_CLASSIFICATIONS_FILE), "utf8")),
  );
}
