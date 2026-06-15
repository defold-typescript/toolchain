import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { extractSurface, type SymbolDoc } from "./doc-surface-extract";

const GENERATED = resolve(import.meta.dir, "..", "generated");
const FIXTURE = resolve(import.meta.dir, "fixtures", "ts-defold-types.index.d.ts");

async function loadOurSurface(): Promise<Map<string, SymbolDoc>> {
  const merged = new Map<string, SymbolDoc>();
  const files = readdirSync(GENERATED).filter((f) => f.endsWith(".d.ts"));
  for (const file of files) {
    const content = await Bun.file(resolve(GENERATED, file)).text();
    for (const [key, doc] of extractSurface(content)) {
      const existing = merged.get(key);
      if (existing) {
        existing.hasDescription ||= doc.hasDescription;
        existing.hasReturns ||= doc.hasReturns;
        existing.hasExample ||= doc.hasExample;
        for (const p of doc.paramNames) existing.paramNames.add(p);
      } else {
        merged.set(key, doc);
      }
    }
  }
  return merged;
}

describe("api-doc parity — coverage superset over pinned ts-defold-types", () => {
  test("the extractor finds buffer.get_bytes with a description, two params, and a returns", async () => {
    const theirs = extractSurface(await Bun.file(FIXTURE).text());
    const sample = theirs.get("buffer.get_bytes");
    expect(sample).toBeDefined();
    expect(sample?.hasDescription).toBe(true);
    expect(sample?.paramNames).toEqual(new Set(["buffer", "stream_name"]));
    expect(sample?.hasReturns).toBe(true);
  });

  test("our surface documents buffer.get_bytes at least as well", async () => {
    const ours = await loadOurSurface();
    const sample = ours.get("buffer.get_bytes");
    expect(sample).toBeDefined();
    expect(sample?.hasDescription).toBe(true);
    expect(sample?.paramNames).toEqual(new Set(["buffer", "stream_name"]));
    expect(sample?.hasReturns).toBe(true);
  });

  test("@defold-typescript/types docs are a superset of ts-defold-types for every shared symbol", async () => {
    const theirs = extractSurface(await Bun.file(FIXTURE).text());
    const ours = await loadOurSurface();

    const regressions: string[] = [];
    let sharedCount = 0;
    let coverageNotes = 0;

    for (const [key, their] of theirs) {
      const our = ours.get(key);
      if (!our) {
        coverageNotes++;
        continue;
      }
      sharedCount++;
      if (their.hasDescription && !our.hasDescription) {
        regressions.push(`${key}: theirs has a description, ours does not`);
      }
      // `@param`/`@returns` only make sense for functions. ts-defold-types hangs
      // property docs off some constants (e.g. physics.JOINT_TYPE_*) as `@param`;
      // our surface models those as table-field types, not constant params.
      if (our.kind === "function") {
        for (const param of their.paramNames) {
          // `this` is the TypeScript receiver, not a Defold parameter — ours
          // names the same receiver `self`. Neither is a documentable API arg.
          if (param === "this") continue;
          if (!our.paramNames.has(param)) {
            regressions.push(`${key}: theirs documents @param ${param}, ours does not`);
          }
        }
        // A `LuaMultiReturn` tuple already encodes every returned value in the
        // type; ours documents the shape there rather than collapsing it to one
        // `@returns` line as ts-defold-types does. Recorded in the audit.
        if (their.hasReturns && !our.hasReturns && !our.multiReturn) {
          regressions.push(`${key}: theirs has @returns, ours does not`);
        }
      }
      if (their.hasExample && !our.hasExample) {
        regressions.push(`${key}: theirs has @example, ours does not`);
      }
    }

    expect(sharedCount).toBeGreaterThan(0);
    if (regressions.length > 0) {
      throw new Error(
        `${regressions.length} doc regression(s) vs ts-defold-types ` +
          `(${sharedCount} shared symbols, ${coverageNotes} theirs-only coverage notes):\n` +
          regressions
            .slice(0, 30)
            .map((r) => `  - ${r}`)
            .join("\n"),
      );
    }
    expect(regressions).toEqual([]);
  });
});
