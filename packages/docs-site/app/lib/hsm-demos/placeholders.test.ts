import { expect, test } from "bun:test";
import { join } from "node:path";
import { renderGuidePage } from "../content";
import { listGuidePages } from "../guide-loader";
import { DEMOS } from "./demos";

const GUIDE_DIR = join(import.meta.dir, "../../../../docs/guide");

test("the state machines tutorial places every demo exactly once, and only demos that exist", async () => {
  const page = listGuidePages(GUIDE_DIR).find((p) => p.slug === "state-machines-tutorial");
  expect(page, "guide page state-machines-tutorial").toBeDefined();
  const html = await renderGuidePage(GUIDE_DIR, page as NonNullable<typeof page>);
  const placed = [...html.matchAll(/\bdata-hsm-demo="([^"]*)"/g)].map((m) => m[1] as string);
  expect(placed.filter((id) => !Object.hasOwn(DEMOS, id))).toEqual([]);
  expect([...placed].sort()).toEqual(Object.keys(DEMOS).sort());
});
