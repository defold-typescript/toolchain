import type { LibraryIndexSlotClassifications } from "@defold-typescript/types";
import { parseLibraryIndexSlotClassifications } from "@defold-typescript/types/library-runtime";
import { readIndexSlots } from "./library-data";

export function readLibraryIndexSlotClassifications(
  dataDir: string,
): LibraryIndexSlotClassifications {
  return parseLibraryIndexSlotClassifications(readIndexSlots(dataDir));
}
