import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

const GENERATED = resolve(import.meta.dir, "..", "generated");

function collectDts(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectDts(full));
    } else if (entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function offGridLines(content: string): { line: number; text: string }[] {
  const offending: { line: number; text: string }[] = [];
  const lines = content.split("\n");
  let inBlock = false;
  lines.forEach((raw, index) => {
    const trimmed = raw.trimStart();
    if (!inBlock) {
      if (trimmed.startsWith("/**")) {
        inBlock = !raw.includes("*/");
      }
      return;
    }
    if (trimmed.startsWith("*")) {
      if (raw.includes("*/")) inBlock = false;
      return;
    }
    offending.push({ line: index + 1, text: raw });
    if (raw.includes("*/")) inBlock = false;
  });
  return offending;
}

describe("generated JSDoc well-formedness", () => {
  test.each(
    collectDts(GENERATED).map((path) => [path.slice(GENERATED.length + 1), path] as const),
  )("%s: every line inside a /** */ block begins with *", async (_label, path) => {
    const content = await Bun.file(path).text();
    const offending = offGridLines(content);
    if (offending.length > 0) {
      const sample = offending
        .slice(0, 5)
        .map((o) => `  line ${o.line}: ${JSON.stringify(o.text)}`)
        .join("\n");
      throw new Error(
        `${offending.length} JSDoc continuation line(s) off-grid — run \`bun run regen\`:\n${sample}`,
      );
    }
    expect(offending).toEqual([]);
  });
});
