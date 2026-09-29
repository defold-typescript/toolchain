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
  tupleComponentKeys,
} from "../../../types/scripts/index-slot-scan";
import { LIBRARY_INDEX_SLOT_CLASSIFICATIONS } from "../../../types/src/library-index-slot-classifications";
import { loadLibraryPageSources } from "./api-surface-loader";

const REAL_LIBRARY_TYPES_DIR = join(import.meta.dir, "../../../library-types");
const MAP_FILE = "packages/types/src/library-index-slot-classifications.ts";

const sources = loadLibraryPageSources(REAL_LIBRARY_TYPES_DIR);

describe("library index slot classification gate", () => {
  const sightings = new Map<string, { page: string; evidence: string }>();
  const declared = new Set<string>();
  const tupleReturns = new Set<string>();
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
    for (const { key: slot, components } of tupleComponentKeys(doc)) {
      tupleReturns.add(key(slot));
      for (const component of components) declared.add(key(`${slot}:${component}`));
    }
  }

  test("scans the loader's library pages, class fields and callback arguments included", () => {
    expect(sources.map((source) => source.page.category)).not.toContain("engine");
    expect(sightings.has("gooey/set_focus:param:index")).toBe(true);
    expect(sightings.has("decore/system:field:index")).toBe(true);
    expect(declared.has("bridge/bridge.daily_rewards.get_current_day:param:on_success:day")).toBe(
      true,
    );
    expect(declared.has("tile_raycast/cast:return::tile_x")).toBe(true);
    expect(declared.has("tile_raycast/cast:return::array_id")).toBe(true);
    expect(declared.has("tile_raycast/cast:return::side")).toBe(true);
    expect(declared.has("tile_raycast/cast:return::LEFT")).toBe(false);
    expect(declared.has("tile_raycast/cast:return::tile_index")).toBe(false);
  });

  test("an unnamed multi-value return is never classified as one position", () => {
    const whole = [...tupleReturns].filter((key) => {
      const base = LIBRARY_INDEX_SLOT_CLASSIFICATIONS.get(key)?.class;
      return base === "native-1" || base === "native-0";
    });
    expect(tupleReturns.has("tile_raycast/cast:return:")).toBe(true);
    if (whole.length > 0) {
      throw new Error(
        `these returns hold several values; classify each positional value as \`<key>:<value>\` in ${MAP_FILE}:\n${whole.join("\n")}`,
      );
    }
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
