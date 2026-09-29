import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
  callbackArgKeys,
  classFieldKeys,
  isIndexName,
  refDocSlotKeys,
  scanFunctionBaseStatements,
  scanIndexSlots,
  scanTypedefMemberSlots,
} from "../../../types/scripts/index-slot-scan";
import { LIBRARY_INDEX_SLOT_CLASSIFICATIONS } from "../../../types/src/library-index-slot-classifications";
import { loadLibraryPageSources } from "./api-surface-loader";

const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");
const MAP_FILE = "packages/types/src/library-index-slot-classifications.ts";

const sources = loadLibraryPageSources(REAL_LIBRARY_TYPES_DIR);

describe("library index slot classification gate", () => {
  const sightings = new Map<string, { page: string; evidence: string }>();
  const declared = new Set<string>();
  for (const { page, doc } of sources) {
    const key = (slot: string): string => `${page.namespace}/${slot}`;
    const sight = (slot: string, evidence: string): void => {
      if (!sightings.has(key(slot))) sightings.set(key(slot), { page: page.namespace, evidence });
    };
    for (const hit of scanIndexSlots(doc, page.namespace)) sight(hit.key, hit.evidence);
    for (const hit of scanTypedefMemberSlots(doc)) sight(hit.key, hit.evidence);
    for (const slot of callbackArgKeys(doc)) {
      if (isIndexName(slot.slice(slot.lastIndexOf(":") + 1))) sight(slot, "name");
    }
    for (const slot of [...refDocSlotKeys(doc), ...classFieldKeys(doc), ...callbackArgKeys(doc)]) {
      declared.add(key(slot));
    }
  }

  test("scans the loader's library pages, class fields and callback arguments included", () => {
    expect(sources.map((source) => source.page.category)).not.toContain("engine");
    expect(sightings.has("gooey/set_focus:param:index")).toBe(true);
    expect(sightings.has("decore/system:field:index")).toBe(true);
    expect(declared.has("bridge/bridge.daily_rewards.get_current_day:param:on_success:day")).toBe(
      true,
    );
  });

  test("every scanned library index slot is classified", () => {
    const unclassified = [...sightings.entries()]
      .filter(([key]) => !LIBRARY_INDEX_SLOT_CLASSIFICATIONS.has(key))
      .map(([key, seen]) => `${key} (${seen.page}, ${seen.evidence})`);
    if (unclassified.length > 0) {
      throw new Error(
        `classify these index slots in LIBRARY_INDEX_SLOT_CLASSIFICATIONS (${MAP_FILE}):\n${unclassified.join("\n")}`,
      );
    }
  });

  test("every classification names a slot its page declares", () => {
    const stale = [...LIBRARY_INDEX_SLOT_CLASSIFICATIONS.keys()].filter(
      (key) => !declared.has(key),
    );
    if (stale.length > 0) {
      throw new Error(
        `no library page declares these slots; delete or correct the classification in ${MAP_FILE}:\n${stale.join("\n")}`,
      );
    }
  });

  test("each base a function states is recorded on one of its slots", () => {
    const missing: string[] = [];
    for (const { page, doc } of sources) {
      for (const statement of scanFunctionBaseStatements(doc, page.namespace)) {
        const prefix = `${page.namespace}/${statement.fn}:`;
        const recorded = [...LIBRARY_INDEX_SLOT_CLASSIFICATIONS].some(
          ([key, classification]) =>
            key.startsWith(prefix) && classification.class === statement.class,
        );
        if (!recorded) {
          missing.push(
            `${page.namespace}/${statement.fn} (${page.namespace}, ${statement.class}, ${statement.phrase})`,
          );
        }
      }
    }
    if (missing.length > 0) {
      throw new Error(
        `classify a slot of each function in LIBRARY_INDEX_SLOT_CLASSIFICATIONS (${MAP_FILE}) with the base it states:\n${missing.join("\n")}`,
      );
    }
  });
});
