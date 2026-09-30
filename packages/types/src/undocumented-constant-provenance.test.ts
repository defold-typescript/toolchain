import { describe, expect, test } from "bun:test";
import { readBindingsForTarget } from "../scripts/engine-binding-extract";
import { committedFieldCorrectionTargets } from "../scripts/regen";
import { parseDefoldApiDoc } from "./api-doc";
import { UNDOCUMENTED_CONSTANTS } from "./emit-dts";

function namespaceOf(fqn: string): { namespace: string; name: string } {
  const dot = fqn.lastIndexOf(".");
  return { namespace: fqn.slice(0, dot), name: fqn.slice(dot + 1) };
}

// An entry earns its place only while some committed target's engine registers
// the constant and some committed target's ref-doc leaves it out.
describe("UNDOCUMENTED_CONSTANTS provenance", () => {
  const targets = committedFieldCorrectionTargets();

  test("every entry is registered by at least one committed target's engine bindings", () => {
    const registered = targets.map(({ id }) => readBindingsForTarget(id).constants);
    const unregistered = [...UNDOCUMENTED_CONSTANTS.keys()].filter((fqn) => {
      const { namespace, name } = namespaceOf(fqn);
      return !registered.some((constants) => constants.get(namespace)?.includes(name) === true);
    });
    expect(unregistered).toEqual([]);
  });

  test("every entry is omitted by at least one committed target's ref-doc", () => {
    const declared = targets.map(
      ({ entries }) =>
        new Set(
          entries.flatMap((entry) => parseDefoldApiDoc(entry.doc).constants.map((c) => c.name)),
        ),
    );
    const alwaysDocumented = [...UNDOCUMENTED_CONSTANTS.keys()].filter((fqn) =>
      declared.every((names) => names.has(fqn)),
    );
    expect(alwaysDocumented).toEqual([]);
  });
});
