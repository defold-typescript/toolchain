import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EDITOR_VM_MODULE_MANIFEST, generateModuleDeclaration } from "../scripts/regen";
import { htmlToDocText } from "../src/doc-comment";
import { collectDeclaredFqns, type FixtureDoc, unexpressedFixtureNames } from "./declared-fqns";

const GLOBALS_PATH = resolve(import.meta.dir, "..", "src", "editor-vm-globals.d.ts");
const PPRINT_FIXTURE = resolve(
  import.meta.dir,
  "..",
  "fixtures",
  "defold-1.13.0",
  "editor_pprint_doc.json",
);

// The hand-authored file exists to carry exactly what the emitter cannot
// express, so its expected contents are *derived*, never listed: the bare global
// `pprint` (no namespace to hang off) plus every fixture element the editor VM
// emit leaves behind. A hardcoded member list would restate the file instead of
// checking it, and would go quietly stale the day upstream adds a constant.
function expectedMembers(): string[] {
  const pprint = JSON.parse(readFileSync(PPRINT_FIXTURE, "utf8")) as FixtureDoc;
  const bareGlobals = pprint.elements
    .filter((element) => element.type === "FUNCTION")
    .map((element) => element.name);
  const unexpressed = EDITOR_VM_MODULE_MANIFEST.flatMap((entry) =>
    unexpressedFixtureNames(entry.doc, generateModuleDeclaration(entry).contents),
  );
  return [...new Set([...bareGlobals, ...unexpressed])].sort();
}

// Upstream's own prose for each expected member, lowered by the same helper the
// emitter runs its JSDoc through, so the hand-authored comments cannot say
// something upstream does not.
function descriptionsByMember(): [string, string][] {
  const wanted = new Set(expectedMembers());
  const docs = [
    JSON.parse(readFileSync(PPRINT_FIXTURE, "utf8")) as FixtureDoc,
    ...EDITOR_VM_MODULE_MANIFEST.map((entry) => entry.doc as FixtureDoc),
  ];
  const out = new Map<string, string>();
  for (const doc of docs) {
    for (const element of doc.elements) {
      if (!wanted.has(element.name)) continue;
      const text = htmlToDocText(element.description ?? "");
      if (text !== "") out.set(element.name, text);
    }
  }
  return [...out];
}

// A member's enclosing namespaces are declarations too; the file needs them to
// nest anything at all, so they belong in the expected set rather than in an
// exclusion filter.
function withContainers(members: readonly string[]): Set<string> {
  const out = new Set<string>(members);
  for (const member of members) {
    const segments = member.split(".");
    for (let i = 1; i < segments.length; i++) out.add(segments.slice(0, i).join("."));
  }
  return out;
}

describe("hand-authored editor VM globals parity", () => {
  test("declares exactly the surfaces the emitter drops, and nothing else", () => {
    const declared = collectDeclaredFqns(readFileSync(GLOBALS_PATH, "utf8"));
    const expected = withContainers(expectedMembers());
    expect([...declared].sort()).toEqual([...expected].sort());
  });

  test("the derived expectation is non-empty, so an empty file cannot pass", () => {
    const members = expectedMembers();
    expect(members).toContain("pprint");
    expect(members).toContain("zip.METHOD.DEFLATED");
    // One deliberately skipped function per shape the emitter cannot render:
    // a return upstream records as empty, and optionals before a required
    // argument. Naming them keeps un-skipping a function without dropping its
    // hand-authored form a failure by name, not only through the derived set.
    expect(members).toContain("json.decode");
    expect(members).toContain("zip.unpack");
    expect(members.length).toBeGreaterThan(5);
  });

  test("documents each member with its own upstream description, run through the shared HTML lowering", () => {
    const contents = readFileSync(GLOBALS_PATH, "utf8");
    const missing = descriptionsByMember().filter(([, text]) => !contents.includes(text));
    expect(missing.map(([name]) => name)).toEqual([]);
  });
});
