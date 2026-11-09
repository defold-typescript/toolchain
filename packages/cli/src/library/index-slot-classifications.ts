import type { LibraryIndexSlotClassifications } from "@defold-typescript/types";
import { parseLibraryIndexSlotClassifications } from "@defold-typescript/types/library-runtime";
import { type ReadLibraryOptions, readIndexSlots } from "./library-data";

export function readLibraryIndexSlotClassifications(
  dataDir: string,
  read: ReadLibraryOptions = {},
): LibraryIndexSlotClassifications {
  return parseLibraryIndexSlotClassifications(readIndexSlots(dataDir, read));
}
