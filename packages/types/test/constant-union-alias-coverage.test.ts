import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadApiTargets, loadTargetModules } from "../scripts/regen";
import { parseDefoldApiDoc } from "../src/api-doc";
import {
  CONSTANT_UNION_ALIASES,
  type ConstantUnionAlias,
  constantUnionAlias,
  constantUnionSpelling,
} from "../src/emit-dts";

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
// namespace as the home, and their longest common `_`-delimited prefix as the
// name, in the reference's spelling that `engineTypeName` derives the declared
// name from. It is a starting point for the review, never a name the emitter may
// adopt on its own.
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
  const name = first.slice(0, shared).join("_");
  return `{ home: "${home}", name: "${name || "<pick one>"}", members: [${members
    .map((fqn) => `"${fqn}"`)
    .join(", ")}] }`;
}

const label = (row: ConstantUnionAlias): string =>
  "name" in row ? `${row.home}.${row.name}` : constantUnionSpelling(row);

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
    // A subset row declares nothing and collapses every slot it matches, so its
    // spelling at some slot is the only trace it leaves.
    const shipped = [
      ...generatedSurfaces(GENERATED_DIR).map(({ contents }) => contents),
      readFileSync(SIGNATURES_PATH, "utf8"),
    ];
    const unreachable = CONSTANT_UNION_ALIASES.filter((row) => {
      if (!("name" in row)) {
        const spelling = constantUnionSpelling(row);
        return !shipped.some((contents) => contents.includes(spelling));
      }
      const key = [...row.members].sort().join(",");
      return !emitted.has(key) && !declared.has(key);
    }).map((row) => `${label(row)} matches no emitted union`);
    expect(unreachable).toEqual([]);
  });
});

// Each retained target's `ENUM` elements by home namespace, keyed by their local
// path, parsed from the vendored reference with the production parser.
const targetEnums = loadApiTargets()
  .filter((target) => target.source == null)
  .map((target) => {
    const byHome = new Map<string, Map<string, readonly string[]>>();
    for (const entry of loadTargetModules(target)) {
      const module = parseDefoldApiDoc(entry.doc);
      const home = byHome.get(module.namespace) ?? new Map<string, readonly string[]>();
      for (const e of module.enums ?? []) {
        home.set(e.name.slice(module.namespace.length + 1), e.members);
      }
      byHome.set(module.namespace, home);
    }
    return { id: target.id, byHome };
  });

const memberKey = (members: readonly string[]): string => [...new Set(members)].sort().join(",");

describe("constant union names agree with the reference ENUM names", () => {
  test("some retained target documents an ENUM a row matches", () => {
    // Two-way: with no ENUM parsed the gates below would hold over nothing.
    const matched = targetEnums.flatMap(({ byHome }) =>
      CONSTANT_UNION_ALIASES.filter((row) =>
        [...(byHome.get(row.home)?.values() ?? [])].some(
          (members) => memberKey(members) === memberKey(row.members),
        ),
      ),
    );
    expect(matched.length).toBeGreaterThan(0);
  });

  test("a row whose member set equals an ENUM in its home carries that ENUM's name", () => {
    const misnamed: string[] = [];
    for (const { id, byHome } of targetEnums) {
      for (const row of CONSTANT_UNION_ALIASES) {
        for (const [local, members] of byHome.get(row.home) ?? []) {
          if (memberKey(members) !== memberKey(row.members)) continue;
          if ("name" in row && local === row.name) continue;
          misnamed.push(
            `${id}: ${label(row)} has the members of ENUM ${row.home}.${local} — name the row ${local}`,
          );
        }
      }
    }
    expect(misnamed).toEqual([]);
  });

  test("a row named after an ENUM in its home has that ENUM's member set", () => {
    const diverged: string[] = [];
    for (const { id, byHome } of targetEnums) {
      for (const row of CONSTANT_UNION_ALIASES) {
        if (!("name" in row)) continue;
        const members = byHome.get(row.home)?.get(row.name);
        if (members === undefined || memberKey(members) === memberKey(row.members)) continue;
        diverged.push(
          `${id}: ${row.home}.${row.name} row [${memberKey(row.members)}] vs ENUM [${memberKey(members)}]`,
        );
      }
    }
    expect(diverged).toEqual([]);
  });
});
