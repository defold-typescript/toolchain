import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { CONSTANT_UNION_ALIASES, constantUnionAlias } from "../src/emit-dts";

const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const GENERATED_DIR = join(PACKAGE_ROOT, "generated");
const SIGNATURES_PATH = join(PACKAGE_ROOT, "api-signatures.json");

const BRAND_ARM = /number & \{ readonly __brand: "([^"]+)" \}/g;
// A run of two or more branded arms joined by ` | ` — the wall an unnamed
// constant union renders as.
const BRAND_UNION =
  /number & \{ readonly __brand: "[^"]+" \}(?: \| number & \{ readonly __brand: "[^"]+" \})+/g;

interface Occurrence {
  readonly where: string;
  readonly members: readonly string[];
}

function scan(text: string, where: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (const run of text.matchAll(BRAND_UNION)) {
    const members: string[] = [];
    for (const arm of (run[0] as string).matchAll(BRAND_ARM)) members.push(arm[1] as string);
    const distinct = [...new Set(members)];
    if (distinct.length < 2) continue;
    out.push({ where, members: distinct });
  }
  return out;
}

function generatedSurfaces(dir: string): { path: string; contents: string }[] {
  const out: { path: string; contents: string }[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...generatedSurfaces(path));
      continue;
    }
    if (!entry.name.endsWith(".d.ts")) continue;
    out.push({ path: relative(PACKAGE_ROOT, path), contents: readFileSync(path, "utf8") });
  }
  return out;
}

// The row a human would review for an unnamed set: the members' shared
// namespace as the home, and their longest common `_`-delimited prefix
// PascalCased as the name. It is a starting point for the review, never a name
// the emitter may adopt on its own.
function suggestedRow(members: readonly string[]): string {
  const namespaces = [...new Set(members.map((fqn) => fqn.slice(0, fqn.lastIndexOf("."))))];
  const home = namespaces.length === 1 ? (namespaces[0] as string) : "<pick one>";
  const locals = members.map((fqn) => fqn.slice(fqn.lastIndexOf(".") + 1));
  const first = (locals[0] as string).split("_");
  let shared = first.length;
  for (const local of locals) {
    const parts = local.split("_");
    let i = 0;
    while (i < shared && i < parts.length && parts[i] === first[i]) i += 1;
    shared = i;
  }
  const name = first
    .slice(0, shared)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join("");
  return `{ home: "${home}", name: "${name || "<pick one>"}", members: [${members
    .map((fqn) => `"${fqn}"`)
    .join(", ")}] }`;
}

const occurrences: Occurrence[] = [
  ...generatedSurfaces(GENERATED_DIR).flatMap(({ path, contents }) => scan(contents, path)),
  ...scan(readFileSync(SIGNATURES_PATH, "utf8"), relative(PACKAGE_ROOT, SIGNATURES_PATH)),
];

describe("constant union alias coverage", () => {
  test("the shipped surfaces still carry branded constants to read", () => {
    // Two-way: an empty corpus would leave the gate below green while proving
    // nothing, which is exactly how a broken scan hides a wall.
    const branded = generatedSurfaces(GENERATED_DIR).filter(({ contents }) =>
      contents.includes("__brand: "),
    );
    expect(branded.length).toBeGreaterThan(0);
  });

  test("every documented constant union of two or more arms has a reviewed alias", () => {
    const unnamed = occurrences.filter(({ members }) => constantUnionAlias(members) === undefined);
    const report = [
      ...new Map(
        unnamed.map((occurrence) => [
          [...occurrence.members].sort().join(","),
          `${occurrence.where}: ${occurrence.members.length} arms with no CONSTANT_UNION_ALIASES row — review and add ${suggestedRow(occurrence.members)}`,
        ]),
      ).values(),
    ].sort();
    expect(report).toEqual([]);
  });

  test("every row is reachable — its member set is a union some surface emits", () => {
    // The mirror of the gate above: a row nobody's signature resolves to names a
    // public type with no members behind it, which an upstream rename produces
    // silently.
    const emitted = new Set(occurrences.map(({ members }) => [...members].sort().join(",")));
    const declared = new Set<string>();
    for (const { contents } of generatedSurfaces(GENERATED_DIR)) {
      for (const match of contents.matchAll(
        /^\s*(?:export )?type ([A-Za-z0-9_]+) = (typeof [A-Za-z0-9_.]+(?: \| typeof [A-Za-z0-9_.]+)+);$/gm,
      )) {
        declared.add(
          (match[2] as string)
            .split(" | ")
            .map((arm) => arm.slice("typeof ".length))
            .sort()
            .join(","),
        );
      }
    }
    const unreachable = CONSTANT_UNION_ALIASES.filter((row) => {
      const key = [...row.members].sort().join(",");
      return !emitted.has(key) && !declared.has(key);
    }).map((row) => `${row.home}.${row.name} matches no emitted union`);
    expect(unreachable).toEqual([]);
  });
});
