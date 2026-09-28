import { describe, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serializeIndexSlots } from "./index-slot-classifications";

describe("index-slots.json", () => {
  test("matches the classification table the transpiler converts by", () => {
    const committed = readFileSync(join(import.meta.dir, "..", "index-slots.json"), "utf8");
    if (committed !== serializeIndexSlots()) {
      throw new Error(
        "packages/types/index-slots.json is stale; run `bun run --cwd packages/types regen`",
      );
    }
  });
});
